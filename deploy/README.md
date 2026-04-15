# Deploy reference

Reference configs for running D2R Randomizer on the Hostinger VPS. These are not auto-applied by the repo — copy them to the server and wire up as notes below describe.

## Files

- [`deploy/nginx.conf`](nginx.conf) — Reverse proxy + TLS + compression + edge cache. Install at `/etc/nginx/sites-available/d2rrandomizer`, symlink into `sites-enabled`, reload nginx.
- [`../ecosystem.config.js`](../ecosystem.config.js) — PM2 config. Single instance (in-memory state requires it), sensible restart policy, thread-pool env vars.

## Prerequisites

1. PM2 installed globally: `npm i -g pm2`
2. `pm2 install pm2-logrotate` once, so `~/.pm2/logs` doesn't fill disk
3. nginx installed, TLS cert via Let's Encrypt (`certbot --nginx -d d2rrandomizer.com -d www.d2rrandomizer.com`)
4. Cloudflare (optional but recommended): orange-cloud DNS, Page Rules caching static assets for 30d, API bypass. See plan Phase 3.1.

## Deploy flow

```bash
# from local repo
git push

# on VPS
cd /var/www/d2rrandomizer
git pull
npm ci --production=false
npm run build
pm2 reload d2rr              # zero-downtime reload if ecosystem already loaded
# first time only: pm2 start ecosystem.config.js && pm2 save
```

## Health check

`curl https://d2rrandomizer.com/api/health` returns queue depth, zip cache size, RSS, counter. Point an UptimeRobot monitor at it during a spike.

## Stress test against live

From a different machine (not the VPS — you'd bottleneck on its network):

```bash
TARGET=https://d2rrandomizer.com node stress/autocannon-preview.mjs
```

The randomize/burst scripts are safer against a staging copy first — a concurrent burst against prod can trip the queue's 503 branch for real users.
