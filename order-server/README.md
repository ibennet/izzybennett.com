# Izzy's Cafe order server

A tiny FastAPI + SQLite server that backs the home-cafe ordering flow:

- **`izzybennett.com/order`** → `POST /orders` (place an order)
- **`izzybennett.com/orders`** → `GET /orders` (kitchen queue, polled) + `PATCH /orders/{id}` (advance status)

It runs on a **Raspberry Pi** on the home wifi. Because the site is HTTPS on GitHub Pages, the
browser can't reach a plain-HTTP Pi on the LAN directly, so the Pi is fronted by a **free VPS running
Caddy** at a stable public HTTPS hostname (`https://orders.izzybennett.com`): Caddy terminates
Let's Encrypt TLS and reverse-proxies to the Pi over a private **Tailscale** link. No port forwarding,
valid TLS, works on and off wifi. (`izzybennett.com` DNS stays on Google/Squarespace — the public
hostname is just an `A` record pointing at the VPS.)

There is **no auth** — anyone with the link can place an order or watch the board (by design for a
home cafe). CORS is locked to the site origin so only izzybennett.com can call it from a browser.

## API

| Method | Path             | Body                                                    | Notes |
| ------ | ---------------- | ------------------------------------------------------- | ----- |
| GET    | `/health`        | —                                                       | `{ "ok": true }` |
| POST   | `/orders`        | `{ drink, name, milk?, syrups?[], notes? }`             | creates a `new` order (drink + name required) |
| GET    | `/orders?since=` | —                                                       | active (non-archived) orders, newest first; `since=<id>` for cheap polling |
| PATCH  | `/orders/{id}`   | `{ status }`                                            | `new` \| `making` \| `done` \| `archived` |

The menu itself is **not** stored here — the order form is built from the site's own
`/izzys-cafe.json` feed (parsed from `src/content/pages/izzys-cafe.md`), so the menu stays a single
source of truth.

## Run locally

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

`orders.db` is created next to `main.py` on first run (gitignored).

Smoke test:

```sh
curl localhost:8000/health
curl -X POST localhost:8000/orders -H 'content-type: application/json' \
  -d '{"drink":"Matcha","milk":"Oat","syrups":["Cardamom"],"name":"Izzy"}'
curl localhost:8000/orders
curl -X PATCH localhost:8000/orders/1 -H 'content-type: application/json' -d '{"status":"making"}'
```

To test the site against it: `PUBLIC_ORDER_API=http://localhost:8000 npm run dev` (from the repo root),
then open `/order` and `/orders`.

## Deploy on the Raspberry Pi

### 1. Run the server as a service

Clone the repo (or copy this `order-server/` dir) to the Pi, create the venv as above, then add a
systemd unit `/etc/systemd/system/izzy-orders.service`:

```ini
[Unit]
Description=Izzy's Cafe order server
After=network.target

[Service]
WorkingDirectory=/home/pi/izzybennett.com/order-server
# Bind so the VPS can reach it over Tailscale. Use the Pi's Tailscale IP (100.x.y.z), or
# 0.0.0.0 — Tailscale + home NAT keep 8000 off the public internet either way.
ExecStart=/home/pi/izzybennett.com/order-server/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now izzy-orders
curl localhost:8000/health   # should return {"ok":true}
```

### 2. Expose it with a public VM + Caddy

DNS for `izzybennett.com` stays on Squarespace, so instead of a Cloudflare Tunnel (which would need
the whole zone on Cloudflare) a small always-on VM is the public front door: Caddy terminates
Let's Encrypt TLS and reverse-proxies to the Pi over a private Tailscale link. The deployment uses a
Google Cloud `e2-micro` (free-tier compute; the only real cost is ~$3.65/mo for its static IP), but
any Ubuntu VM with a public IP works the same way.

**a. Create the VM.** GCP Compute Engine → `e2-micro`, **Ubuntu 24.04 LTS**, in a free-tier region
(`us-west1`/`us-central1`/`us-east1`), 30 GB **Standard** disk. Tick **Allow HTTP** + **Allow HTTPS
traffic**, and reserve a **static external IP** so the DNS record stays valid across reboots. Note
the external IP.

**b. Link the Pi and VM with Tailscale** (free). Install it on both, `sudo tailscale up` on each with
the *same* account, then grab the Pi's Tailscale IP:

```sh
tailscale ip -4   # on the Pi → 100.x.y.z
```

**c. Bind the Pi server so the VM can reach it.** The service binds loopback (`127.0.0.1`) by
default. On an existing systemd install, add a drop-in rather than editing the base unit:

```sh
sudo mkdir -p /etc/systemd/system/izzy-orders.service.d
sudo tee /etc/systemd/system/izzy-orders.service.d/override.conf >/dev/null <<'EOF'
[Service]
ExecStart=
ExecStart=/opt/izzy-orders/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
EOF
sudo systemctl daemon-reload && sudo systemctl restart izzy-orders
```

Confirm the tunnel from the **VM**: `curl http://<pi-tailscale-ip>:8000/health` → `{"ok":true}`.
(`0.0.0.0` also exposes the server on the home LAN, which is harmless behind home NAT; bind the Pi's
Tailscale IP instead if you want to lock it to the tailnet.)

**d. Run Caddy on the VM.** Install Caddy (official apt repo), then `/etc/caddy/Caddyfile`:

```
orders.izzybennett.com {
    reverse_proxy <pi-tailscale-ip>:8000
}
```

```sh
sudo systemctl restart caddy
```

Caddy auto-provisions the cert once the DNS record below resolves to the VM.

**e. Add the DNS record (Squarespace panel).** In the Squarespace domains dashboard for
`izzybennett.com` → **DNS Settings → Custom Records**, add an **A** record: host `orders`, value =
the VM's static IP. Leave the apex, `www`, and Mailgun MX/SPF records untouched.

```sh
curl https://orders.izzybennett.com/health   # after propagation → {"ok":true}, valid cert
```

### 3. Point the site at it

Set the GitHub Actions repo variable so the build bakes the API base into the site:

**Settings → Secrets and variables → Actions → Variables → New variable**
`PUBLIC_ORDER_API = https://orders.izzybennett.com`

Then push to `master` (or re-run the deploy workflow) so the site rebuilds against it. `deploy.yml`
already forwards `PUBLIC_ORDER_API` into the build.
