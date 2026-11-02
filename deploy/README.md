# Deploy reference

## How the site deploys

Production runs on Hostinger's managed Node.js hosting, behind Cloudflare (live
responses carry `platform: hostinger` and `Server: cloudflare`). **Merging to `main`
deploys it.** Hostinger builds the new `main` with `npm run build`, whose `prebuild` step
also packages the apworld into `public/archipelago`, then restarts the app. There is
no manual step and no staging site: whatever lands on `main` is live within a few
minutes (PR #12 was live about two minutes after its merge on 2026-11-02).

So test before merging, not after. Environment variables (`STATE_DIR`, the AdSense
settings below) are set in the hosting panel (hPanel), not in the repo, and a change
to them needs a redeploy or restart to take effect.

After a deploy:

1. `curl https://d2rrandomizer.com/api/health`. `uptime` restarts from zero, and
   `counter` should carry on from its value before the deploy. A counter back near
   zero means the state directory moved: see "Persistent state" below.
2. Anything the change was meant to ship is live. For Archipelago, the version
   `/archipelago` shows is `world_version` in `apworld/d2rr/archipelago.json`, and the
   app it serves has the same SHA-256 as `public/archipelago/d2rr-ap.exe` on `main`.

The app must run as a single instance: the in-memory zip cache index, generation queue
and rate limiter assume one process.

## Persistent state (STATE_DIR)

All the app's persistent state lives in one directory: `counter.json`,
`leaderboard.json`, `traffic-stats.json`, `weekly-announce.json`, and the
`zip-cache/` directory.

The directory is resolved in this order:

1. **`STATE_DIR`**, when set — always wins, no guessing. Set it if you can.
2. **`cwd/..`**, if it already holds state. This is the VPS layout: a checkout at
   `/var/www/d2rrandomizer` resolves to `/var/www`.
3. **The account's home directory**, if it already holds state. This covers
   managed hosting that runs each release from its own build directory
   (Hostinger's Node.js hosting does — see `.builds` → `/hbuilds`), where cwd
   moves every deploy but the home directory is stable.
4. Otherwise `cwd/..`, the historical default for a fresh install.

Steps 2 and 3 only ever *adopt* a directory that already contains state; the app
never invents a new location, so a fresh install behaves as it always did.

This matters because the failure is silent. When cwd moves and `..` points
somewhere new, the app starts from zero against empty files while the real data
sits orphaned in the old location — nothing errors, the mod counter just resets
and the traffic history disappears.

Confirm it after every deploy; each store logs its resolved path at startup:

```
[counter] using /home/uXXXXXXXXX/counter.json · /home/uXXXXXXXXX (via home dir of uXXXXXXXXX)
[traffic-stats] using /home/uXXXXXXXXX/traffic-stats.json
[leaderboard] using /home/uXXXXXXXXX/leaderboard.json
```

The `(via ...)` suffix names which rule matched. `via cwd/.. — no existing state
found, starting fresh` on a server that should already have data means the app
is about to start from zero — check the path before it writes.

Per-file overrides (`COUNTER_FILE`, `LEADERBOARD_FILE`, `TRAFFIC_STATS_FILE`,
`WEEKLY_ANNOUNCE_FILE`, `ZIP_CACHE_DIR`) still take precedence where set.

To restore the generation total after a loss:
`STATE_DIR=/your/state/dir node scripts/set-counter.mjs 5679`

## CDN

Use only one CDN. With Cloudflare in front, Hostinger's CDN must be off and Cloudflare
must point at the hosting origin, not at a Hostinger CDN address; see the 429 notes
below. Cloudflare should cache static assets and bypass `/api/`.

## AdSense

See [the implementation and activation plan](../docs/adsense-implementation-plan.md)
and [environment template](adsense.env.example). Ads are disabled by default.
Set public configuration before building; rebuild and redeploy to activate or
disable ads. The publisher ID alone enables verification and `/ads.txt` without
serving ads.

## Health check

`curl https://d2rrandomizer.com/api/health` returns queue depth, zip cache size, RSS, counter. Point an UptimeRobot monitor at it during a spike.

## Investigating HTTP 429

Capture the failing URL, response body, `Retry-After`, and any `CF-Ray` or
`x-hcdn-request-id` headers from the browser's Network panel. The public site
can pass through both Cloudflare and Hostinger's CDN before reaching Next.js;
a healthy `/api/health` response alone cannot identify which layer rejected
another request.

**Check for two CDNs first.** On 2026-09-09, live responses contained both
`cf-cache-status` and `x-hcdn-cache-status`. Hostinger identifies this exact
header combination as a double-CDN setup and applies rate limits to traffic
passing through both. This can affect the whole site independently of the
application's generation quota. See
[Hostinger CDN vs Cloudflare](https://www.hostinger.com/support/hostinger-cdn-vs-cloudflare/).

To keep Cloudflare, use hPanel → Websites → Dashboard → Performance → CDN
to disable Hostinger CDN, and verify Cloudflare's website DNS records point
to the hosting plan's origin address rather than a Hostinger CDN address.
Obtain that origin from hPanel; do not guess it or change mail/verification
records. Afterwards, check response headers again: `cf-cache-status` should
remain and `x-hcdn-cache-status` should disappear. This is a hosting/DNS change;
deploying application code alone cannot remove this source of 429s.

The application's generation limiter allows three new builds per IP per
minute. Cached mods and requests joining a build already in progress bypass
that quota. A full queue returns 503 with `Retry-After: 5` without consuming
quota. Both generator pages retry 429/503 up to twice, respecting waits of up
to 60 seconds. Longer waits are shown as errors without an early retry.

Application rate-limit responses are JSON with `error`, `retryAfter`, and
`Cache-Control: no-store`. There is no application rate limiter on page loads.
For an HTML 429 on `/` or `/generate`, investigate the hosting/CDN rules and
logs using the captured request IDs. For unexpected shared generation quotas,
verify the hosting proxy supplies distinct, trustworthy client addresses in
`X-Forwarded-For`/`X-Real-IP`; missing headers currently share the `unknown`
bucket. Do not change which proxy header is trusted without checking the
actual deployment's forwarding configuration.

Local regression check: `node --test scripts/verify-generation-retries.mjs`.

## Stress test against live

From your own machine, never from the production host:

```bash
TARGET=https://d2rrandomizer.com node stress/autocannon-preview.mjs
```

The randomize/burst scripts are safer against a staging copy first — a concurrent burst against prod can trip the queue's 503 branch for real users.

## Self-hosting on a VPS (reference)

Production no longer runs this way; this is kept for running the site on a server of
your own. None of it is applied automatically.

- [`nginx.conf`](nginx.conf): reverse proxy, TLS, compression and edge cache. Install
  at `/etc/nginx/sites-available/d2rrandomizer`, symlink into `sites-enabled`, reload
  nginx.
- [`../ecosystem.config.js`](../ecosystem.config.js): PM2 config. A single instance,
  a restart policy and thread-pool settings.

Prerequisites:

1. PM2 installed globally: `npm i -g pm2`
2. `pm2 install pm2-logrotate` once, so `~/.pm2/logs` doesn't fill the disk
3. nginx, with a Let's Encrypt certificate
   (`certbot --nginx -d d2rrandomizer.com -d www.d2rrandomizer.com`)

Deploying:

```bash
cd /var/www/d2rrandomizer
git pull
npm ci --production=false
npm run build
pm2 reload d2rr              # zero-downtime reload once the ecosystem is loaded
# first time only: pm2 start ecosystem.config.js && pm2 save
```

`pm2 reload` does **not** re-read env from `ecosystem.config.js`; use
`pm2 reload ecosystem.config.js --update-env` when env vars change.
