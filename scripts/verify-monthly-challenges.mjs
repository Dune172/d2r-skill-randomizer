import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Load actual modules. The announcer runs with a fake clock, filesystem and
// network so these tests can never publish an announcement.
let now = Date.parse('2026-10-01T16:01:00Z');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const timers = [];
let posts = 0;
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const require = spec => {
    if (spec === 'node:fs') return { promises: {
      readFile: async () => JSON.stringify({ lastAnnouncedWeek: 16 }),
      writeFile: async () => {},
    } };
    if (spec === './state-dir') return { statePath: name => name };
    if (spec === './og/challengeCard') return { renderChallengeCardPng: async () => Buffer.from('fake PNG') };
    if (!spec.startsWith('.')) throw new Error(`Unexpected dependency: ${spec}`);
    return load(path.resolve(path.dirname(file), `${spec}.ts`));
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require, Date: Clock, Intl, Buffer, Uint8Array, Blob, FormData, AbortController,
    process: { env: { DISCORD_WEEKLY_WEBHOOK_URL: 'https://invalid.test/not-a-webhook' } },
    console: { log() {}, warn() {} },
    fetch: async () => { posts++; return { ok: true }; },
    setTimeout: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimeout() {},
  }, { filename: file });
  return exports;
}
const calendar = load('src/lib/challenge/week.ts');
const { getWeekStart, getWeekEnd, getWeekSeed, getCurrentWeekNumber, getChallengeAnnouncementTime } = calendar;
for (let id = 1; id <= 15; id++) {
  const oldDate = new Date(Date.UTC(2026, 2, 9 + (id - 1) * 14, 7));
  assert.equal(getWeekStart(id).toISOString(), oldDate.toISOString(), `historical start ${id}`);
  assert.equal(getWeekSeed(id), id * 1337);
  if (id < 15) assert.equal(getWeekEnd(id).getTime(), oldDate.getTime() + 14 * 86400000 - 1);
}
assert.equal(getWeekEnd(15).toISOString(), '2026-10-01T06:59:59.999Z');
assert.equal(getWeekSeed(16), 21392);
const boundaries = [
  [16, '2026-10-01T07:00:00.000Z'],
  [17, '2026-11-01T07:00:00.000Z'],
  [18, '2026-12-01T08:00:00.000Z'],
  [19, '2027-01-01T08:00:00.000Z'],
  [32, '2028-02-01T08:00:00.000Z'],
  [33, '2028-03-01T08:00:00.000Z'],
];
for (const [id, start] of boundaries) {
  assert.equal(getWeekStart(id).toISOString(), start);
  assert.equal(getCurrentWeekNumber(new Date(start)), id);
  assert.equal(getCurrentWeekNumber(new Date(Date.parse(start) - 1)), id - 1);
  assert.equal(getCurrentWeekNumber(getWeekEnd(id)), id);
}
assert.equal(getWeekEnd(32).toISOString(), '2028-03-01T07:59:59.999Z', 'leap day retained');
assert.equal(getCurrentWeekNumber(new Date('2026-09-23T12:00:00Z')), 15);
assert.equal(getCurrentWeekNumber(new Date('2020-01-01')), 1);
assert.equal(getChallengeAnnouncementTime(16).toISOString(), '2026-10-01T16:00:00.000Z');
assert.equal(getChallengeAnnouncementTime(17).toISOString(), '2026-11-01T17:00:00.000Z', 'DST ends between midnight and announcement');

const registry = load('src/lib/mutations/registry.ts');
assert.equal(registry.getWeekName(16), 'Return to Tristram');
assert.deepEqual(Array.from(registry.getMutationIds(16)), [19, 15, 14]);
assert.equal(registry.getActiveMutations(16).map(m => m.name).join(', '), 'Forgotten Arts, Molasses, Entropy');
assert.equal(Object.keys(registry.MUTATIONS).length, 19, 'no new companion mutations');
for (let id = 1; id <= 63; id++) {
  registry.assertNoConflictingMutations(registry.getMutationIds(id));
  if (id !== 16) assert.deepEqual(registry.getMutationIds(id), registry.WEEKLY_MUTATIONS[(id - 1) % 31]);
}
console.log('PASS: monthly calendar, DST, leap year, historical IDs/seeds and October lineup');

const announcer = load('src/lib/discord-weekly-announcer.ts');
assert.equal(announcer.nextFireTime(16, now), Date.parse('2026-11-01T17:00:00Z'));
announcer.startWeeklyAnnouncer();
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
await flush();
assert.equal(posts, 0, 'restart does not duplicate October');
assert.equal(timers.at(-1).delay, 86400000, 'month wait bounded below Node timeout overflow');
for (let day = 0; day < 30; day++) {
  const timer = timers.at(-1);
  now += timer.delay;
  timer.callback();
  await flush();
  assert.equal(posts, 0, 'daily timer must not post early');
  assert.ok(timers.at(-1).delay <= 86400000);
}
while (posts === 0) {
  const timer = timers.at(-1);
  now += timer.delay;
  timer.callback();
  await flush();
  assert.ok(now <= Date.parse('2026-11-01T17:00:00Z'));
}
assert.equal(now, Date.parse('2026-11-01T17:00:00Z'));
assert.equal(posts, 1);
console.log('PASS: mocked monthly announcer wakes safely and posts once at 9 a.m. Pacific');
