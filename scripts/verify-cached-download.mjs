// Exercise real ZIP packaging and the download route entirely in memory.
// Usage: node --test scripts/verify-cached-download.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import AdmZip from 'adm-zip';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    id => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id),
    module, module.exports,
  );
  return module.exports;
}

const { buildZip } = load('src/lib/zip-builder.ts', {
  './lnk-builder': load('src/lib/lnk-builder.ts'),
});
function build(seed, raceMode) {
  return buildZip({
    modName: `seed${seed}`, seed, raceMode,
    skillsTxt: 'skill\t*Id\r\nAttack\t0\r\n',
    skillDescTxt: 'skilldesc\r\nattack\r\n',
    treeSprites: new Map(), iconSprites: new Map(),
  });
}

// Decode the Shell Link's counted argument string independently of its builder.
function shortcutArgs(data) {
  assert.equal(data.readUInt32LE(0), 76);
  const offset = 76 + data.readUInt32LE(76); // header + LinkInfo
  const length = data.readUInt16LE(offset);
  return data.toString('utf16le', offset + 2, offset + 2 + length * 2);
}

for (const [seed, raceMode, args] of [
  [42, true, '-mod seed42 -txt -seed 42'],
  [-1, true, '-mod seed-1 -txt -seed 4294967295'],
  [0, true, '-mod seed0 -txt -seed 0'],
  [42, false, '-mod seed42 -txt'],
]) {
  test(`cached ZIP includes the correct launcher: seed=${seed}, race=${raceMode}`, () => {
    const zip = new AdmZip(build(seed, raceMode));
    const shortcuts = zip.getEntries().filter(e => e.entryName.endsWith('.lnk'));
    assert.equal(shortcuts.length, 1);
    assert.equal(shortcuts[0].entryName, `D2R Randomizer ${seed}.lnk`);
    assert.equal(shortcutArgs(shortcuts[0].getData()), args);
    assert.equal(zip.readAsText(`seed${seed}/seed${seed}.mpq/data/global/excel/skills.txt`),
      'skill\t*Id\r\nAttack\t0\r\n');
  });
}

function downloadRoute(cached, allowed = true) {
  return load('src/app/api/download/route.ts', {
    // A regression to ZIP construction in this route must fail this test.
    'adm-zip': class { constructor() { throw new Error('Download must not rebuild the ZIP'); } },
    '@/lib/lnk-builder': { createD2RShortcut() { throw new Error('Launcher must already be cached'); } },
    '@/lib/randomizer/seed': load('src/lib/randomizer/seed.ts'),
    '@/lib/zip-cache': { makeCacheKey: (...args) => JSON.stringify(args), getCached: cached },
    '@/lib/rate-limit': {
      getClientIp: () => 'test', checkRateLimit: () => ({ ok: allowed, retryAfter: 60 }),
      rateLimitResponse: () => new Response(null, { status: 429 }),
    },
    '@/lib/mutations/registry': { getWeekName: () => 'Test Challenge' },
    '@/lib/challenge/week': { getWeekStart: () => new Date('2026-04-15T12:00:00Z') },
  });
}

for (const weekly of [false, true]) {
  test(`repeated ${weekly ? 'weekly' : 'race'} downloads serve the exact cached bytes`, async () => {
    const zipBytes = build(42, !weekly);
    // Nonzero byteOffset catches accidental responses containing the entire backing buffer.
    const backing = Buffer.concat([Buffer.from('prefix'), zipBytes, Buffer.from('suffix')]);
    const cached = backing.subarray(6, 6 + zipBytes.length);
    const original = Buffer.from(backing);
    const route = downloadRoute(key => {
      assert.equal(JSON.parse(key).at(-1), !weekly, 'weekly forces race mode off');
      return cached;
    });
    const url = `http://localhost/api/download?seed=42${weekly ? '&weekly=1&week=1&weekOverride=1' : ''}`;
    for (let i = 0; i < 2; i++) {
      const response = await route.GET(new Request(url));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Type'), 'application/zip');
      assert.equal(response.headers.get('Content-Length'), String(zipBytes.length));
      assert.equal(response.headers.get('Content-Disposition'), weekly
        ? 'attachment; filename="d2rr_test_challenge_2026-04-15.zip"'
        : 'attachment; filename="d2rr_export_42.zip"');
      const reader = response.body.getReader();
      const chunk = await reader.read();
      assert.strictEqual(chunk.value, cached, 'stream reuses the cached Buffer without copying');
      assert.deepEqual(chunk.value, zipBytes);
      assert.equal((await reader.read()).done, true);
    }
    assert.deepEqual(backing, original, 'downloads do not modify cached bytes');
  });
}

test('missing seeds, cache misses, and rate limits retain their HTTP status', async () => {
  const route = downloadRoute(() => undefined);
  assert.equal((await route.GET(new Request('http://localhost/api/download'))).status, 400);
  assert.equal((await route.GET(new Request('http://localhost/api/download?seed=42'))).status, 404);
  const limited = downloadRoute(() => { throw new Error('Must reject before cache lookup'); }, false);
  assert.equal((await limited.GET(new Request('http://localhost/api/download?seed=42'))).status, 429);
});
