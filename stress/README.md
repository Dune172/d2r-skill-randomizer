# Stress-test harness

Reproducible load tests for the D2R Randomizer. Designed to be re-run after every optimization so changes are judged against numbers, not vibes.

## Setup

```bash
npm install   # autocannon is already a devDependency
npm run build && npm run start  # production-mode server on :3000
```

Each script honors a `TARGET` env var so you can point at prod once ready.

## Scripts

| Script | What it measures |
| --- | --- |
| `autocannon-randomize.mjs` | `POST /api/randomize` with rotating seeds. P50/P95/P99, 429/503 rates. Default: 60 s × 10 conns. |
| `autocannon-preview.mjs`   | `POST /api/preview` — cheap, should sustain hundreds of RPS. Default: 30 s × 50 conns. |
| `autocannon-static.mjs`    | `GET` on any route (default `/`). Default: 30 s × 100 conns. Set `ROUTE=/api/counter` etc. |
| `autocannon-download.mjs`  | `GET /api/download?seed=SEED`. Populate the cache first with a matching POST to avoid 404 noise. |
| `burst-randomize.mjs`      | Plan verification: N concurrent requests with unique seeds, count 503/429s. |

## Environment variables

- `TARGET` — base URL (default `http://localhost:3000`)
- `DURATION` — seconds (default varies by script)
- `CONNECTIONS` — autocannon concurrency
- `SEED_POOL_SIZE` — number of unique seeds to rotate (randomize script)
- `ROUTE` — path for static script
- `SEED` — seed for download script
- `CONCURRENT` / `TOTAL` — for burst script

## Running the full suite (one-liner)

```bash
node stress/autocannon-preview.mjs     > stress/results-preview.txt
node stress/autocannon-static.mjs      > stress/results-static.txt
ROUTE=/api/counter CONNECTIONS=200 DURATION=20 node stress/autocannon-static.mjs > stress/results-counter.txt
node stress/autocannon-randomize.mjs   > stress/results-randomize.txt
CONCURRENT=10 TOTAL=50 node stress/burst-randomize.mjs > stress/results-burst.txt
```

## Plan verification targets (from plan)

- `/` sustains **> 500 RPS** at 100 connections.
- `burst-randomize.mjs` with 10 concurrent / 50 seeds: **0 × 503**, **P95 ≤ 15 s**, stable memory across two runs.
- `/api/download` (cache hit): **< 50 ms** per request.
- Cold start: `GET /api/download?seed=<weeklyseed>&weekly=1` immediately after boot returns 200, not 404 (warmup pre-generated it).

## Baseline

`baseline-<date>.md` captures numbers before any changes. Don't ship a change whose stress results aren't better than this.
