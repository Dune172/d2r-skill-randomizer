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
 *   prerequisites kept     the class's tree keeps its chains; each names a skill of the class
 *   30 slots, S00..S29     the client counts spent points over exactly these rows
 *   skillId correctness    skillId must index the row holding that skill
 *   no seasonal overlay    a room's mod must not change when the month does
 *   same tree as the seed  Archipelago seed N plays the tree public seed N shows
 *   contract 5 tables      stats.keys, keyGates (only with keyItems), baseAttributes and
 *                          messageBox, starterSave, and nothing else
 *   Open Acts              with openActs, one ready-made character for the class with
 *                          Acts II and III open, no skill points, no quest done; without,
 *                          no character and starterSave null
 *   key stat               ap_keys exists at the manifest's id, is saved and survives at
 *                          zero; it is the only stat the mod adds
 *   no potions             no class starts with the old Sigils, Draught, Receipt or Tonic,
 *                          their misc.txt rows (if shipped) are vanilla, and cubemain.txt
 *                          is vanilla apart from the key gates
 *   message box            both chat layouts ship with exactly one ArchipelagoMessages box,
 *                          600 spaces of text, inserted as the panel's first child, every
 *                          vanilla line kept
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

const AP_MODE_SOURCE = readFileSync(new URL('../src/lib/randomizer/ap-mode.ts', import.meta.url), 'utf8');
const MESSAGE_BOX = /AP_MESSAGE_BOX = '([^']+)'/.exec(AP_MODE_SOURCE)[1];
const MESSAGE_CAPACITY = Number(/AP_MESSAGE_CAPACITY = (\d+)/.exec(AP_MODE_SOURCE)[1]);

/** Items contracts 1-4 repurposed: the Sigils, the Draught, the Receipt and the Tonic. */
const REMOVED_ITEMS = ['hrt', 'sol', 'elx', 'hrb', 'mpf'];

const VANILLA = Object.fromEntries(['itemstatcost', 'cubemain', 'misc'].map(name =>
  [name, parseTsv(readFileSync(new URL(`../data/txt/${name}.txt`, import.meta.url), 'utf8'))]));

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
  { seed: 1234, characterClass: 'pal', savepath: 'ap_test_pal_pooled', options: { keyItems: true, pooledStats: true } },
  { seed: 1234, characterClass: 'pal', savepath: 'ap_test_pal_open', options: { openActs: true } },
  { seed: 7,    characterClass: 'ama', savepath: 'ap_test_ama_open', options: { openActs: true, keyItems: true } },
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

  // --- skills: every class row reachable at clvl 1, prerequisites kept ----
  const skRaw = read('global/excel/skills.txt');
  check(failures, skRaw !== null, 'skills.txt missing');
  if (!skRaw) return failures;
  const sk = parseTsv(skRaw);
  const cName = col(sk.headers, 'skill');
  const cClass = col(sk.headers, 'charclass');
  const cReqLvl = col(sk.headers, 'reqlevel');
  const cReq = ['reqskill1', 'reqskill2', 'reqskill3'].map(n => col(sk.headers, n));

  let badLvl = 0, withReq = 0, badReq = 0;
  const classOf = new Map(sk.rows.map(r => [r[cName], r[cClass]]));
  sk.rows.forEach(row => {
    if (!row[cClass]) return; // non-class row: left vanilla on purpose
    if (row[cReqLvl] !== '' && row[cReqLvl] !== '1') badLvl++;
    const reqs = cReq.map(i => row[i]).filter(Boolean);
    if (row[cClass] === c.characterClass && reqs.length) withReq++;
    // A prerequisite must be a skill of the same class, or the tree could never open.
    if (reqs.some(name => classOf.get(name) !== row[cClass])) badReq++;
  });
  check(failures, badLvl === 0, `${badLvl} class rows have reqlevel not in {empty,1}`);
  check(failures, withReq >= 10, `only ${withReq} of the class's skills have a prerequisite; the tree's chains are missing`);
  check(failures, badReq === 0, `${badReq} class rows name a prerequisite outside their class`);

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

  // --- the key stat and the key gates -----------------------------------------
  const tables = manifest.tables ?? {};
  check(failures, JSON.stringify(Object.keys(tables).sort())
    === JSON.stringify(['baseAttributes', 'messageBox', 'starterSave', 'stats', ...(c.options?.keyItems ? ['keyGates'] : [])].sort()),
    `manifest tables has keys ${Object.keys(tables).sort().join()}, expected exactly the contract-5 shape`);
  check(failures, JSON.stringify(Object.keys(tables.stats ?? {})) === '["keys"]',
    `manifest tables.stats has ${Object.keys(tables.stats ?? {}).join()}, expected only keys`);
  check(failures, tables.messageBox === MESSAGE_BOX, `manifest messageBox "${tables.messageBox}" != ${MESSAGE_BOX}`);

  // --- Open Acts: the ready-made character ---------------------------------
  const starters = zip.getEntries().filter(e => e.entryName.startsWith(`${manifest.modName}/starter-saves/`) && e.entryName.endsWith('.d2s'));
  if (c.options?.openActs) {
    check(failures, starters.length === 1, `${starters.length} starter saves, expected the class's one`);
    check(failures, tables.starterSave === starters[0]?.entryName.slice(manifest.modName.length + 1),
      `manifest starterSave "${tables.starterSave}" does not name the shipped save`);
    const save = starters[0]?.getData();
    if (save) {
      const word = (d, w) => save.readUInt16LE(403 + 10 + d * 96 + w * 2);
      // Words 7 and 15 are "traveled to Act II / III"; quest words (what the client reads
      // as checks) must all be untouched, or a new character would report quests done.
      const questWords = [[1, 6], [9, 14], [17, 22], [25, 27], [33, 38]].flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
      for (let d = 0; d < 3; d++) {
        check(failures, word(d, 7) !== 0 && word(d, 15) !== 0, `difficulty ${d}: Acts II and III are not open`);
        check(failures, questWords.every(w => word(d, w) === 0), `difficulty ${d}: the starter save has a quest marked done`);
      }
      // The skill section ("if") follows the stats ("gf"), which follow the waypoints.
      const skills = save.indexOf(Buffer.from('if'), save.indexOf(Buffer.from('gf'), 781));
      check(failures, skills > 0 && save.subarray(skills + 2, skills + 32).every(b => b === 0),
        "the starter save has a skill point spent: every point must be Archipelago's");
      check(failures, save[21] === 0, 'the starter save has progressed past Normal');
    }
  } else {
    check(failures, starters.length === 0 && tables.starterSave === null, 'a mod without Open Acts ships a character');
  }

  const isc = parseTsv(read('global/excel/itemstatcost.txt') ?? '');
  const iscRow = name => isc.rows.find(r => r[0] === name);
  const iscCell = (row, name) => row?.[isc.headers.indexOf(name)];
  {
    const row = iscRow('ap_keys');
    const id = tables.stats?.keys;
    check(failures, row !== undefined, 'itemstatcost.txt has no ap_keys');
    if (row) {
      // The id is the row's position: D2R indexes stats by row, whatever *ID says.
      check(failures, isc.rows.indexOf(row) === id && iscCell(row, '*ID') === String(id),
        `ap_keys: manifest id ${id}, row ${isc.rows.indexOf(row)}, *ID ${iscCell(row, '*ID')}`);
      check(failures, iscCell(row, 'Saved') === '1' && iscCell(row, 'keepzero') === '1',
        'ap_keys must be saved and kept at zero');
      check(failures, Number(iscCell(row, 'CSvBits')) >= 10 && Number(iscCell(row, 'Send Bits')) >= 10,
        'ap_keys needs at least 10 bits');
    }
  }
  // ap_keys is the only stat the mod adds; the old mailbox stat is gone.
  check(failures, iscRow('ap_mail') === undefined, 'itemstatcost.txt still has ap_mail');
  check(failures, isc.rows.length === VANILLA.itemstatcost.rows.length + 1,
    `itemstatcost.txt has ${isc.rows.length - VANILLA.itemstatcost.rows.length} rows beyond vanilla, expected 1 (ap_keys)`);
  for (const name of ['statpts', 'newskills']) {
    check(failures, iscCell(iscRow(name), 'keepzero') === '1', `${name} must be kept at zero`);
  }

  // --- the items the old contracts repurposed are vanilla again -------------
  if (csRaw) {
    const cs = parseTsv(csRaw);
    for (const row of cs.rows) {
      if (!row[0] || row[0] === 'Expansion') continue;
      const items = Array.from({ length: 10 }, (_, i) => row[cs.headers.indexOf(`item${i + 1}`)]);
      const removed = items.filter(code => REMOVED_ITEMS.includes(code));
      check(failures, removed.length === 0, `${row[0]} still starts with ${removed.join(', ')}`);
      check(failures, items.includes('box'), `${row[0]} does not start with the Horadric Cube`);
    }
  }
  // misc.txt ships only when another feature edits it; if it does, these rows are vanilla.
  const miscRaw = read('global/excel/misc.txt');
  if (miscRaw) {
    const misc = parseTsv(miscRaw);
    const codeCol = col(misc.headers, 'code');
    const vCodeCol = col(VANILLA.misc.headers, 'code');
    for (const code of REMOVED_ITEMS) {
      const shipped = misc.rows.find(r => r[codeCol] === code);
      const vanilla = VANILLA.misc.rows.find(r => r[vCodeCol] === code);
      const same = shipped && vanilla && misc.headers.every((h, i) =>
        (shipped[i] ?? '') === (vanilla[VANILLA.misc.headers.indexOf(h)] ?? ''));
      check(failures, same, `misc.txt row ${code} differs from vanilla`);
    }
  }
  const namesRaw = read('/strings/item-names.json');
  if (namesRaw) {
    const names = JSON.parse(namesRaw.replace(/^﻿/, ''));
    const leftover = names.filter(e => /Archipelago|Draught of Attunement|Tonic of Renewal/.test(e.enUS ?? '')
      || e.id === 42000);
    check(failures, leftover.length === 0, `item-names.json still names ${leftover.map(e => e.Key).join(', ')}`);
  }

  // cubemain.txt is vanilla apart from the key gates: no mailbox, no brews.
  const cube = parseTsv(read('global/excel/cubemain.txt') ?? '');
  const cubeCell = (row, name) => row[cube.headers.indexOf(name)];
  check(failures, cube.rows.length === VANILLA.cubemain.rows.length,
    `cubemain.txt has ${cube.rows.length} recipes, vanilla has ${VANILLA.cubemain.rows.length}`);
  const gated = new Set(['hst', 'qf2']);
  let drifted = 0;
  cube.rows.forEach((row, i) => {
    const vanilla = VANILLA.cubemain.rows[i];
    if (!vanilla) return;
    const ignore = gated.has(cubeCell(row, 'output')) ? new Set(['op', 'param', 'value']) : new Set();
    const same = cube.headers.every((h, j) => ignore.has(h)
      || (row[j] ?? '') === (vanilla[VANILLA.cubemain.headers.indexOf(h)] ?? ''));
    if (!same) drifted++;
  });
  check(failures, drifted === 0, `${drifted} cubemain.txt recipes differ from vanilla beyond the key gates`);
  const apRecipes = cube.rows.filter(r => /Archipelago/i.test(cubeCell(r, 'description') ?? ''));
  check(failures, apRecipes.length === 0, `${apRecipes.length} Archipelago recipes left in cubemain.txt, e.g. ${apRecipes[0] && cubeCell(apRecipes[0], 'description')}`);

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

  // --- the chat-panel message box ----------------------------------------------
  for (const file of ['hudmessagepanel.json', 'hudmessagepanelhd.json']) {
    const zipPath = `${manifest.modName}/${manifest.modName}.mpq/data/global/ui/layouts/${file}`;
    const entry = entries.find(e => e.entryName.replace(/\\/g, '/') === zipPath);
    check(failures, entry !== undefined, `${zipPath} missing from zip`);
    if (!entry) continue;
    const shipped = entry.getData().toString('utf-8');
    const vanilla = readFileSync(new URL(`../data/archipelago/layouts/${file}`, import.meta.url), 'utf8');
    // Every vanilla line kept, in order, with one contiguous block inserted.
    const sl = shipped.split('\n');
    const vl = vanilla.split('\n');
    // The block goes right after the first "children": [, which is the panel's own: the
    // vanilla file opens with the panel object and its fields, then its children.
    const at = vl.findIndex(line => line.includes('"children": [')) + 1;
    check(failures, at > 0 && /^ {4}"children": \[\r?$/.test(vl[at - 1]),
      `${file}: the vanilla panel's own "children": [ is not where it was`);
    const added = sl.length - vl.length;
    const kept = at > 0 && added > 0 && vl.slice(0, at).every((line, i) => sl[i] === line)
      && vl.slice(at).every((line, i) => sl[at + added + i] === line);
    check(failures, kept, `${file}: the vanilla lines are not all preserved around one block after the panel's "children": [`);
    if (!kept) continue;
    let box;
    try {
      box = JSON.parse(sl.slice(at, at + added).join('\n').trim().replace(/,$/, ''));
    } catch (err) {
      failures.push(`${file}: the inserted block is not one JSON object (${err.message})`);
      continue;
    }
    check(failures, box.type === 'TextBoxWidget' && box.name === MESSAGE_BOX,
      `${file}: inserted ${box.type} "${box.name}", expected TextBoxWidget "${MESSAGE_BOX}"`);
    check(failures, box.fields?.text === ' '.repeat(MESSAGE_CAPACITY),
      `${file}: text is ${JSON.stringify(box.fields?.text)?.length - 2} characters, expected ${MESSAGE_CAPACITY} spaces`);
    const rect = file.endsWith('hd.json') ? { x: 60, y: 850, width: 1700, height: 450 } : { x: 20, y: 250, width: 560, height: 160 };
    check(failures, JSON.stringify(box.fields?.rect) === JSON.stringify(rect), `${file}: rect ${JSON.stringify(box.fields?.rect)}`);
    const style = box.fields?.style ?? {};
    check(failures, style.pointSize === '$MediumFontSize' && style.fontFace === 'BlizzardGlobal'
      && style.alignment?.h === 'left' && style.alignment?.v === 'bottom' && style.options?.lineWrap === true
      && style.options?.newlineHandling === 'standard' && style.dropShadow === '$DefaultDropShadow'
      && JSON.stringify(style.fontColor) === '{"r":255,"g":255,"b":255,"a":255}', `${file}: style differs from the tested box`);
    const occurrences = shipped.split(`"${MESSAGE_BOX}"`).length - 1;
    check(failures, occurrences === 1, `${file}: ${occurrences} ${MESSAGE_BOX} widgets, expected 1`);
    // And the whole file still reads as the game's panel, with the box first.
    try {
      const panel = JSON.parse(shipped.replace(/,(\s*[}\]])/g, '$1'));
      check(failures, panel.children?.[0]?.name === MESSAGE_BOX, `${file}: the box is not the panel's first child`);
    } catch (err) {
      failures.push(`${file}: does not parse once trailing commas are dropped (${err.message})`);
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
