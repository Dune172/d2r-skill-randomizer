#!/usr/bin/env node
// Stress test for POST /api/preview — cheap, should sustain hundreds of RPS.
// Usage: TARGET=http://localhost:3000 node stress/autocannon-preview.mjs

import autocannon from 'autocannon';

const TARGET = process.env.TARGET || 'http://localhost:3000';
const DURATION = Number(process.env.DURATION) || 30;
const CONNECTIONS = Number(process.env.CONNECTIONS) || 50;

let seedCursor = 0;

const instance = autocannon(
  {
    url: `${TARGET}/api/preview`,
    method: 'POST',
    connections: CONNECTIONS,
    duration: DURATION,
    timeout: 30,
    headers: { 'content-type': 'application/json' },
    setupClient: (client) => {
      client.setBody(JSON.stringify({ seed: seedCursor++ }));
    },
  },
  (err, result) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log('\n--- Summary ---');
    console.log(`Target:        ${TARGET}/api/preview`);
    console.log(`Connections:   ${CONNECTIONS}`);
    console.log(`Duration:      ${DURATION}s`);
    console.log(`Requests:      ${result.requests.total} (${result.requests.average}/s)`);
    console.log(`Latency P50:   ${result.latency.p50} ms`);
    console.log(`Latency P95:   ${result.latency.p95} ms`);
    console.log(`Latency P99:   ${result.latency.p99} ms`);
    console.log(`2xx:           ${result['2xx']}`);
    console.log(`non-2xx:       ${(result.non2xx || 0) + (result.errors || 0)}`);
  },
);

autocannon.track(instance, { renderProgressBar: true });
