// Run the actual TypeScript modules with controlled queue/network boundaries.
// No production traffic, generated ZIPs, or persistent state writes.
// Usage: node --test scripts/verify-generation-retries.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  });
  const module = { exports: {} };
  const resolve = id => Object.hasOwn(dependencies, id) ? dependencies[id]
    : id.startsWith('@/') ? {} : require(id);
  new Function('require', 'module', 'exports', ...Object.keys(globals), outputText)(
    resolve, module, module.exports, ...Object.values(globals),
  );
  return module.exports;
}

test('busy retries preserve quota; duplicate builds share admission; real abuse remains limited', async () => {
  const limiter = load('src/lib/rate-limit.ts');
  let depth = 8;
  let cached = false;
  const admitted = [];
  const route = load('src/app/api/randomize/route.ts', {
    '@/lib/rate-limit': limiter,
    '@/lib/randomizer/seed': { seedFromString: Number },
    '@/lib/zip-cache': {
      makeCacheKey: (...args) => JSON.stringify(args),
      hasCached: () => cached,
      getZipCacheStats: () => ({ entries: 0, maxEntries: 200, bytes: 0 }),
    },
    '@/lib/generation-queue': {
      getQueueDepth: () => depth,
      // Hold work at the queue boundary; admission must finish before any
      // expensive sprite/game-data processing is necessary.
      enqueueGeneration: () => new Promise((resolve, reject) => admitted.push({ resolve, reject })),
    },
  }, { console: { warn() {}, error() {} } });
  const request = seed => new Request('http://localhost/api/randomize', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': 'test-client' },
    body: JSON.stringify({ seed }),
  });
  for (let i = 0; i < 4; i++) {
    const response = await route.POST(request(1));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '5');
  }
  depth = 0;
  const first = route.POST(request(1));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(admitted.length, 1, 'busy responses did not exhaust quota');
  depth = 8;
  const duplicate = route.POST(request(1));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(admitted.length, 1, 'duplicate shares the pending build even with a full queue');
  admitted[0].resolve();
  assert.equal((await first).status, 200);
  assert.equal((await duplicate).status, 200);
  depth = 0;
  for (const seed of [2, 3]) {
    const next = route.POST(request(seed));
    await new Promise(resolve => setImmediate(resolve));
    admitted.at(-1).resolve();
    assert.equal((await next).status, 200);
  }
  const limited = await route.POST(request(4));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Cache-Control'), 'no-store');
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);
  assert.ok((await limited.json()).retryAfter > 0);
  cached = true;
  assert.equal((await route.POST(request(4))).status, 200, 'cached mods bypass quota');
});

test('failed pending builds release their key so a retry can rebuild', async () => {
  let attempts = 0;
  const route = load('src/app/api/randomize/route.ts', {
    '@/lib/rate-limit': { getClientIp: () => 'test', checkRateLimit: () => ({ ok: true }) },
    '@/lib/zip-cache': { makeCacheKey: () => 'same-mod', hasCached: () => false },
    '@/lib/generation-queue': {
      getQueueDepth: () => 0,
      enqueueGeneration: () => ++attempts === 1 ? Promise.reject(new Error('build failed')) : Promise.resolve(),
    },
  }, { console: { error() {} } });
  const request = () => new Request('http://localhost/api/randomize', {
    method: 'POST', body: JSON.stringify({ seed: 42 }),
  });
  assert.equal((await route.POST(request())).status, 500);
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(attempts, 2);
});

function client(responses) {
  const waits = [], bodies = [], messages = [];
  const { generateMod } = load('src/lib/generate-mod.ts', {}, {
    fetch: async (_url, options) => { bodies.push(options.body); return responses.shift(); },
    setTimeout: (resolve, ms) => { waits.push(ms); resolve(); },
  });
  return { waits, bodies, messages, run: () => generateMod('{"seed":42}', msg => messages.push(msg)) };
}
const error = (status, headers = {}, body = { error: 'Please wait' }) =>
  new Response(JSON.stringify(body), { status, headers });

test('429 and 503 respect Retry-After and preserve the requested seed', async () => {
  const c = client([error(503, { 'Retry-After': '5' }), error(429, { 'Retry-After': '37' }), new Response('{}')]);
  await c.run();
  assert.deepEqual(c.waits, [5000, 37000]);
  assert.deepEqual(c.bodies, Array(3).fill('{"seed":42}'));
  assert.ok(c.messages.some(message => message.includes('37s')));
  assert.equal(c.messages.at(-1), '');
});

test('HTML 429 responses get bounded retries and a readable final error', async () => {
  const c = client(Array.from({ length: 3 }, () => new Response('<html>Too Many Requests</html>', { status: 429 })));
  await assert.rejects(c.run(), /HTTP 429/);
  assert.deepEqual(c.waits, [60000, 60000]);
  assert.equal(c.bodies.length, 3);
});

test('long Retry-After is not shortened and ordinary failures are not retried', async () => {
  for (const response of [error(429, { 'Retry-After': '120' }), error(400), error(500)]) {
    const c = client([response]);
    await assert.rejects(c.run(), /Please wait/);
    assert.equal(c.waits.length, 0);
    assert.equal(c.bodies.length, 1);
  }
});

test('HTTP-date Retry-After and JSON cooldown fallback are supported', async () => {
  const c = client([
    error(503, { 'Retry-After': new Date(Date.now() + 30000).toUTCString() }),
    error(429, {}, { retryAfter: 12 }), new Response('{}'),
  ]);
  await c.run();
  assert.ok(c.waits[0] >= 29000 && c.waits[0] <= 30000);
  assert.equal(c.waits[1], 12000);
});
