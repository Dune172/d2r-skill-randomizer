// Grade an Open Acts spike session from the observe -watch log.
// Usage: node check-arena.mjs <events.jsonl> [repoRoot]
// Prints one line per test: PASS / FAIL / NOT RUN, with the evidence.
import fs from 'fs';
import os from 'os';
import path from 'path';

const [logPath, repo = process.cwd()] = process.argv.slice(2);
const events = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

// objects.txt *ID -> Class, so object ids from memory read as names
const objRaw = fs.readFileSync(path.join(repo, 'data', 'txt', 'objects.txt'), 'latin1').split(/\r?\n/);
const objHead = objRaw[0].split('\t');
const objClass = {};
for (const l of objRaw.slice(1)) {
  const c = l.split('\t');
  if (c[objHead.indexOf('*ID')] !== undefined) objClass[c[objHead.indexOf('*ID')]] = c[objHead.indexOf('Class')];
}
const srcName = s => (s?.startsWith('obj') ? objClass[s.slice(3)] ?? s : s);

// Split the log into per-character sessions.
const sessions = [];
for (const e of events) {
  if (e.ev === 'char') sessions.push({ char: e, ev: [] });
  else if (sessions.length) sessions[sessions.length - 1].ev.push(e);
}
const byName = n => sessions.filter(s => s.char.name === n);
const results = [];
const report = (id, what, status, evidence) => results.push({ id, what, status, evidence });

// ── saves ──────────────────────────────────────────────────────────────────
{
  const s = byName('Spiketest')[0];
  if (!s) report('S1', 'Generated per-seed starter (Spiketest, mod seed1234) loads', 'NOT RUN', '');
  else {
    const extra = Object.entries(s.char.skills ?? {}).filter(([id]) => !['0', '1', '2', '3', '4', '5', '217', '218', '219', '220'].includes(id));
    report('S1', 'Spiketest loads at level 1 with exactly one class skill point', s.char.level === 1 && extra.length === 1 && extra[0][1] === 1 ? 'PASS' : 'FAIL',
      `level ${s.char.level}, class skills ${JSON.stringify(Object.fromEntries(extra))}`);
  }
}
{
  const s = byName('Nmtest')[0];
  if (!s) report('S2', 'All-difficulty save (Nmtest) opens Act II/III in Nightmare', 'NOT RUN', '');
  else {
    const act1 = s.ev.filter(e => e.ev === 'monlevel' && e.areaId >= 2 && e.areaId <= 39);
    const nm = act1.some(e => e.maxLevel >= 30);
    const tabs = s.ev.filter(e => e.ev === 'wptab').map(e => e.tab);
    const a2 = tabs.some(t => t.includes('Lut Gholein'));
    const a3 = tabs.some(t => t.includes('Kurast Dock')); // d2go calls it "Kurast Docktown"
    report('S2', 'Nmtest in Nightmare shows Act II and III waypoint tabs', nm && a2 && a3 ? 'PASS' : nm ? 'FAIL' : 'NOT RUN',
      `nightmare=${nm} (max Act I monster level ${Math.max(0, ...act1.map(e => e.maxLevel))}), Act II tab=${a2}, Act III tab=${a3}`);
  }
}

// ── arena: drops and hosts ─────────────────────────────────────────────────
const arena = byName('Arena').flatMap(s => s.ev);
const drops = arena.filter(e => e.ev === 'drop');
const pickups = arena.filter(e => e.ev === 'pickup').map(e => e.item);
const tcTest = (id, item, label) => {
  const fromKills = drops.filter(e => e.item === item && e.src?.startsWith('mon'));
  const status = !arena.some(e => e.ev === 'kill') ? 'NOT RUN' : fromKills.length >= 2 ? 'PASS' : fromKills.length === 1 ? 'PARTIAL' : 'FAIL';
  report(id, `Monster TC drops ${label}, again on a second kill, and it can be picked up`, status === 'PASS' && !pickups.includes(item) ? 'PARTIAL' : status,
    `${fromKills.length} drops from kills, picked up=${pickups.includes(item)}`);
};
tcTest('D1', 'KhalimsEye', "Khalim's Eye (misc, spawnable=0)");
tcTest('D2', 'KhalimsBrain', "Khalim's Brain (misc, spawnable=1)");
tcTest('D3', 'WirtsLeg', "Wirt's Leg (weapon)");

const hostTest = (id, classes, item, label, optional) => {
  const opens = arena.filter(e => e.ev === 'open' && classes.includes(objClass[e.obj]));
  const got = drops.filter(e => e.item === item && classes.includes(srcName(e.src)));
  const status = !opens.length ? (optional ? 'NOT RUN (optional)' : 'NOT RUN') : got.length ? 'PASS' : 'FAIL';
  report(id, label, status, `${opens.length} opened, ${got.length} ${item} credited, picked up=${pickups.includes(item)}`);
};
hostTest('H1', ['ChestOutdoor1', 'ChestOutdoor2', 'ChestOutdoor3', 'ChestOutdoor4', 'Chest2', 'Chest3', 'Chest4'], 'StaffOfKings', 'Chest host with handler 41 drops the Staff of Kings');
hostTest('H2', ['LargeChestR', 'LargeChestL'], 'KhalimsHeart', 'Mode1=0 chest host with handler 57 drops Khalim\'s Heart');
hostTest('H3', ['RogueCorpse1', 'RogueCorpse2', 'RogueRollingCorpse1', 'RogueStakedCorpse1', 'RogueStakedCorpse2', 'BurnedBody1Act1'], 'ScrollOfInifuss', 'Corpse host with handler 12 drops the Inifuss scroll');
{
  const decoded = pickups.includes('KeyToTheCairnStones');
  report('H4', 'Akara decodes a moved Inifuss scroll', decoded ? 'PASS' : pickups.includes('ScrollOfInifuss') ? 'NOT RUN' : 'NOT RUN', `key picked up=${decoded}`);
}
hostTest('R1', ['Malus'], 'HoradricCube', 'Real host: Malus (Mode1=0) with handler 39 drops the Cube', true);
hostTest('R2', ['InifussTree'], 'LamEsensTome', 'Real host: Inifuss tree with handler 28 drops Lam Esen\'s Tome', true);
hostTest('R3', ['Wirt'], 'HoradricScroll', 'Real host: Wirt\'s body with handler 40 drops the Horadric Scroll', true);
{
  const flail = drops.filter(e => e.item === 'KhalimsFlail' && e.src?.startsWith('mon'));
  report('R4', 'Superunique TC: Griswold drops Khalim\'s Flail', flail.length ? 'PASS' : 'NOT RUN (optional)', `${flail.length} flail drops from kills`);
}
{
  const opened = arena.some(e => e.ev === 'menu' && /quest=true/.test(e.menus));
  report('Q1', 'Quest log opened (hint text itself needs one screenshot or your eyes)', opened ? 'CHECK TEXT' : 'NOT RUN', '');
}

// ── launcher (file system, not the game) ───────────────────────────────────
{
  const p = path.join(os.homedir(), 'Saved Games', 'Diablo II Resurrected', 'mods', 'd2rr_openacts_test', 'Lnktest.d2s');
  report('L1', 'Launcher shortcut installed Lnktest.d2s', fs.existsSync(p) ? 'PASS' : 'NOT RUN', fs.existsSync(p) ? p : 'file absent');
  const lnk = byName('Lnktest')[0];
  report('L2', 'Lnktest character loads', lnk ? 'PASS' : 'NOT RUN', lnk ? `level ${lnk.char.level}` : '');
}

const w = Math.max(...results.map(r => r.status.length));
for (const r of results) console.log(`${r.status.padEnd(w)}  ${r.id}  ${r.what}${r.evidence ? `  - ${r.evidence}` : ''}`);
const unknownDrops = drops.filter(e => !e.src).map(e => e.item);
if (unknownDrops.length) console.log(`\n(${unknownDrops.length} ground items had no nearby open/kill to credit: ${[...new Set(unknownDrops)].join(', ')})`);
