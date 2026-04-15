#!/usr/bin/env node
// Fire N concurrent POST /api/randomize requests with unique seeds and report
// how many succeed vs 503/429, and the P95 latency. Use to test queue-depth
// tuning — the plan expects 10 concurrent clients / 50 unique seeds with 0
// 503s and P95 <= 15s.
// Usage: TARGET=http://localhost:3000 CONCURRENT=10 TOTAL=50 node stress/burst-randomize.mjs

const TARGET = process.env.TARGET || 'http://localhost:3000';
const CONCURRENT = Number(process.env.CONCURRENT) || 10;
const TOTAL = Number(process.env.TOTAL) || 50;

const runBase = Date.now() % 1_000_000;
const seeds = Array.from({ length: TOTAL }, (_, i) => runBase + i);

async function fireOne(seed) {
  const start = Date.now();
  try {
    const res = await fetch(`${TARGET}/api/randomize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seed, enablePrereqs: true }),
    });
    const elapsed = Date.now() - start;
    return { seed, status: res.status, elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    return { seed, status: 0, elapsed, error: err.message };
  }
}

async function main() {
  console.log(`Firing ${TOTAL} randomize requests, ${CONCURRENT} at a time, at ${TARGET}`);
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < seeds.length) {
      const idx = cursor++;
      const r = await fireOne(seeds[idx]);
      results.push(r);
      process.stdout.write(r.status === 200 ? '.' : r.status === 503 ? '!' : r.status === 429 ? 'T' : 'X');
    }
  }

  const start = Date.now();
  await Promise.all(Array.from({ length: CONCURRENT }, worker));
  const total = Date.now() - start;

  const ok = results.filter(r => r.status === 200);
  const busy = results.filter(r => r.status === 503);
  const throttled = results.filter(r => r.status === 429);
  const errors = results.filter(r => r.status !== 200 && r.status !== 503 && r.status !== 429);
  const latencies = ok.map(r => r.elapsed).sort((a, b) => a - b);
  const p = (q) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))];

  console.log('\n\n--- Burst summary ---');
  console.log(`Wall time:     ${total} ms`);
  console.log(`Success (200): ${ok.length}`);
  console.log(`Busy (503):    ${busy.length}`);
  console.log(`Throttled(429):${throttled.length}`);
  console.log(`Errors:        ${errors.length}`);
  if (latencies.length) {
    console.log(`Latency P50:   ${p(0.5)} ms`);
    console.log(`Latency P95:   ${p(0.95)} ms`);
    console.log(`Latency P99:   ${p(0.99)} ms`);
    console.log(`Latency max:   ${latencies[latencies.length - 1]} ms`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
