# GCP runbook (Google Cloud front door)

Copy-paste steps to run the public front door on a **Google Cloud `e2-micro`** VM instead of
Oracle. Same architecture as [`README.md`](./README.md): the VM runs Caddy (Let's Encrypt) and
reverse-proxies to the Pi over Tailscale; the `orders` A record on Squarespace points at the VM's
static external IP.

Everything except the firewall is identical to the Oracle path — GCP's Ubuntu image has **no
restrictive default iptables**, so ingress is controlled by a **VPC firewall rule** (gcloud) rather
than on-box iptables. That's why `vps-setup.sh` is run here with **`--skip-firewall`**.

All commands assume `gcloud` is installed and authenticated (`gcloud init`) with your project set:

```sh
gcloud config set project YOUR_PROJECT_ID
```

---

## 1. Pick a free-tier region

The free `e2-micro` is only free in **`us-west1` (Oregon)**, **`us-central1` (Iowa)**, or
**`us-east1` (South Carolina)**. An `e2-micro` in any other region bills normally. Pick one and use
it consistently below (examples use `us-west1` / zone `us-west1-a`).

```sh
REGION=us-west1
ZONE=us-west1-a
```

## 2. Reserve a static external IP

Reserve it first so the A record survives a VM stop/start (an ephemeral IP changes on stop). Use the
**Standard** network tier to stay in the free egress lane.

```sh
gcloud compute addresses create izzy-orders-ip \
  --region="$REGION" \
  --network-tier=STANDARD

# Note the address — you'll paste it into the Squarespace A record later:
gcloud compute addresses describe izzy-orders-ip \
  --region="$REGION" --format='get(address)'
```

## 3. Create the e2-micro VM (Ubuntu 24.04 LTS)

Free-tier shape: `e2-micro`, 30 GB standard persistent disk, Standard network tier, in a free-tier
region. The `--address` attaches the static IP from step 2; `--tags=orders-web` is the network tag
the firewall rule targets in step 4.

```sh
gcloud compute instances create izzy-orders-vps \
  --zone="$ZONE" \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --network-tier=STANDARD \
  --address=izzy-orders-ip \
  --tags=orders-web
```

> Already created the VM without the tag? Add it: > > ```sh > gcloud compute instances add-tags izzy-orders-vps --zone="$ZONE" --tags=orders-web > ```

## 4. Open tcp:80,443 with a VPC firewall rule

This is GCP's equivalent of the Oracle security-list step. It allows HTTP/HTTPS from anywhere to any
instance carrying the `orders-web` tag. (The `default` network already ships a `default-allow-ssh`
rule, so SSH keeps working.)

```sh
gcloud compute firewall-rules create allow-orders-web \
  --network=default \
  --direction=ingress \
  --action=allow \
  --rules=tcp:80,tcp:443 \
  --source-ranges=0.0.0.0/0 \
  --target-tags=orders-web
```

## 5. Set up the Pi (get its Tailscale IP)

On the **Raspberry Pi**, run the unchanged Pi script — it prints the Pi's Tailscale IP at the end:

```sh
cd /home/pi/izzybennett.com/order-server/deploy
sudo ./pi-setup.sh          # remember to `sudo tailscale up` when it reminds you
```

Copy the `PI_TS_IP = 100.x.y.z` it prints.

## 6. Set up the VM (skip the on-box firewall)

SSH into the VM, get the `deploy/` scripts onto it (clone the repo or copy the folder), then run
`vps-setup.sh` with **`--skip-firewall`** — the VPC rule from step 4 already handles ingress:

```sh
gcloud compute ssh izzy-orders-vps --zone="$ZONE"

# on the VM:
sudo tailscale up                                # authenticate in the browser it prints
cd ~/izzybennett.com/order-server/deploy         # or wherever you copied deploy/
sudo ./vps-setup.sh --skip-firewall <PI_TS_IP>   # the IP pi-setup.sh printed
```

That installs Tailscale + Caddy and writes `/etc/caddy/Caddyfile`
(`orders.izzybennett.com` → `<PI_TS_IP>:8000`), skipping only the iptables block.

## 7. Point DNS at the VM

In the Squarespace panel for `izzybennett.com` → **DNS Settings → Custom Records**, add an **A**
record: host `orders`, value = the static IP from step 2. Caddy auto-issues the TLS cert once it
resolves.

```sh
curl https://orders.izzybennett.com/health   # after propagation → {"ok":true}, valid cert
```

Then point the site at it (parent [`../README.md`](../README.md) step 3): set the GitHub Actions repo
variable `PUBLIC_ORDER_API = https://orders.izzybennett.com` and redeploy.

---

## Cost & keeping the bill capped

**Steady-state cost:** the `e2-micro` **compute** is free-tier in the regions above, and **1 GB/mo of
North-America egress is free** — plenty for a home café. The one unavoidable charge is the **static
external IPv4 at ~$3.65/mo** (Google now bills all external IPv4). So budget roughly **$4/mo**.

### ⚠️ Read this before trusting a "budget" to stop spend

- **Plain GCP budgets are ALERT-ONLY.** They email you at your thresholds; they do **not** pause or
  cap anything. A misconfig (e.g. accidentally dropping to Premium tier, a runaway egress) will keep
  billing regardless of the budget.
- **Spend Cap budgets** (the newer "kill switch") *do* pause a service at 100% — **but as of this
  writing they're in Public Preview and only cover a short list of eligible services: Gemini API,
  Agent Platform, Cloud Run, and Cloud Run functions. Compute Engine is NOT eligible.** So a spend
  cap **cannot** pause this café VM today. (Re-check
  <https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps> — if Compute Engine becomes
  eligible, a single-project + Compute Engine spend cap at ~$8/mo is the ideal setup, and yes, a
  tripped cap would take the café offline until you lift it. That's the safety mechanism working.)

### What to actually set up now

1. **An alert-only budget as an early-warning tripwire** (Console — budgets aren't fully
   gcloud-managed):
   **Billing → Budgets & alerts → Create budget** → scope to this project → **Alerts only** →
   monthly target **$8** (headroom over the ~$4 steady state) → keep the default 50%/90%/100% alert
   thresholds, and add a low **$5 (~62%)** threshold so you hear about drift early. This only emails
   you.

2. **(Optional) A real hard cap for Compute Engine** — since spend caps don't cover it yet, the
   documented DIY kill switch is: budget → **Pub/Sub** notification topic → a small **Cloud Function**
   that stops the instance (or disables the project's billing) when spend crosses the cap. More setup;
   see Google's "Automate cost control responses with budgets" guide. For a ~$4/mo footprint the
   alert-only budget above is usually enough — the exposure if something goes wrong is small and
   caught quickly by the $5 alert.

### Console-only steps (not gcloud)

- **Budgets & spend caps are created in the Cloud Console** (Billing → Budgets & alerts) — there's no
  first-class `gcloud` command to create a spend-cap budget.
- **The Squarespace A record** (step 7) — DNS lives outside GCP.
- **`sudo tailscale up`** on both boxes needs an interactive browser login.
