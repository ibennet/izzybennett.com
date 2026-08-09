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

### 2. Expose it with a public VPS + Caddy

DNS for `izzybennett.com` stays on Google/Squarespace, so instead of a Cloudflare Tunnel (which
would need the whole zone on Cloudflare) a small free VPS acts as the public front door: Caddy
terminates Let's Encrypt TLS and reverse-proxies to the Pi over a private Tailscale link.

**a. Provision a free VPS.** e.g. an Oracle Cloud Always Free instance (Ubuntu). Note its public
IPv4 (and IPv6 if assigned). Open TCP **80** and **443** in *both* the cloud security list *and* the
instance firewall (Oracle blocks them by default in both places).

**b. Link the Pi and VPS with Tailscale** (free). Install it on both, `sudo tailscale up` on each,
then grab the Pi's Tailscale IP:

```sh
tailscale ip -4   # on the Pi → 100.x.y.z
```

Confirm the VPS can reach the server (after the Pi service from step 1 is running):

```sh
curl http://<pi-tailscale-ip>:8000/health   # from the VPS → {"ok":true}
```

**c. Run Caddy on the VPS.** `/etc/caddy/Caddyfile`:

```
orders.izzybennett.com {
    reverse_proxy http://<pi-tailscale-ip>:8000
}
```

```sh
sudo systemctl enable --now caddy
```

Caddy auto-provisions the cert once the DNS record below resolves to the VPS.

**d. Add the DNS record (Squarespace panel).** In the Squarespace domains dashboard for
`izzybennett.com` → **DNS Settings → Custom Records**, add an **A** record: host `orders`, value =
the VPS public IPv4 (add a matching **AAAA** record if the VPS has IPv6). Leave the apex, `www`, and
Mailgun MX/SPF records untouched.

```sh
curl https://orders.izzybennett.com/health   # after propagation → {"ok":true}, valid cert
```

### 3. Point the site at it

Set the GitHub Actions repo variable so the build bakes the API base into the site:

**Settings → Secrets and variables → Actions → Variables → New variable**
`PUBLIC_ORDER_API = https://orders.izzybennett.com`

Then push to `master` (or re-run the deploy workflow) so the site rebuilds against it. `deploy.yml`
already forwards `PUBLIC_ORDER_API` into the build.
