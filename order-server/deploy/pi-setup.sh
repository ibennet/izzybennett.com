#!/usr/bin/env bash
#
# pi-setup.sh — set up Izzy's Cafe order server on the Raspberry Pi.
#
# Automates order-server/README.md step 1 (systemd service) + the Pi half of step 2
# (Tailscale). Run this FIRST — it prints the Pi's Tailscale IP at the end, which you
# then feed into vps-setup.sh on the VPS.
#
# Assumes the repo is already cloned to /home/pi/izzybennett.com and the venv already
# exists (README "Run locally" / step 1). It does NOT recreate the venv.
#
# Idempotent: safe to re-run to refresh the unit or pick up a new Tailscale install.
#
# Usage:
#   sudo ./pi-setup.sh
#
set -euo pipefail

# --- config (override via env if your layout differs) -----------------------------
REPO_DIR="${REPO_DIR:-/home/pi/izzybennett.com}"
APP_DIR="${APP_DIR:-$REPO_DIR/order-server}"
VENV_DIR="${VENV_DIR:-$APP_DIR/.venv}"
SERVICE_NAME="izzy-orders"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
RUN_USER="${RUN_USER:-pi}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
	echo "Please run as root (sudo ./pi-setup.sh)." >&2
	exit 1
fi

# --- 0. sanity check: venv + app must already exist -------------------------------
say "Checking the app + venv exist (README step 1)"
if [[ ! -f "$APP_DIR/main.py" ]]; then
	echo "Could not find $APP_DIR/main.py — clone the repo to $REPO_DIR first." >&2
	exit 1
fi
if [[ ! -x "$VENV_DIR/bin/uvicorn" ]]; then
	echo "No venv uvicorn at $VENV_DIR/bin/uvicorn." >&2
	echo "Create it first (from $APP_DIR):" >&2
	echo "    python -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
	exit 1
fi
echo "Found $APP_DIR/main.py and $VENV_DIR/bin/uvicorn."

# --- 1. Tailscale -----------------------------------------------------------------
say "Installing Tailscale"
if command -v tailscale >/dev/null 2>&1; then
	echo "Tailscale already installed — skipping."
else
	curl -fsSL https://tailscale.com/install.sh | sh
fi

# Bring the tailnet up only if it isn't already (needs interactive auth in a browser).
if tailscale status >/dev/null 2>&1; then
	echo "Tailscale is already up."
else
	warn "Tailscale is installed but not connected."
	warn "Run:  sudo tailscale up"
	warn "…then re-run this script (or just re-run the print-IP step at the end)."
fi

# --- 2. systemd unit --------------------------------------------------------------
say "Installing/refreshing the ${SERVICE_NAME} systemd unit"
# Render from the canonical template next to this script, substituting the paths above
# so the unit matches wherever the repo actually lives.
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$TEMPLATE_DIR/izzy-orders.service" ]]; then
	sed \
		-e "s#/home/pi/izzybennett.com/order-server#$APP_DIR#g" \
		-e "s#^User=.*#User=$RUN_USER#" \
		"$TEMPLATE_DIR/izzy-orders.service" >"$SERVICE_FILE"
else
	# Fallback: write the unit inline if the template isn't alongside the script.
	cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=Izzy's Cafe order server
After=network.target

[Service]
WorkingDirectory=$APP_DIR
ExecStart=$VENV_DIR/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
User=$RUN_USER

[Install]
WantedBy=multi-user.target
EOF
fi
echo "Wrote $SERVICE_FILE"

say "Enabling + (re)starting the service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"

# Give uvicorn a moment, then smoke test.
sleep 2
say "Smoke test: curl localhost:8000/health"
if curl -fsS localhost:8000/health; then
	echo
	echo "Service is up."
else
	echo
	warn "Health check failed — inspect logs with:  journalctl -u $SERVICE_NAME -e"
fi

# --- 3. print the Tailscale IP for the VPS step -----------------------------------
say "Pi Tailscale IP (paste this into vps-setup.sh on the VPS)"
if PI_TS_IP="$(tailscale ip -4 2>/dev/null | head -n1)" && [[ -n "$PI_TS_IP" ]]; then
	echo
	echo "    PI_TS_IP = $PI_TS_IP"
	echo
	echo "Next: on the VPS run  sudo ./vps-setup.sh $PI_TS_IP"
else
	warn "Couldn't read the Tailscale IP — run 'sudo tailscale up' first, then:"
	warn "    tailscale ip -4"
fi
