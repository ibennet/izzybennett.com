# Deploy scripts

Turnkey, idempotent setup scripts that automate **section 2** of the parent
[`order-server/README.md`](../README.md) — running the order server on the Pi and
fronting it with a public VPS + Caddy over Tailscale. One command per box instead of
copy-pasting the README by hand.

```
deploy/
├── pi-setup.sh          # run on the Raspberry Pi  (do this first)
├── vps-setup.sh         # run on the VPS (needs the Pi's Tailscale IP)
├── izzy-orders.service  # canonical systemd unit template (rendered by pi-setup.sh)
├── Caddyfile.example    # canonical Caddyfile template (rendered by vps-setup.sh)
└── gcp.md               # Google Cloud runbook (use this instead of the Oracle steps below)
```

**Using Google Cloud?** The live-site VPS runs on a GCP `e2-micro`, not Oracle. Follow
[`gcp.md`](./gcp.md) — it covers launching the VM, reserving a static IP, and the VPC firewall
rule, then has you run `vps-setup.sh --skip-firewall <PI_TS_IP>` (GCP has no restrictive default
iptables, so the on-box firewall step is skipped). `pi-setup.sh` is identical either way. The
Oracle steps below stay as the fallback path.

Both scripts use `set -euo pipefail`, guard every step so re-running is safe, and print
clear progress + next-step messages.

## Run order

Tailscale IPs flow **Pi → VPS**, so the Pi goes first.

### 1. On the Raspberry Pi

Assumes the repo is already cloned to `/home/pi/izzybennett.com` and the venv exists
(parent README "Run locally" + step 1). The script sanity-checks both and stops with
instructions if either is missing — it does **not** recreate the venv.

```sh
cd /home/pi/izzybennett.com/order-server/deploy
sudo ./pi-setup.sh
```

It installs Tailscale (reminding you to run `sudo tailscale up`), installs/refreshes the
`izzy-orders` systemd service (binds `0.0.0.0:8000`), starts it, smoke-tests
`localhost:8000/health`, and **prints the Pi's Tailscale IP** — copy that for the next
step.

### 2. On the VPS

```sh
cd ~/izzybennett.com/order-server/deploy   # or wherever you copied deploy/
sudo ./vps-setup.sh <PI_TS_IP>                 # Oracle (default)
sudo ./vps-setup.sh --skip-firewall <PI_TS_IP> # GCP (VPC firewall rule handles ingress)
```

It opens TCP 80 + 443 in the instance firewall (inserted **above** Oracle's default
`REJECT` rule and persisted with `netfilter-persistent`), installs Tailscale (reminding
you to `sudo tailscale up`), installs Caddy from its official apt repo, writes
`/etc/caddy/Caddyfile` (`orders.izzybennett.com` → `<PI_TS_IP>:8000`), and restarts
Caddy.

On **GCP** pass `--skip-firewall` (or `SKIP_FIREWALL=1`): the on-box iptables step is
skipped since GCP has no restrictive default firewall — ingress is a VPC rule you create
per [`gcp.md`](./gcp.md). Tailscale + Caddy + Caddyfile are identical.

### 3. Add the DNS record (Squarespace)

The scripts can't touch DNS. In the Squarespace panel for `izzybennett.com` →
**DNS Settings → Custom Records**, add an **A** record: host `orders`, value = the VPS's
public IPv4 (plus a matching **AAAA** if it has IPv6). Caddy auto-issues the Let's
Encrypt cert once that record resolves to the VPS.

```sh
curl https://orders.izzybennett.com/health   # after propagation → {"ok":true}, valid cert
```

Then point the site at it (parent README step 3): set the GitHub Actions repo variable
`PUBLIC_ORDER_API = https://orders.izzybennett.com` and redeploy.

## Steps the scripts can't do for you

- **Sign up for the VPS** (Oracle Cloud Always Free) and note its public IPv4.
- **`sudo tailscale up`** on both boxes — Tailscale auth needs an interactive browser
  login; the scripts install Tailscale and remind you, but can't authenticate for you.
- **Oracle console firewall:** add ingress rules for TCP 80 + 443 to the instance's VCN
  Security List / NSG. `vps-setup.sh` only opens the on-box (iptables) firewall; Oracle
  blocks these in *both* places.
- **The Squarespace A record** (step 3 above).
