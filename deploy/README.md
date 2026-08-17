# Deploy reference

Reference configs for running D2R Randomizer on the Hostinger VPS. These are not auto-applied by the repo — copy them to the server and wire up as notes below describe.

## Files

- [`deploy/nginx.conf`](nginx.conf) — Reverse proxy + TLS + compression + edge cache. Install at `/etc/nginx/sites-available/d2rrandomizer`, symlink into `sites-enabled`, reload nginx.
- [`../ecosystem.config.js`](../ecosystem.config.js) — PM2 config. Single instance (in-memory state requires it), sensible restart policy, thread-pool env vars.

## Persistent state (STATE_DIR)

All the app's persistent state lives in one directory: `counter.json`,
`leaderboard.json`, `traffic-stats.json`, `weekly-announce.json`, and the
`zip-cache/` directory.

**Set `STATE_DIR` to an absolute path on persistent storage.** It defaults to
`process.cwd()/..`, which is only correct when the app always runs from the same
directory. On any host that builds each release into its own directory
(Hostinger's Node.js hosting does — see `.builds` → `/hbuilds`), cwd moves on
every deploy, so `..` points somewhere new and the app silently starts from zero
against empty files while the real data sits orphaned in the old location.
Nothing errors — the mod counter just resets and the traffic history disappears.

Confirm it after every deploy; each store logs its resolved path at startup:

```
[counter] using /home/uXXXXXXXXX/counter.json · STATE_DIR=/home/uXXXXXXXXX
[traffic-stats] using /home/uXXXXXXXXX/traffic-stats.json
[leaderboard] using /home/uXXXXXXXXX/leaderboard.json
```

A `(STATE_DIR unset; derived from cwd ...)` suffix means it is not pinned.

Per-file overrides (`COUNTER_FILE`, `LEADERBOARD_FILE`, `TRAFFIC_STATS_FILE`,
`WEEKLY_ANNOUNCE_FILE`, `ZIP_CACHE_DIR`) still take precedence where set.

To restore the generation total after a loss:
`STATE_DIR=/your/state/dir node scripts/set-counter.mjs 5679`

Note: with PM2, `pm2 reload` does **not** re-read env from `ecosystem.config.js`.
Use `pm2 reload ecosystem.config.js --update-env` when env vars change.

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
