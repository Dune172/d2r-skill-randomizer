#!/usr/bin/env node
// Stress test for POST /api/randomize.
// Rotates across a pool of unique seeds so the zip cache doesn't swallow all hits.
// Usage: TARGET=http://localhost:3000 node stress/autocannon-randomize.mjs

import autocannon from 'autocannon';

const TARGET = process.env.TARGET || 'http://localhost:3000';
const DURATION = Number(process.env.DURATION) || 60;
const CONNECTIONS = Number(process.env.CONNECTIONS) || 10;
const SEED_POOL_SIZE = Number(process.env.SEED_POOL_SIZE) || 50;

// Unique seeds per run so we exercise fresh-generation path.
const runBase = Date.now() % 1_000_000;
const seeds = Array.from({ length: SEED_POOL_SIZE }, (_, i) => runBase + i);
let seedCursor = 0;

const instance = autocannon(
  {
    url: `${TARGET}/api/randomize`,
    method: 'POST',
    connections: CONNECTIONS,
    duration: DURATION,
    timeout: 60,
    headers: { 'content-type': 'application/json' },
    setupClient: (client) => {
      client.setBody(
        JSON.stringify({
          seed: seeds[seedCursor++ % seeds.length],
          enablePrereqs: true,
          playersEnabled: false,
          hirelingAura: true,
        }),
      );
    },
  },
  (err, result) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    const nonSuccess = (result.non2xx || 0) + (result.errors || 0) + (result.timeouts || 0);
    console.log('\n--- Summary ---');
    console.log(`Target:        ${TARGET}/api/randomize`);
    console.log(`Connections:   ${CONNECTIONS}`);
    console.log(`Duration:      ${DURATION}s`);
    console.log(`Seed pool:     ${SEED_POOL_SIZE}`);
    console.log(`Requests:      ${result.requests.total} (${result.requests.average}/s)`);
    console.log(`Throughput:    ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
    console.log(`Latency P50:   ${result.latency.p50} ms`);
    console.log(`Latency P95:   ${result.latency.p95} ms`);
    console.log(`Latency P99:   ${result.latency.p99} ms`);
    console.log(`Latency max:   ${result.latency.max} ms`);
    console.log(`2xx:           ${result['2xx']}`);
    console.log(`non-2xx:       ${nonSuccess}`);
    console.log(`errors:        ${result.errors}`);
    console.log(`timeouts:      ${result.timeouts}`);
  },
);

autocannon.track(instance, { renderProgressBar: true });
