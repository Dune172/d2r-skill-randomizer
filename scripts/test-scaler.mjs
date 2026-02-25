/**
 * test-scaler.mjs — Verifies scaleMonstats act-filtering logic against real monstats.txt.
 * Run with: node scripts/test-scaler.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'txt', 'monstats.txt');

// ── Inline scaleMonstats (mirrors src/lib/randomizer/players-scaler.ts exactly) ──────────────

const HP_COLS = ['minHP', 'maxHP', 'MinHP(N)', 'MaxHP(N)', 'MinHP(H)', 'MaxHP(H)'];
const EXP_COLS = ['Exp', 'Exp(N)', 'Exp(H)'];
const DAMAGE_AR_COLS = [
  'A1MinD', 'A1MaxD', 'A1TH', 'A2MinD', 'A2MaxD', 'A2TH', 'S1MinD', 'S1MaxD', 'S1TH',
  'A1MinD(N)', 'A1MaxD(N)', 'A1TH(N)', 'A2MinD(N)', 'A2MaxD(N)', 'A2TH(N)', 'S1MinD(N)', 'S1MaxD(N)', 'S1TH(N)',
  'A1MinD(H)', 'A1MaxD(H)', 'A1TH(H)', 'A2MinD(H)', 'A2MaxD(H)', 'A2TH(H)', 'S1MinD(H)', 'S1MaxD(H)', 'S1TH(H)',
];
const TC_COL = 'TreasureClass';
const ACT_RE = /^Act (\d)/;

const BOSS_ACTS = {
  // Act 1
  andariel: 1, bloodraven: 1, griswold: 1, smith: 1,
  quillrat1: 1, quillrat2: 1, quillrat3: 1, quillrat4: 1, quillrat5: 1,
  quillrat6: 1, quillrat7: 1, quillrat8: 1,
  // Act 2
  radament: 2, duriel: 2, summoner: 2, flyingscimitar: 2,
  swarm1: 2, swarm2: 2, swarm3: 2, swarm4: 2, swarm5: 2,
  vulture1: 2, vulture2: 2, vulture3: 2, vulture4: 2, vulture5: 2,
  maggotegg1: 2, maggotegg2: 2, maggotegg3: 2, maggotegg4: 2, maggotegg5: 2, maggotegg6: 2,
  sarcophagus: 2,
  // Act 3
  mephisto: 3, councilmember1: 3, councilmember2: 3, councilmember3: 3,
  mosquito1: 3, mosquito2: 3, mosquito3: 3, mosquito4: 3,
  tentacle1: 3, tentacle2: 3, tentacle3: 3,
  tentaclehead1: 3, tentaclehead2: 3, tentaclehead3: 3,
  compellingorb: 3,
  // Act 4
  diablo: 4, izual: 4, hephasto: 4,
  trappedsoul1: 4, trappedsoul2: 4, mephistospirit: 4,
  lightningspire: 4, firetower: 4, wakeofdestruction: 4,
  suicideminion1: 4, suicideminion2: 4, suicideminion3: 4, suicideminion4: 4,
  suicideminion5: 4, suicideminion6: 4, suicideminion7: 4, suicideminion8: 4,
  suicideminion9: 4, suicideminion10: 4, suicideminion11: 4,
  // Act 5
  baalcrab: 5, nihlathakboss: 5,
  baalthrone: 5, baalclone: 5,
  baaltentacle1: 5, baaltentacle2: 5, baaltentacle3: 5, baaltentacle4: 5, baaltentacle5: 5,
  ancientbarb1: 5, ancientbarb2: 5, ancientbarb3: 5,
  painworm1: 5, painworm2: 5, painworm3: 5, painworm4: 5, painworm5: 5,
  act5pow: 5,
};

function scaleMonstats(headers, rows, playerCount, acts = [1, 2, 3, 4, 5]) {
  const hpExpMultiplier = (playerCount + 1) / 2;
  const damageArMultiplier = 1 + (playerCount - 1) / 16;
  const tcIdx = headers.indexOf(TC_COL);
  const actsSet = new Set(acts);

  return rows.map(row => {
    const id = row[0];
    let monsterAct = null;
    if (tcIdx !== -1) {
      const tc = row[tcIdx] ?? '';
      const m = tc.match(ACT_RE);
      monsterAct = m ? parseInt(m[1]) : (BOSS_ACTS[id] ?? null);
    }
    if (monsterAct === null || !actsSet.has(monsterAct)) return row;

    const scaled = [...row];
    for (const col of [...HP_COLS, ...EXP_COLS]) {
      const idx = headers.indexOf(col);
      if (idx === -1) continue;
      const val = parseInt(scaled[idx], 10);
      if (!isNaN(val) && val > 0) {
        scaled[idx] = String(Math.round(val * hpExpMultiplier));
      }
    }
    for (const col of DAMAGE_AR_COLS) {
      const idx = headers.indexOf(col);
      if (idx === -1) continue;
      const val = parseInt(scaled[idx], 10);
      if (!isNaN(val) && val > 0) {
        scaled[idx] = String(Math.round(val * damageArMultiplier));
      }
    }
    return scaled;
  });
}

// ── Parse monstats.txt ────────────────────────────────────────────────────────────────────────

const raw = fs.readFileSync(DATA_FILE, 'utf-8').replace(/\r/g, '');
const lines = raw.split('\n').filter(l => l.trim());
const headers = lines[0].split('\t');
const rows = lines.slice(1).map(l => l.split('\t'));

const tcIdx = headers.indexOf(TC_COL);
const minHpIdx = headers.indexOf('minHP');

console.log(`Loaded ${rows.length} monster rows. TreasureClass col: ${tcIdx}, minHP col: ${minHpIdx}\n`);

// ── Test helpers ──────────────────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.log(`  FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`);
    fail++;
  }
}

function getRow(id) {
  return rows.find(r => r[0] === id);
}

function origMinHP(id) {
  const row = getRow(id);
  if (!row) return null;
  return parseInt(row[minHpIdx], 10);
}

function scaledMinHP(id, playerCount, acts) {
  const row = getRow(id);
  if (!row) return null;
  const result = scaleMonstats(headers, [row], playerCount, acts);
  return parseInt(result[0][minHpIdx], 10);
}

function expectedHP(original, playerCount) {
  return Math.round(original * (playerCount + 1) / 2);
}

function expectedDamageAR(original, playerCount) {
  return Math.round(original * (1 + (playerCount - 1) / 16));
}

// ── Group A: Act isolation — only Act 1 selected, players=4 (multiplier=2.5×) ───────────────

console.log('Group A: Act isolation (players=4, acts=[1] only)');

for (const id of ['skeleton1', 'andariel', 'bloodraven']) {
  const orig = origMinHP(id);
  const scaled = scaledMinHP(id, 4, [1]);
  const exp = expectedHP(orig, 4);
  assert(`${id} scaled ×2.5 (orig=${orig} → ${exp})`, scaled === exp, `got ${scaled}`);
}

for (const [id, act] of [['sandraider1', 2], ['duriel', 2], ['mephisto', 3], ['diablo', 4], ['baalcrab', 5]]) {
  const orig = origMinHP(id);
  const scaled = scaledMinHP(id, 4, [1]);
  assert(`${id} (act ${act}) unchanged with acts=[1] (orig=${orig})`, scaled === orig, `got ${scaled}`);
}

// ── Group B: Intentionally excluded monsters — never scale ───────────────────────────────────

console.log('\nGroup B: Intentionally excluded (all acts enabled)');

for (const id of ['claygolem', 'valkyrie', 'hellbovine', 'diabloclone']) {
  const row = getRow(id);
  if (!row) {
    assert(`${id} exists in monstats.txt`, false, 'row not found');
    continue;
  }
  const tc = row[tcIdx] ?? '';
  const orig = origMinHP(id);
  const scaled = scaledMinHP(id, 4, [1, 2, 3, 4, 5]);
  assert(
    `${id} unscaled (TC="${tc}", orig=${orig})`,
    scaled === orig,
    `got ${scaled}`,
  );
}

// ── Group C: All acts = regression check ─────────────────────────────────────────────────────

console.log('\nGroup C: All-acts regression');

{
  const id = 'skeleton1';
  const orig = origMinHP(id);
  const act1Only = scaledMinHP(id, 4, [1]);
  const allActs = scaledMinHP(id, 4, [1, 2, 3, 4, 5]);
  assert(`${id} same result for acts=[1] vs all-acts`, act1Only === allActs, `acts=[1]: ${act1Only}, all: ${allActs}`);
}

{
  const id = 'sandraider1';
  const orig = origMinHP(id);
  const allActs = scaledMinHP(id, 4, [1, 2, 3, 4, 5]);
  const exp = expectedHP(orig, 4);
  assert(`${id} scales ×2.5 with all acts (orig=${orig} → ${exp})`, allActs === exp, `got ${allActs}`);
}

{
  const id = 'baalcrab';
  const orig = origMinHP(id);
  const allActs = scaledMinHP(id, 4, [1, 2, 3, 4, 5]);
  const exp = expectedHP(orig, 4);
  assert(`${id} scales ×2.5 with all acts (orig=${orig} → ${exp})`, allActs === exp, `got ${allActs}`);
}

// ── Group D: Act 5 BOSS_ACTS coverage ────────────────────────────────────────────────────────

console.log('\nGroup D: Act 5 BOSS_ACTS coverage');

for (const id of ['ancientbarb1', 'baaltentacle1']) {
  const row = getRow(id);
  if (!row) { assert(`${id} exists`, false, 'row not found'); continue; }
  const tc = row[tcIdx] ?? '';
  const orig = origMinHP(id);
  if (orig <= 0) { assert(`${id} has HP > 0`, false, `minHP=${orig}`); continue; }

  const exp = expectedHP(orig, 4);
  const scaledAct5 = scaledMinHP(id, 4, [5]);
  const scaledAct1 = scaledMinHP(id, 4, [1]);
  assert(`${id} (TC="${tc}") scales with acts=[5] (${orig}→${exp})`, scaledAct5 === exp, `got ${scaledAct5}`);
  assert(`${id} unchanged with acts=[1]`, scaledAct1 === orig, `got ${scaledAct1}`);
}

// ── Group E: Named TC inventory — informational ───────────────────────────────────────────────

console.log('\nGroup E: Named TC inventory (non-"Act N", non-empty)');

// TCs that are intentionally excluded from scaling (Cow Level, Diablo Clone event)
const EXCLUDED_TCS = new Set(['Cow', 'ROP']);

const namedTCs = new Map(); // tc → [id, ...]
for (const row of rows) {
  const id = row[0];
  const tc = (row[tcIdx] ?? '').trim();
  if (!tc || ACT_RE.test(tc)) continue;
  if (!namedTCs.has(tc)) namedTCs.set(tc, []);
  namedTCs.get(tc).push(id);
}

let unexpectedCount = 0;
for (const [tc, ids] of [...namedTCs.entries()].sort()) {
  if (EXCLUDED_TCS.has(tc)) {
    console.log(`  [excluded]  TC="${tc}" → ${ids.join(', ')} (intentionally not scaled)`);
    continue;
  }
  const covered = ids.every(id => id in BOSS_ACTS);
  const uncoveredIds = ids.filter(id => !(id in BOSS_ACTS));
  if (covered) {
    console.log(`  [covered]   TC="${tc}" → ${ids.join(', ')}`);
  } else {
    unexpectedCount++;
    console.log(`  [UNCOVERED] TC="${tc}" → ${uncoveredIds.join(', ')} (not in BOSS_ACTS — gap?)`);
  }
}

assert(
  `All named TCs are in BOSS_ACTS or intentionally excluded (Cow Level, ROP)`,
  unexpectedCount === 0,
  `${unexpectedCount} unexpected uncovered TC(s) — see list above`,
);

// ── Group F: Damage & AR scaling (+6.25% per player above P1) ─────────────────────────────────

console.log('\nGroup F: Damage & AR scaling');

const a1minDIdx = headers.indexOf('A1MinD');

function origA1MinD(id) {
  const row = getRow(id);
  if (!row) return null;
  return parseInt(row[a1minDIdx], 10);
}

function scaledA1MinD(id, playerCount, acts) {
  const row = getRow(id);
  if (!row) return null;
  const result = scaleMonstats(headers, [row], playerCount, acts);
  return parseInt(result[0][a1minDIdx], 10);
}

{
  const id = 'skeleton1';
  for (const players of [4, 8]) {
    const orig = origA1MinD(id);
    const scaled = scaledA1MinD(id, players, [1, 2, 3, 4, 5]);
    const exp = expectedDamageAR(orig, players);
    assert(`${id} A1MinD ×${(1 + (players - 1) / 16).toFixed(4)} at P${players} (orig=${orig} → ${exp})`, scaled === exp, `got ${scaled}`);
  }
}

for (const id of ['claygolem', 'hellbovine']) {
  const orig = origA1MinD(id);
  const scaled = scaledA1MinD(id, 8, [1, 2, 3, 4, 5]);
  assert(`${id} A1MinD unchanged (excluded, orig=${orig})`, scaled === orig, `got ${scaled}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
