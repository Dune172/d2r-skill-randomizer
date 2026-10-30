/**
 * verify-ap-mode.mjs
 *
 * Asserts the Archipelago-mode invariants on real generated mods, and that each
 * manifest agrees with the skills.txt actually shipped beside it.
 *
 * This is the guard that stops a future mutation or writer change from silently
 * breaking Archipelago:
 *
 *   SkillsPerLevel = 1     the client writes the unspent-point count, and can only write
 *                          a stat the game has created; levelling is what creates it
 *   StartSkill = ''        the normal pipeline hands every class a free starting skill
 *   reqlevel = 1           a point may go into any skill, in any order
 *   reqskill1..3 empty     same reason: no prerequisite chain to satisfy
 *   30 slots, S00..S29     the client counts spent points over exactly these rows
 *   skillId correctness    skillId must index the row holding that skill
 *   no seasonal overlay    a room's mod must not change when the month does
 *   same tree as the seed  Archipelago seed N plays the tree public seed N shows
 *   custom stats           ap_keys and ap_mail exist, are saved, and survive at zero
 *   Sigil and Draught      every class starts with both; the Draught creates the stats
 *   mailbox recipes        each deliverable has its own offer code per Sigil; the one
 *                          recipe alive for an offer returns the OTHER Sigil and a
 *                          Receipt, so an offer is delivered exactly once
 *   key gates              only when asked for, and then on both quest recipes
 *
 * Non-class rows (monster/superunique, empty charclass) are deliberately NOT checked:
 * AP mode leaves them at vanilla values on purpose.
 *
 * Run with a dev server up:  node scripts/verify-ap-mode.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import AdmZip from 'adm-zip';

const BASE = process.env.D2RR_BASE || 'http://localhost:3210';
// Read from the source rather than hardcoded: a stale copy here makes the server answer
// 409, and every case then reads ERROR as if the endpoint were broken.
const CONTRACT_VERSION = Number(
  /AP_CONTRACT_VERSION = (\d+)/.exec(
    readFileSync(new URL('../src/lib/randomizer/ap-mode.ts', import.meta.url), 'utf8'),
  )[1],
);

const CASES = [
  { seed: 1234, characterClass: 'pal', savepath: 'ap_test_pal' },
  { seed: 1234, characterClass: 'sor', savepath: 'ap_test_sor' },
  { seed: 7,    characterClass: 'ama', savepath: 'ap_test_ama' },
  { seed: 999,  characterClass: 'bar', savepath: 'ap_test_bar' },
  { seed: 4242, characterClass: 'nec', savepath: 'ap_test_nec' },
  { seed: 31337, characterClass: 'dru', savepath: 'ap_test_dru' },
  { seed: 55,   characterClass: 'ass', savepath: 'ap_test_ass' },
  { seed: 808,  characterClass: 'war', savepath: 'ap_test_war' },
  { seed: 1234, characterClass: 'pal', savepath: 'ap_test_pal_keys', options: { keyItems: true } },
  { seed: 55,   characterClass: 'ass', savepath: 'ap_test_ass_keys', options: { keyItems: true, xpMultiplier: 2, monsterShuffle: true } },
];

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l !== '');
  return { headers: lines[0].split('\t'), rows: lines.slice(1).map(l => l.split('\t')) };
}

const col = (headers, name) => {
  const i = headers.indexOf(name);
  if (i === -1) throw new Error(`column "${name}" missing`);
  return i;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The endpoint rate-limits per address (6/60s), so each case presents its own, and
 *  sheds load at queue depth 8, which is waited out. */
let ip = 0;
async function fetchApMod(c) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const r = await fetch(`${BASE}/api/archipelago/mod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.7.0.${++ip % 250}` },
      body: JSON.stringify({ ...c, contractVersion: CONTRACT_VERSION }),
    });
    if (r.ok) return new AdmZip(Buffer.from(await r.arrayBuffer()));
    if (r.status === 429 || r.status === 503) {
      const retry = Number(r.headers.get('retry-after')) || 20;
      process.stdout.write(` [${r.status}, waiting ${retry}s]`);
      await sleep((retry + 1) * 1000);
      continue;
    }
    throw new Error(`${c.characterClass}/${c.seed}: ${r.status} ${await r.text()}`);
  }
  throw new Error(`${c.characterClass}/${c.seed}: still throttled after 12 attempts`);
}

function check(failures, cond, msg) {
  if (!cond) failures.push(msg);
}

async function verifyCase(c) {
  const failures = [];
  const zip = await fetchApMod(c);
  const entries = zip.getEntries().filter(e => !e.isDirectory);
  const read = suffix => {
    const e = entries.find(x => x.entryName.replace(/\\/g, '/').endsWith(suffix));
    return e ? e.getData().toString('utf-8') : null;
  };

  // --- manifest present and self-consistent -------------------------------
  const manifestRaw = read('d2rr-ap-manifest.json');
  check(failures, manifestRaw !== null, 'manifest missing from zip');
  if (!manifestRaw) return failures;
  const manifest = JSON.parse(manifestRaw);

  check(failures, manifest.contractVersion === CONTRACT_VERSION,
    `manifest contractVersion ${manifest.contractVersion} != ${CONTRACT_VERSION}`);
  check(failures, manifest.seed === c.seed, `manifest seed ${manifest.seed} != ${c.seed}`);
  check(failures, manifest.characterClass === c.characterClass,
    `manifest class ${manifest.characterClass} != ${c.characterClass}`);
  check(failures, manifest.savepath === c.savepath,
    `manifest savepath ${manifest.savepath} != ${c.savepath}`);
  // The client installs the mod folder and refuses anything outside it, so an AP zip
  // carries nothing else (no launcher shortcut).
  const outside = entries.map(e => e.entryName.replace(/\\/g, '/'))
    .filter(name => !name.startsWith(`${manifest.modName}/`));
  check(failures, outside.length === 0, `entries outside ${manifest.modName}/: ${outside.join(', ')}`);

  // --- modinfo savepath isolation -----------------------------------------
  const modinfo = read('modinfo.json');
  check(failures, modinfo !== null, 'modinfo.json missing');
  if (modinfo) {
    const mi = JSON.parse(modinfo.replace(/^﻿/, ''));
    check(failures, mi.savepath === c.savepath,
      `modinfo savepath "${mi.savepath}" != "${c.savepath}" — runs would share saves`);
  }

  // --- charstats: player earns nothing ------------------------------------
  const csRaw = read('global/excel/charstats.txt');
  check(failures, csRaw !== null, 'charstats.txt missing');
  if (csRaw) {
    const cs = parseTsv(csRaw);
    const spl = col(cs.headers, 'SkillsPerLevel');
    const start = col(cs.headers, 'StartSkill');
    for (const row of cs.rows) {
      if (!row[0] || row[0] === 'Expansion') continue;
      check(failures, row[spl] !== '0' && row[spl] !== '',
        `${row[0]}: SkillsPerLevel="${row[spl]}", expected non-zero so the ` +
        `SkillPoints stat exists for the client to write`);
      check(failures, row[start] === '', `${row[0]}: StartSkill="${row[start]}", expected empty`);
    }
  }

  // --- skills: every class row reachable at clvl 1, no prereqs ------------
  const skRaw = read('global/excel/skills.txt');
  check(failures, skRaw !== null, 'skills.txt missing');
  if (!skRaw) return failures;
  const sk = parseTsv(skRaw);
  const cName = col(sk.headers, 'skill');
  const cClass = col(sk.headers, 'charclass');
  const cReqLvl = col(sk.headers, 'reqlevel');
  const cReq = ['reqskill1', 'reqskill2', 'reqskill3'].map(n => col(sk.headers, n));

  let badLvl = 0, badReq = 0;
  sk.rows.forEach(row => {
    if (!row[cClass]) return; // non-class row: left vanilla on purpose
    if (row[cReqLvl] !== '' && row[cReqLvl] !== '1') badLvl++;
    if (cReq.some(i => row[i] !== '')) badReq++;
  });
  check(failures, badLvl === 0, `${badLvl} class rows have reqlevel not in {empty,1}`);
  check(failures, badReq === 0, `${badReq} class rows still have a reqskill set`);

  // --- manifest <-> skills.txt agreement ----------------------------------
  const slots = manifest.classes?.[c.characterClass]?.slots ?? [];
  check(failures, slots.length === 30, `manifest has ${slots.length} slots, expected 30`);

  const seenSlotIds = new Set();
  for (const s of slots) {
    check(failures, !seenSlotIds.has(s.slotId), `duplicate slotId ${s.slotId}`);
    seenSlotIds.add(s.slotId);

    // THE critical assertion: skillId must index the row holding that skill, or the
    // client counts another skill's points as this character's.
    const row = sk.rows[s.skillId];
    check(failures, row !== undefined, `slot ${s.slotId}: skillId ${s.skillId} out of range`);
    if (row) {
      check(failures, row[cName] === s.skillName,
        `slot ${s.slotId}: skillId ${s.skillId} is "${row[cName]}", manifest says "${s.skillName}"`);
      check(failures, row[cClass] === c.characterClass,
        `slot ${s.slotId}: row charclass "${row[cClass]}" != ${c.characterClass}`);
    }
  }

  // Slot ids must be the seed-independent S00..S29 form. Grid position is NOT stable
  // across seeds (tree assignment changes which cells are occupied), so keying items on
  // tab/row/col would give the apworld a different item table per seed.
  const expectedIds = Array.from({ length: 30 }, (_, i) => `${c.characterClass}:S${String(i).padStart(2, '0')}`);
  const missing = expectedIds.filter(id => !seenSlotIds.has(id));
  check(failures, missing.length === 0,
    `slot ids are not the stable S00..S29 set; missing ${missing.slice(0, 4).join(', ')}`);

  // --- custom stats, the Sigil, the mailbox and the key gates ---------------
  const tables = manifest.tables ?? {};
  const isc = parseTsv(read('global/excel/itemstatcost.txt') ?? '');
  const iscRow = name => isc.rows.find(r => r[0] === name);
  const iscCell = (row, name) => row?.[isc.headers.indexOf(name)];
  for (const [name, id] of [['ap_keys', tables.stats?.keys], ['ap_mail', tables.stats?.mail]]) {
    const row = iscRow(name);
    check(failures, row !== undefined, `itemstatcost.txt has no ${name}`);
    if (!row) continue;
    // The id is the row's position: D2R indexes stats by row, whatever *ID says.
    check(failures, isc.rows.indexOf(row) === id && iscCell(row, '*ID') === String(id),
      `${name}: manifest id ${id}, row ${isc.rows.indexOf(row)}, *ID ${iscCell(row, '*ID')}`);
    check(failures, iscCell(row, 'Saved') === '1' && iscCell(row, 'keepzero') === '1',
      `${name} must be saved and kept at zero`);
  }
  for (const name of ['statpts', 'newskills']) {
    check(failures, iscCell(iscRow(name), 'keepzero') === '1', `${name} must be kept at zero`);
  }

  const misc = parseTsv(read('global/excel/misc.txt') ?? '');
  const miscRow = code => misc.rows.find(r => r[misc.headers.indexOf('code')] === code);
  const miscCell = (row, name) => row?.[misc.headers.indexOf(name)];
  const statsOf = code => [1, 2, 3].map(n => miscCell(miscRow(code), `stat${n}`)).filter(Boolean);
  const sigils = tables.sigils ?? [];
  check(failures, sigils.length === 2 && sigils[0] !== sigils[1], 'the mailbox needs two different Sigils');
  for (const code of [...sigils, tables.attunement, tables.receipt]) {
    const row = miscRow(code);
    check(failures, row !== undefined, `${code} missing from misc.txt`);
    // A Sigil that right-click-converts into a potion would destroy the mailbox.
    check(failures, miscCell(row, 'Transmogrify') === '0' && miscCell(row, 'spawnable') === '0',
      `${code} still transmutes itself or spawns`);
  }
  for (const name of ['ap_keys', 'ap_mail', 'newskills']) {
    check(failures, statsOf(tables.attunement).includes(name), `the Draught does not create ${name}`);
  }
  check(failures, statsOf(tables.receipt).join() === 'ap_mail', 'the Receipt must add to ap_mail and nothing else');
  check(failures, miscCell(miscRow(tables.receipt), 'calc1') === '1', 'the Receipt must add exactly one');

  if (csRaw) {
    const cs = parseTsv(csRaw);
    for (const row of cs.rows) {
      if (!row[0] || row[0] === 'Expansion') continue;
      const items = Array.from({ length: 10 }, (_, i) => row[cs.headers.indexOf(`item${i + 1}`)]);
      for (const code of [sigils[0], tables.attunement, 'box']) {
        check(failures, items.includes(code), `${row[0]} does not start with ${code}`);
      }
    }
  }

  const cube = parseTsv(read('global/excel/cubemain.txt') ?? '');
  const cubeCell = (row, name) => row[cube.headers.indexOf(name)];
  const mailStat = String(tables.stats?.mail);
  const offers = new Set();
  const perItem = new Map();
  for (const m of tables.mail ?? []) {
    // Offers even, acknowledgements odd, everything below what a Draught adds.
    check(failures, m.offer % 2 === 0 && m.offer > tables.mailIdle && m.offer + 1 < tables.mailAttuned && !offers.has(m.offer),
      `mail offer ${m.offer} for ${m.item} is out of range or duplicated`);
    offers.add(m.offer);
    perItem.set(m.item, [...(perItem.get(m.item) ?? []), m.sigil]);
    // Exactly one recipe is alive for an offer, it takes that offer's Sigil, and it
    // hands back the OTHER one, so the offer cannot be transmuted twice.
    const recipe = cube.rows.filter(r => cubeCell(r, 'param') === mailStat && cubeCell(r, 'op') === '10'
      && cubeCell(r, 'value') === String(m.offer));
    check(failures, recipe.length === 1
      && cubeCell(recipe[0], 'numinputs') === '1' && cubeCell(recipe[0], 'input 1') === sigils[m.sigil]
      && cubeCell(recipe[0], 'output') === m.item
      && cubeCell(recipe[0], 'output b') === sigils[1 - m.sigil]
      && cubeCell(recipe[0], 'output c') === tables.receipt,
      `mail recipe for ${m.item} under offer ${m.offer} is missing or mis-keyed`);
  }
  for (const [item, held] of perItem) {
    check(failures, held.slice().sort().join() === '0,1', `${item} is not offered once for each Sigil`);
  }
  for (const sigil of sigils) {
    const recipes = cube.rows.filter(r => cubeCell(r, 'input 1') === sigil && cubeCell(r, 'numinputs') === '1');
    check(failures, recipes.length === perItem.size + 1,
      `${recipes.length} recipes take ${sigil} alone, expected one per deliverable plus the Draught`);
    // Recipes are tried in file order, so the Draught must be the last one for its Sigil.
    const last = recipes[recipes.length - 1];
    check(failures, last && cubeCell(last, 'output') === tables.attunement && cubeCell(last, 'op') === '8'
      && cubeCell(last, 'value') === String(tables.mailIdle) && cubeCell(last, 'output b') === sigil,
      `the Draught recipe for ${sigil} is missing, mis-keyed or not last`);
  }

  const baseRow = csRaw && parseTsv(csRaw);
  if (baseRow) {
    const className = { ama: 'Amazon', sor: 'Sorceress', nec: 'Necromancer', pal: 'Paladin', bar: 'Barbarian', dru: 'Druid', ass: 'Assassin', war: 'Warlock' }[c.characterClass];
    const row = baseRow.rows.find(r => r[0] === className);
    const sum = ['str', 'dex', 'int', 'vit'].reduce((n, k) => n + Number(row[baseRow.headers.indexOf(k)]), 0);
    check(failures, tables.baseAttributes === sum, `baseAttributes ${tables.baseAttributes} != ${sum}`);
  }

  const wantGates = c.options?.keyItems === true;
  check(failures, (tables.keyGates !== undefined) === wantGates, `keyGates ${wantGates ? 'missing' : 'present but not requested'}`);
  for (const [output, keys] of [['hst', tables.keyGates?.horadricStaff], ['qf2', tables.keyGates?.khalimsWill]]) {
    const recipe = cube.rows.filter(r => cubeCell(r, 'output') === output && cubeCell(r, 'enabled') === '1');
    check(failures, recipe.length === 1, `${recipe.length} recipes produce ${output}`);
    if (recipe.length !== 1) continue;
    if (wantGates) {
      check(failures, cubeCell(recipe[0], 'op') === '7' && cubeCell(recipe[0], 'param') === String(tables.stats.keys)
        && cubeCell(recipe[0], 'value') === String(keys + 1), `${output} is not gated on ${keys} keys`);
    } else {
      check(failures, cubeCell(recipe[0], 'param') === '', `${output} is gated although keys are off`);
    }
  }

  // --- no seasonal overlay ------------------------------------------------
  for (const season of ['autumn', 'winter']) {
    const overlayPath = new URL(`../data/${season}/overlay.zip`, import.meta.url);
    if (!existsSync(overlayPath)) continue;
    const overlayFiles = new AdmZip(readFileSync(overlayPath)).getEntries()
      .filter(e => !e.isDirectory && !e.entryName.startsWith('_'))
      .map(e => e.entryName);
    const shipped = new Set(entries.map(e => e.entryName.split(String.fromCharCode(92)).join('/')));
    const leaked = overlayFiles.filter(f => shipped.has(`${manifest.modName}/${manifest.modName}.mpq/data/${f}`));
    check(failures, leaked.length === 0, `${leaked.length} ${season} overlay files shipped, e.g. ${leaked[0]}`);
  }

  // --- same tree as the public seed ---------------------------------------
  const preview = await fetch(`${BASE}/api/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed: c.seed }),
  }).then(r => r.json());
  const previewClass = (preview.classes ?? []).find(x => x.code === c.characterClass);
  check(failures, previewClass !== undefined, 'spoiler has no entry for this class');
  if (previewClass) {
    // The spoiler names skills for display and the manifest by skills.txt row, so compare
    // what both state exactly: which cells of which tab are occupied.
    const cell = (tab, row, col) => `${tab}:${row}:${col}`;
    const spoiler = new Set(previewClass.tabs.flatMap((t, i) => t.skills.map(x => cell(i + 1, x.row, x.col))));
    const mine = new Set(slots.map(x => cell(x.tab, x.row, x.col)));
    const strays = [...mine].filter(x => !spoiler.has(x));
    check(failures, mine.size === 30 && spoiler.size === 30 && strays.length === 0,
      `tree layout differs from the public spoiler for this seed (${strays.length} cells, e.g. ${strays[0]})`);
  }

  return failures;
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`Dev server not reachable at ${BASE}. Start it with: node scripts/dev-cold-cache.mjs`);
    process.exit(2);
  }

  console.log(`Verifying AP mode invariants across ${CASES.length} cases\n`);
  let failed = 0;
  for (const c of CASES) {
    const label = `${c.characterClass}/${c.seed}${c.options ? ' +' + Object.keys(c.options).join('+') : ''}`.padEnd(48);
    process.stdout.write(`  ${label}`);
    let failures;
    try {
      failures = await verifyCase(c);
    } catch (err) {
      console.log(' ERROR');
      console.log(`    ${err.message}`);
      failed++;
      continue;
    }
    if (failures.length === 0) {
      console.log(' ok');
    } else {
      console.log(` FAIL (${failures.length})`);
      failures.slice(0, 12).forEach(f => console.log(`    - ${f}`));
      if (failures.length > 12) console.log(`    ... and ${failures.length - 12} more`);
      failed++;
    }
  }

  if (failed) {
    console.error(`\n${failed}/${CASES.length} cases failed AP mode verification.`);
    process.exit(1);
  }
  console.log(`\nAll ${CASES.length} cases satisfy the AP mode invariants.`);
}

main().catch(err => { console.error(`\n${err.message}`); process.exit(1); });
