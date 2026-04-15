#!/usr/bin/env node
// Stress test for GET /api/download with a pre-cached seed.
// Prereq: run POST /api/randomize for SEED first to populate the cache, or this
// will just measure 404 latency (also useful as a regression test).
// Usage: TARGET=http://localhost:3000 SEED=12345 node stress/autocannon-download.mjs

import autocannon from 'autocannon';

const TARGET = process.env.TARGET || 'http://localhost:3000';
const DURATION = Number(process.env.DURATION) || 20;
const CONNECTIONS = Number(process.env.CONNECTIONS) || 50;
const SEED = Number(process.env.SEED) || 12345;

const instance = autocannon(
  {
    url: `${TARGET}/api/download?seed=${SEED}`,
    method: 'GET',
    connections: CONNECTIONS,
    duration: DURATION,
    timeout: 30,
  },
  (err, result) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log('\n--- Summary ---');
    console.log(`Target:        ${TARGET}/api/download?seed=${SEED}`);
    console.log(`Connections:   ${CONNECTIONS}`);
    console.log(`Duration:      ${DURATION}s`);
    console.log(`Requests:      ${result.requests.total} (${result.requests.average}/s)`);
    console.log(`Throughput:    ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
    console.log(`Latency P50:   ${result.latency.p50} ms`);
    console.log(`Latency P95:   ${result.latency.p95} ms`);
    console.log(`Latency P99:   ${result.latency.p99} ms`);
    console.log(`2xx:           ${result['2xx']}`);
    console.log(`non-2xx:       ${(result.non2xx || 0) + (result.errors || 0)}`);
  },
);

autocannon.track(instance, { renderProgressBar: true });
