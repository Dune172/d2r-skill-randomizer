// Exercise real ZIP packaging and the download route entirely in memory.
// Usage: node --test scripts/verify-cached-download.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import AdmZip from 'adm-zip';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Pure option modules the routes build their cache keys from: always the real ones, so
// a stale stand-in can't hide a key mismatch. Other '@/' imports are stubbed ({}) unless
// a test passes them in.
const REAL = new Set([
  '@/lib/mutations/custom', '@/lib/mutations/registry', '@/lib/skill-points',
  '@/lib/shuffle-amount', '@/lib/mod-extras', '@/lib/base-game',
]);
function load(file, dependencies = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    id => Object.hasOwn(dependencies, id) ? dependencies[id]
      : id.startsWith('./') || id.startsWith('../') ? load(`${path.posix.join(path.posix.dirname(file), id)}.ts`)
        : REAL.has(id) ? load(`src/${id.slice(2)}.ts`)
          : id.startsWith('@/') ? {} : require(id),
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
    assert.equal(zip.readAsText(`seed${seed}.mpq/data/global/excel/skills.txt`),
      'skill\t*Id\r\nAttack\t0\r\n');
  });
}

test('a hand-installed ZIP is flat: its root is the mod folder, with a README', () => {
  const zip = new AdmZip(build(42, false));
  const names = zip.getEntries().filter(e => !e.isDirectory).map(e => e.entryName);
  for (const name of names) {
    assert.ok(name.startsWith('seed42.mpq/') || ['D2R Randomizer 42.lnk', 'README.txt'].includes(name), name);
  }
  assert.ok(names.includes('seed42.mpq/modinfo.json'));
  const readme = zip.readAsText('README.txt');
  assert.ok(readme.includes(['mods', 'seed42', 'seed42.mpq'].join('\\')), 'README names the exact path');
  assert.ok(!readme.includes('${') && readme.includes('\r\n'), 'README is rendered text with Windows line ends');
});

test('an Archipelago ZIP keeps the nested layout its client installs', () => {
  const zip = new AdmZip(buildZip({
    modName: 'seed42', seed: 42, raceMode: false, apManifestJson: '{}',
    skillsTxt: 'x', skillDescTxt: 'y', treeSprites: new Map(), iconSprites: new Map(),
  }));
  const names = zip.getEntries().filter(e => !e.isDirectory).map(e => e.entryName);
  assert.ok(names.every(n => n.startsWith('seed42/')), names.join(', '));
  assert.ok(names.includes('seed42/seed42.mpq/modinfo.json') && names.includes('seed42/d2rr-ap-manifest.json'));
  assert.ok(!names.some(n => n.endsWith('.lnk') || n.endsWith('README.txt')));
});

const calendar = load('src/lib/challenge/week.ts');
const challengeRules = load('src/lib/challenge/rules.ts');
// Pure module that builds part of the cache key in both routes, so it must be the real one.
const openActsOptions = load('src/lib/randomizer/open-acts/options.ts');
function downloadRoute(cached, allowed = true, currentWeek = 14) {
  return load('src/app/api/download/route.ts', {
    '@/lib/randomizer/open-acts/options': openActsOptions,
    // A regression to ZIP construction in this route must fail this test.
    'adm-zip': class { constructor() { throw new Error('Download must not rebuild the ZIP'); } },
    '@/lib/lnk-builder': { createD2RShortcut() { throw new Error('Launcher must already be cached'); } },
    '@/lib/randomizer/seed': load('src/lib/randomizer/seed.ts'),
    '@/lib/zip-cache': { makeCacheKey: (...args) => JSON.stringify(args), withBuildSegment: key => key, getCached: cached },
    '@/lib/rate-limit': {
      getClientIp: () => 'test', checkRateLimit: () => ({ ok: allowed, retryAfter: 60 }),
      rateLimitResponse: () => new Response(null, { status: 429 }),
    },
    '@/lib/challenge/week': { getWeekStart: () => new Date('2026-04-15T12:00:00Z'), getCurrentWeekNumber: () => currentWeek },
    '@/lib/challenge/rules': challengeRules,
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
      assert.equal(JSON.parse(key)[15], !weekly, 'weekly forces race mode off');
      assert.equal(JSON.parse(key)[16], false, 'enemy shuffle defaults off');
      return cached;
    });
    const url = `http://localhost/api/download?seed=42${weekly ? '&weekly=1&week=1&weekOverride=1' : ''}`;
    for (let i = 0; i < 2; i++) {
      const response = await route.GET(new Request(url));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Type'), 'application/zip');
      assert.equal(response.headers.get('Content-Length'), String(zipBytes.length));
      // Named after the mod folder, challenge or not, so Extract All makes that folder.
      assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="seed42.zip"');
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

test('enemy shuffle has a distinct download key and stays off for challenges before rollout', async () => {
  for (const weekly of [false, true]) {
    const route = downloadRoute(key => {
      assert.equal(JSON.parse(key)[16], !weekly);
      return build(42, false);
    });
    const response = await route.GET(new Request(`http://localhost/api/download?seed=42&enemyShuffle=1${weekly ? '&weekly=1' : ''}`));
    assert.equal(response.status, 200);
  }
});

test('the base-game option has its own download key and name, and challenges ignore it', async () => {
  for (const weekly of [false, true]) {
    const route = downloadRoute(key => {
      assert.equal(key.endsWith(':base'), !weekly, key);
      return build(42, false);
    });
    const response = await route.GET(new Request(`http://localhost/api/download?seed=42&baseGame=1${weekly ? '&weekly=1' : ''}`));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Disposition'), weekly ? /seed42.zip/ : /seed42base.zip/);
  }
  const plain = downloadRoute(key => { assert.ok(!key.includes(':base'), key); return build(42, false); });
  assert.equal((await plain.GET(new Request('http://localhost/api/download?seed=42'))).status, 200);
});

test('challenge 15 starts September 21; rollout follows absolute challenge number across rotations', () => {
  assert.equal(calendar.getCurrentWeekNumber(new Date('2026-09-11T00:37:25Z')), 14);
  assert.equal(calendar.getWeekStart(15).toISOString(), '2026-09-21T07:00:00.000Z');
  for (let week = 1; week <= 80; week++) assert.equal(challengeRules.challengeRandomizesMonsters(week), week >= 15);
});

test('generation and download enforce the same rollout rule, ignoring client overrides', async () => {
  for (const currentWeek of [14, 15, 46]) for (const weekOverride of [undefined, 1, 14, 15, 16, 46]) for (const flag of [undefined, false, true]) {
    let generatedKey, downloadKey;
    const route = load('src/app/api/randomize/route.ts', {
      '@/lib/randomizer/open-acts/options': openActsOptions,
      '@/lib/challenge/week': { getCurrentWeekNumber: () => currentWeek },
      '@/lib/challenge/rules': challengeRules,
      '@/lib/zip-cache': {
        makeCacheKey: (...args) => JSON.stringify(args),
        withBuildSegment: key => key,
        hasCached: key => { generatedKey = JSON.parse(key); return true; },
      },
      // The real rule, from the real registry, as the download route uses.
      '@/lib/randomizer/mutations': {
        isMutationActiveForWeek: (week, id) => load('src/lib/mutations/registry.ts').getActiveMutations(week).some(m => m.id === id),
      },
      '@/lib/feature-stats': { recordFeatures() {} },
    });
    const response = await route.POST(new Request('http://localhost/api/randomize', {
      method: 'POST', body: JSON.stringify({ seed: 42, enemyShuffle: flag, weeklyChallenge: { enabled: true, weekOverride } }),
    }));
    assert.equal(response.status, 200);
    const params = new URLSearchParams({ seed: '42', weekly: '1' });
    if (weekOverride !== undefined) params.set('weekOverride', String(weekOverride));
    if (flag !== undefined) params.set('enemyShuffle', flag ? '1' : '0');
    const download = downloadRoute(key => { downloadKey = JSON.parse(key); return Buffer.from('cached'); }, true, currentWeek);
    assert.equal((await download.GET(new Request(`http://localhost/api/download?${params}`))).status, 200);
    assert.deepEqual(generatedKey, downloadKey, 'generation/download keys match');
    assert.equal(generatedKey[12], weekOverride ?? currentWeek, 'cache pins absolute challenge number');
    assert.equal(generatedKey[16], (weekOverride ?? currentWeek) >= 15);
    assert.equal(generatedKey[15], false, 'challenges remain full-class randomization');
  }
});
