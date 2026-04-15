#!/usr/bin/env node
// Stress test for static/page traffic: homepage, /api/counter, and a mutation PNG.
// Simulates incidental traffic a viral spike would generate while users aren't yet
// hitting randomize. Target: > 500 RPS sustained for the homepage alone.
// Usage: TARGET=http://localhost:3000 node stress/autocannon-static.mjs

import autocannon from 'autocannon';

const TARGET = process.env.TARGET || 'http://localhost:3000';
const DURATION = Number(process.env.DURATION) || 30;
const CONNECTIONS = Number(process.env.CONNECTIONS) || 100;
const ROUTE = process.env.ROUTE || '/';

const instance = autocannon(
  {
    url: `${TARGET}${ROUTE}`,
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
    console.log(`Target:        ${TARGET}${ROUTE}`);
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
