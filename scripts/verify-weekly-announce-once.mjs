/**
 * verify-weekly-announce-once.mjs — proves the Discord mutation-challenge post
 * fires exactly once per challenge, no matter how many announcers are live.
 *
 * The bug this guards: weekly-announce.json used to gate only the boot catch-up,
 * so a second announcer (a duplicate Next.js module instance, a duplicate
 * instrumentation register(), or an overlapping deploy) posted the same Monday
 * card twice. The fix claims the week with an exclusive file create before
 * posting; these checks exercise that claim against a real webhook server.
 *
 * Like verify-new-mutations.mjs this compiles and runs the shipped TypeScript
 * rather than mirroring it — only the leaf modules that would drag in satori and
 * the real data tables (og/challengeCard, mutations/registry, state-dir) are
 * stubbed, so the announcer's own logic is the thing under test.
 *
 * Run with: node scripts/verify-weekly-announce-once.mjs
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
let checks = 0;
function check(label, cond, detail) {
  checks++;
  const suffix = detail ? '  ' + detail : '';
  if (cond) {
    console.log('  ok   ' + label + suffix);
    return;
  }
  failures++;
  console.log('  FAIL ' + label + suffix);
}

// ── Compile the real announcer ────────────────────────────────────────────
// tsc exits non-zero on the JSX/path-alias errors in the transitively pulled
// modules we're about to overwrite with stubs, but still emits what we need.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'announceverify-'));
try {
  execFileSync('npx', ['tsc', '--module', 'commonjs', '--target', 'es2022',
    '--moduleResolution', 'node', '--jsx', 'react-jsx', '--skipLibCheck',
    '--esModuleInterop',
    '--outDir', outDir, '--rootDir', 'src',
    'src/lib/discord-weekly-announcer.ts'], { cwd: ROOT, stdio: 'pipe', shell: true });
} catch {
  /* emit-on-error is expected */
}

const LIB = path.join(outDir, 'lib');
if (!fs.existsSync(path.join(LIB, 'discord-weekly-announcer.js'))) {
  console.error('tsc did not emit discord-weekly-announcer.js — cannot verify.');
  process.exit(1);
}

// Stub the leaves. Everything else — the claim, the state file, the scheduler
// guard — is the shipped implementation.
fs.mkdirSync(path.join(LIB, 'og'), { recursive: true });
fs.mkdirSync(path.join(LIB, 'mutations'), { recursive: true });
fs.writeFileSync(path.join(LIB, 'state-dir.js'),
  `exports.statePath = (n) => require('path').join(process.env.TEST_STATE_DIR, n);\n`);
fs.writeFileSync(path.join(LIB, 'og', 'challengeCard.js'),
  `exports.renderChallengeCardPng = async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]);\n`);
fs.writeFileSync(path.join(LIB, 'mutations', 'registry.js'),
  `exports.getWeekName = (w) => 'Test Theme ' + w;\n` +
  `exports.getActiveMutations = () => [{ name: 'Stub', description: 'Does a thing. And more.' }];\n`);

// ── A webhook that counts posts ───────────────────────────────────────────
let posts = 0;
let status = 204;
const server = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    if (status < 400) posts++;
    res.writeHead(status).end();
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const WEBHOOK = `http://127.0.0.1:${server.address().port}/hook`;

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'announcestate-'));
const STATE_FILE = path.join(stateDir, 'weekly-announce.json');
process.env.TEST_STATE_DIR = stateDir;
process.env.WEEKLY_ANNOUNCE_FILE = STATE_FILE;
process.env.DISCORD_WEEKLY_WEBHOOK_URL = WEBHOOK;

const req = createRequire(import.meta.url);
const ANNOUNCER = path.join(LIB, 'discord-weekly-announcer.js');
function loadFreshInstance() {
  // Drop it from the cache so we get a genuinely separate module instance —
  // the Next.js "same file resolved twice" hazard, reproduced.
  delete req.cache[req.resolve(ANNOUNCER)];
  return req(ANNOUNCER);
}

const lockFor = (week) => `${STATE_FILE}.week-${week}.lock`;
const lastAnnounced = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).lastAnnouncedWeek; } catch { return null; }
};

// ── 1. Concurrent announcers race for one week ────────────────────────────
console.log('\nConcurrent announcers');
{
  const mod = loadFreshInstance();
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) => mod.announceWeekOnce(101, `racer ${i}`)),
  );
  check('exactly one webhook post', posts === 1, `posts=${posts}`);
  check('exactly one caller reports success',
    results.filter(Boolean).length === 1, `winners=${results.filter(Boolean).length}`);
  check('lastAnnouncedWeek recorded', lastAnnounced() === 101, `value=${lastAnnounced()}`);
}

// ── 2. A second module instance (duplicate register / restart) ────────────
console.log('\nSecond module instance, same challenge');
{
  const mod = loadFreshInstance();
  const ok = await mod.announceWeekOnce(101, 'duplicate instance');
  check('does not post again', posts === 1, `posts=${posts}`);
  check('reports skipped', ok === false);
}

// ── 3. Separate processes (overlapping deploy) ────────────────────────────
// globalThis can't help here — only the atomic claim file can.
console.log('\nSeparate processes');
{
  const child = path.join(outDir, 'child.mjs');
  fs.writeFileSync(child,
    `import { createRequire } from 'module';\n` +
    `const r = createRequire(import.meta.url);\n` +
    `const m = r(${JSON.stringify(ANNOUNCER)});\n` +
    `console.log('RESULT ' + String(await m.announceWeekOnce(Number(process.argv[2]), 'child')));\n`);
  const spawn = (week) => promisify(execFile)(process.execPath, [child, String(week)],
    { encoding: 'utf8', env: { ...process.env } })
    .then(({ stdout }) => /RESULT (true|false)/.exec(stdout)?.[1]);

  const already = await spawn(101);
  check('child skips an announced challenge', already === 'false' && posts === 1, `posts=${posts}`);

  // Two servers straddling 09:00 on a fresh challenge, launched together.
  const raced = await Promise.all([spawn(102), spawn(102)]);
  check('two processes post once between them', posts === 2, `posts=${posts}`);
  check('exactly one process wins',
    raced.filter((r) => r === 'true').length === 1, `winners=${raced.join(',')}`);
}

// ── 4. A failed post hands the challenge back ─────────────────────────────
console.log('\nFailed post releases the claim');
{
  const mod = loadFreshInstance();
  status = 500;
  const bad = await mod.announceWeekOnce(103, 'failing post');
  check('reports failure', bad === false);
  check('claim file removed', !fs.existsSync(lockFor(103)));
  check('lastAnnouncedWeek not advanced', lastAnnounced() === 102, `value=${lastAnnounced()}`);

  status = 204;
  const good = await mod.announceWeekOnce(103, 'retry');
  check('retry posts once', good === true && posts === 3, `posts=${posts}`);
  check('older claims pruned', !fs.existsSync(lockFor(101)) && !fs.existsSync(lockFor(102)));
}

// ── 5. Duplicate startWeeklyAnnouncer() in one process ────────────────────
console.log('\nDuplicate scheduler start');
{
  const lines = [];
  const realLog = console.log;
  console.log = (...a) => { lines.push(a.join(' ')); };
  const a = loadFreshInstance();
  const b = loadFreshInstance(); // separate instance, shares globalThis
  a.startWeeklyAnnouncer();
  b.startWeeklyAnnouncer();
  await new Promise((r) => setTimeout(r, 200));
  console.log = realLog;

  const scheduled = lines.filter((l) => l.includes('next post scheduled')).length;
  const ignored = lines.filter((l) => l.includes('ignoring duplicate start')).length;
  check('only one scheduler armed', scheduled === 1, `scheduled=${scheduled}`);
  check('duplicate start ignored', ignored === 1, `ignored=${ignored}`);
}

server.close();
fs.rmSync(outDir, { recursive: true, force: true });
fs.rmSync(stateDir, { recursive: true, force: true });

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
