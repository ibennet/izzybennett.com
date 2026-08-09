#!/usr/bin/env bash
#
# vps-setup.sh — set up the public front door on a fresh Oracle Cloud (Ubuntu) VPS.
#
# Automates order-server/README.md step 2 (the VPS half): opens TCP 80/443 in the
# instance firewall the way Oracle's image needs, installs Tailscale, installs Caddy
# from its official apt repo, and writes a Caddyfile that reverse-proxies
# orders.izzybennett.com to the Pi over Tailscale.
#
# Run pi-setup.sh FIRST — it prints the Pi's Tailscale IP, which is the required input
# here.
#
# Idempotent: safe to re-run to refresh the Caddyfile or re-open the ports.
#
# Usage:
#   sudo ./vps-setup.sh <PI_TS_IP>
#   sudo PI_TS_IP=100.x.y.z ./vps-setup.sh
#
set -euo pipefail

# --- config -----------------------------------------------------------------------
SITE_HOST="${SITE_HOST:-orders.izzybennett.com}"
PI_PORT="${PI_PORT:-8000}"
CADDYFILE="/etc/caddy/Caddyfile"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
	echo "Please run as root (sudo ./vps-setup.sh <PI_TS_IP>)." >&2
	exit 1
fi

# --- 0. require the Pi's Tailscale IP ---------------------------------------------
PI_TS_IP="${1:-${PI_TS_IP:-}}"
if [[ -z "$PI_TS_IP" ]]; then
	echo "ERROR: the Pi's Tailscale IP is required." >&2
	echo "Get it on the Pi with 'tailscale ip -4', then:" >&2
	echo "    sudo ./vps-setup.sh <PI_TS_IP>" >&2
	echo "    (or: sudo PI_TS_IP=100.x.y.z ./vps-setup.sh)" >&2
	exit 1
fi
# Light shape check — Tailscale IPs live in 100.64.0.0/10 (CGNAT range).
if [[ ! "$PI_TS_IP" =~ ^100\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
	warn "PI_TS_IP='$PI_TS_IP' doesn't look like a Tailscale IPv4 (expected 100.x.y.z). Continuing anyway."
fi
say "Fronting Pi at ${PI_TS_IP}:${PI_PORT} as https://${SITE_HOST}"

export DEBIAN_FRONTEND=noninteractive

# --- 1. open TCP 80 + 443 (Oracle firewall gotcha) --------------------------------
# Oracle's Ubuntu image ships an INPUT chain that ends with a catch-all REJECT rule.
# A rule appended AFTER that REJECT never matches, so new ACCEPT rules must be INSERTED
# ABOVE it. We find the REJECT rule's line number and insert just before it (falling
# back to a plain insert at the top if there's no REJECT). `-C` makes it idempotent.
#
# NOTE: this only handles the *instance* firewall. You must ALSO add ingress rules for
# TCP 80 + 443 in the Oracle console (VCN Security List / NSG) — that's a web-console
# step this script can't do.
open_port() {
	local ipt="$1" port="$2"
	if "$ipt" -C INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
		echo "  ${ipt}: port ${port} already open — skipping."
		return
	fi
	# Line number of the first REJECT rule in INPUT, if any.
	local reject_line
	reject_line="$("$ipt" -L INPUT --line-numbers -n 2>/dev/null | awk '$2 == "REJECT" {print $1; exit}')"
	if [[ -n "${reject_line:-}" ]]; then
		echo "  ${ipt}: inserting port ${port} ACCEPT above REJECT (line ${reject_line})."
		"$ipt" -I INPUT "$reject_line" -m state --state NEW -p tcp --dport "$port" -j ACCEPT
	else
		echo "  ${ipt}: no REJECT rule found — inserting port ${port} ACCEPT at top."
		"$ipt" -I INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT
	fi
}

say "Opening TCP 80 + 443 in the instance firewall"
for port in 80 443; do
	open_port iptables "$port"
	# Mirror on IPv6 if the image uses an ip6tables REJECT too (harmless otherwise).
	if command -v ip6tables >/dev/null 2>&1; then
		open_port ip6tables "$port"
	fi
done

# --- 2. persist the firewall rules ------------------------------------------------
say "Persisting firewall rules with netfilter-persistent"
if ! command -v netfilter-persistent >/dev/null 2>&1; then
	echo "  Installing iptables-persistent (provides netfilter-persistent)…"
	apt-get update -y
	apt-get install -y iptables-persistent
fi
netfilter-persistent save
echo "  Saved (survives reboot)."

# --- 3. Tailscale -----------------------------------------------------------------
say "Installing Tailscale"
if command -v tailscale >/dev/null 2>&1; then
	echo "  Already installed — skipping."
else
	curl -fsSL https://tailscale.com/install.sh | sh
fi
if tailscale status >/dev/null 2>&1; then
	echo "  Tailscale is already up."
else
	warn "Tailscale installed but not connected. Run:  sudo tailscale up"
	warn "Caddy can't reach the Pi until the VPS is on the tailnet."
fi

# --- 4. Caddy (official apt repo) -------------------------------------------------
# Steps per https://caddyserver.com/docs/install (stable Cloudsmith repo).
say "Installing Caddy from the official apt repo"
if command -v caddy >/dev/null 2>&1; then
	echo "  Caddy already installed — skipping repo setup."
else
	apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
		| gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
		| tee /etc/apt/sources.list.d/caddy-stable.list
	chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	chmod o+r /etc/apt/sources.list.d/caddy-stable.list
	apt-get update -y
	apt-get install -y caddy
fi

# --- 5. write the Caddyfile -------------------------------------------------------
say "Writing $CADDYFILE"
# Render from the canonical template next to this script, substituting the placeholder;
# fall back to writing it inline if the template isn't alongside the script.
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$TEMPLATE_DIR/Caddyfile.example" ]]; then
	sed "s#<PI_TS_IP>#$PI_TS_IP#g; s#:8000#:$PI_PORT#g; s#orders.izzybennett.com#$SITE_HOST#g" \
		"$TEMPLATE_DIR/Caddyfile.example" >"$CADDYFILE"
else
	cat >"$CADDYFILE" <<EOF
${SITE_HOST} {
	reverse_proxy ${PI_TS_IP}:${PI_PORT}
}
EOF
fi
echo "  Wrote reverse proxy ${SITE_HOST} -> ${PI_TS_IP}:${PI_PORT}"

# Validate before (re)starting so a bad file doesn't take Caddy down.
if caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
	echo "  Caddyfile validates."
else
	warn "caddy validate reported an issue — check $CADDYFILE before continuing."
fi

say "Enabling + restarting Caddy"
systemctl enable caddy >/dev/null
systemctl restart caddy
echo "  Caddy restarted."

# --- done -------------------------------------------------------------------------
say "VPS setup complete"
cat <<EOF

Still to do by hand:
  1. Oracle console: add ingress rules for TCP 80 + 443 to this instance's VCN
     Security List (or NSG). The script only opened the on-box firewall.
  2. If you haven't: 'sudo tailscale up' on THIS VPS (and on the Pi) so Caddy can
     reach ${PI_TS_IP}:${PI_PORT}.
  3. Squarespace DNS: add an A record  host 'orders'  ->  this VPS's public IPv4
     (and a matching AAAA if it has IPv6). Caddy auto-issues the TLS cert once that
     record resolves here.

Verify once DNS propagates:
    curl https://${SITE_HOST}/health   # -> {"ok":true} with a valid cert
EOF
