# Izzy's Cafe order server

A tiny FastAPI + SQLite server that backs the home-cafe ordering flow:

- **`izzybennett.com/order`** → `POST /orders` (place an order)
- **`izzybennett.com/orders`** → `GET /orders` (kitchen queue, polled) + `PATCH /orders/{id}` (advance status)

It runs on a **Raspberry Pi** on the home wifi. Because the site is HTTPS on GitHub Pages, the
browser can't reach a plain-HTTP Pi on the LAN directly, so the Pi exposes this server through a free
**Cloudflare Tunnel** at a stable public HTTPS hostname (`https://orders.izzybennett.com`). No port
forwarding, valid TLS, works on and off wifi.

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
ExecStart=/home/pi/izzybennett.com/order-server/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now izzy-orders
curl localhost:8000/health   # should return {"ok":true}
```

### 2. Expose it with a Cloudflare Tunnel

Requires izzybennett.com's DNS to be on Cloudflare (free; GitHub Pages keeps working via a CNAME).

```sh
# install cloudflared (see Cloudflare docs for your arch), then:
cloudflared tunnel login
cloudflared tunnel create izzy-orders
cloudflared tunnel route dns izzy-orders orders.izzybennett.com
```

Config `~/.cloudflared/config.yml`:

```yaml
tunnel: izzy-orders
credentials-file: /home/pi/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: orders.izzybennett.com
    service: http://localhost:8000
  - service: http_status:404
```

Run it as a service:

```sh
sudo cloudflared service install
sudo systemctl enable --now cloudflared
curl https://orders.izzybennett.com/health   # should return {"ok":true}
```

### 3. Point the site at it

Set the GitHub Actions repo variable so the build bakes the API base into the site:

**Settings → Secrets and variables → Actions → Variables → New variable**
`PUBLIC_ORDER_API = https://orders.izzybennett.com`

Then push to `master` (or re-run the deploy workflow) so the site rebuilds against it. `deploy.yml`
already forwards `PUBLIC_ORDER_API` into the build.
