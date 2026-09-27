import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import sharp from 'sharp';

// Execute the actual pure mutation module, with real shipped game tables.
const source = fs.readFileSync('src/lib/randomizer/mutations/forgotten-arts.ts', 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { applyForgottenArts, BOOK_SPELLS, FORGOTTEN_ARTS_PROGRESSION, FORGOTTEN_ARTS_EQUIPMENT, buildForgottenArtsItemGraphics } = exports;
const load = name => {
  const [headers, ...rows] = fs.readFileSync(path.join('data/txt', `${name}.txt`), 'utf8')
    .trimEnd().split(/\r?\n/).map(line => line.split('\t'));
  return { headers, rows };
};
const get = (t, r, c) => r[t.headers.indexOf(c)] ?? '';
const set = (t, r, c, v) => { r[t.headers.indexOf(c)] = v; };
const iconExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/sprites/global-skill-icons.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, { exports: iconExports, require: createRequire(import.meta.url), process, Buffer });
const originalSkillTable = load('skills');
const originalDescTable = load('skilldesc');
const iconSources = Array.from(BOOK_SPELLS, skill => {
  const row = originalSkillTable.rows.find(r => r[0] === skill);
  const desc = originalDescTable.rows.find(r => r[0] === get(originalSkillTable, row, 'skilldesc'));
  return { skill, charclass: get(originalSkillTable, row, 'charclass'), iconCel: Number(get(originalDescTable, desc, 'IconCel')) };
});
const iconAssets = await iconExports.buildGlobalSkillIcons(iconSources);
assert.equal(iconAssets.files.size, 3);
assert.equal(new Set(iconAssets.iconCels.values()).size, BOOK_SPELLS.length);

// Read generated pixels independently of the assembler. Utility frames must be
// byte-identical; both frames of every spell must match its source artwork.
const extract = (buffer, cel) => {
  const count = buffer.readUInt32LE(20), totalWidth = buffer.readUInt32LE(8);
  const width = totalWidth / count, height = buffer.readUInt32LE(12);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) buffer.copy(pixels, y * width * 4,
    40 + (y * totalWidth + cel * width) * 4, 40 + (y * totalWidth + (cel + 1) * width) * 4);
  return { pixels, width, height };
};
const folders = { sor: 'Sorceress', nec: 'Necro', pal: 'Paladin', war: 'Warlock' };
for (const suffix of ['.sprite', '.lowend.sprite']) {
  const original = fs.readFileSync(`data/sprites/global-skills/skillicon${suffix}`);
  const output = iconAssets.files.get(`hd/global/ui/spells/submenu/skillicon${suffix}`);
  assert.equal(output.readUInt32LE(20), 40 + BOOK_SPELLS.length * 2);
  assert.equal(output.readUInt32LE(32), output.length - 40);
  for (let i = 0; i < 40; i++) assert.deepEqual(extract(output, i).pixels, extract(original, i).pixels);
  for (const source of iconSources) for (const state of [0, 1]) {
    const frame = extract(output, iconAssets.iconCels.get(source.skill) + state);
    const folder = folders[source.charclass];
    const expected = await sharp(`data/sprites/icons/${folder}/${folder}_${source.iconCel + state}.bmp`)
      .resize(frame.width, frame.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    assert.deepEqual(frame.pixels, expected, `${source.skill} state ${state} ${suffix}`);
    assert.ok(frame.pixels.some(value => value !== 0), 'no transparent fallback');
  }
}
const dc6Frame = (buffer, cel) => {
  const start = buffer.readUInt32LE(24 + cel * 4);
  const end = cel + 1 < buffer.readUInt32LE(20) ? buffer.readUInt32LE(28 + cel * 4) : buffer.length;
  assert.equal(buffer.readUInt32LE(start + 24), end, 'DC6 next-block pointer');
  const frame = Buffer.from(buffer.subarray(start, end));
  frame.writeUInt32LE(0, 24); // relocation is the only expected frame-byte change
  return frame;
};
const legacy = iconAssets.files.get('global/ui/spells/skillicon.dc6');
const originalLegacy = fs.readFileSync('data/sprites/global-skills/skillicon.dc6');
assert.equal(legacy.readUInt32LE(20), 40 + BOOK_SPELLS.length * 2);
for (let i = 0; i < 24; i++) assert.deepEqual(dc6Frame(legacy, i), dc6Frame(originalLegacy, i));
const iconPrefixes = { sor: 'so', nec: 'ne', pal: 'pa', war: 'wa' };
for (const source of iconSources) {
  const original = fs.readFileSync(`data/sprites/global-skills/${iconPrefixes[source.charclass]}skillicon.dc6`);
  for (const state of [0, 1]) assert.deepEqual(dc6Frame(legacy, iconAssets.iconCels.get(source.skill) + state), dc6Frame(original, source.iconCel + state));
}
await assert.rejects(() => iconExports.buildGlobalSkillIcons([{ skill: 'bad', charclass: 'sor', iconCel: 999 }]), /Unsupported/);
function context() {
  return {
    skills: load('skills'), skilldesc: load('skilldesc'),
    vanillaSkills: load('skills'), vanillaSkilldesc: load('skilldesc'),
    charstats: load('charstats'), uniqueitems: load('uniqueitems'),
    treasureclass: load('treasureclassex'), itemtypes: load('itemtypes'),
    misc: load('misc'), itemstatcost: load('itemstatcost'), cubemain: load('cubemain'), objects: load('objects'), superuniques: load('superuniques'),
    equipmentProperties: [load('magicprefix'), load('magicsuffix')], displayNames: new Map(), iconCels: iconAssets.iconCels,
  };
}
const ctx = context();
const originalTCs = structuredClone(ctx.treasureclass.rows);
const originalSkills = structuredClone(ctx.skills.rows);
// Shuffle the physical skill rows to expose stale-ID mistakes. Real pipeline
// reorders skills while leaving the *Id comment column unchanged, too.
const fireIndex = ctx.skills.rows.findIndex(r => r[0] === 'Fire Bolt');
const iceIndex = ctx.skills.rows.findIndex(r => r[0] === 'Ice Bolt');
[ctx.skills.rows[fireIndex], ctx.skills.rows[iceIndex]] = [ctx.skills.rows[iceIndex], ctx.skills.rows[fireIndex]];
const books = applyForgottenArts(ctx);
// Equipment bonuses must target final rows, work for every class, and scale
// without changing charm grants, ordinary attributes, or saved affix row IDs.
const [prefixes, suffixes] = ctx.equipmentProperties;
const powerRows = prefixes.rows.filter(r => r[0].startsWith('D2RR_FA_Power_'));
const chargeRows = suffixes.rows.filter(r => r[0].startsWith('D2RR_FA_Charges_'));
assert.equal(powerRows.length, BOOK_SPELLS.length * 3);
// Passive masteries apply while carried; a charge could never cast them.
const passives = BOOK_SPELLS.filter(name => exports.isPassiveSpell(ctx.vanillaSkills, name));
assert.deepEqual([...passives].sort(), ['Demonic Mastery', 'Golem Mastery', 'Skeleton Mastery', 'Summon Resist']);
assert.equal(chargeRows.length, BOOK_SPELLS.length - passives.length);
for (const row of chargeRows) assert.ok(!passives.includes(ctx.skills.rows[Number(get(suffixes, row, 'mod1param'))][0]));
for (const row of ctx.uniqueitems.rows) for (let slot = 1; slot <= 12; slot++) {
  if (get(ctx.uniqueitems, row, `prop${slot}`) !== 'charged') continue;
  assert.ok(!passives.includes(ctx.skills.rows[Number(get(ctx.uniqueitems, row, `par${slot}`))]?.[0]), `${row[0]} charges a passive`);
}
for (const table of [prefixes, suffixes]) for (const row of table.rows.filter(r => r[0].startsWith('D2RR_FA_'))) {
  const skill = ctx.skills.rows[Number(get(table, row, 'mod1param'))];
  assert.ok(BOOK_SPELLS.includes(skill[0]));
  assert.equal(get(ctx.skills, skill, 'charclass'), '');
  assert.equal(get(table, row, 'spawnable'), '1');
  assert.equal(get(table, row, 'rare'), '1');
  assert.equal(get(table, row, 'classspecific'), '');
  assert.equal(get(table, row, 'class'), '');
  assert.deepEqual([1, 2, 3, 4].map(n => get(table, row, `itype${n}`)), ['weap', 'armo', 'amul', 'ring']);
}
for (const skill of BOOK_SPELLS) {
  const id = ctx.skills.rows.findIndex(r => r[0] === skill);
  for (const [alvl, min, max] of [[30, 1, 2], [34, 1, 2], [35, 2, 4], [59, 2, 4], [60, 4, 6], [99, 4, 6]]) {
    const eligible = powerRows.filter(r => get(prefixes, r, 'mod1param') === String(id)
      && Number(get(prefixes, r, 'level')) <= alvl
      && (!Number(get(prefixes, r, 'maxlevel')) || Number(get(prefixes, r, 'maxlevel')) >= alvl));
    assert.equal(eligible.length, 1, `${skill} has one bonus tier at affix level ${alvl}`);
    assert.equal(get(prefixes, eligible[0], 'mod1code'), 'oskill');
    assert.equal(Number(get(prefixes, eligible[0], 'mod1min')), min);
    assert.equal(Number(get(prefixes, eligible[0], 'mod1max')), max);
  }
}
const nativeChargeLevel = (skill, ilvl) => Math.min(Number(get(ctx.skills, skill, 'maxlvl')),
  Math.max(1, Math.trunc((ilvl - Number(get(ctx.skills, skill, 'reqlevel'))) / 4) + 1));
for (const row of chargeRows) {
  assert.equal(get(suffixes, row, 'mod1code'), 'charged');
  assert.equal(get(suffixes, row, 'mod1max'), '0', 'native item-level scaling');
  assert.equal(Number(get(suffixes, row, 'mod1min')), FORGOTTEN_ARTS_EQUIPMENT.charges.baseCharges);
  const skill = ctx.skills.rows[Number(get(suffixes, row, 'mod1param'))];
  for (const [ilvl, level] of [[1, 1], [4, 1], [5, 2], [37, 10], [40, 10], [41, 11], [76, 19], [77, 20], [99, 20]]) {
    assert.equal(nativeChargeLevel(skill, ilvl), level, `${skill[0]} charges at ilvl ${ilvl}`);
  }
}
const grantCodes = new Set(['skill', 'oskill', 'skilltab', 'skilltab-war', 'ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass', 'war', 'randclassskill', 'skill-rand']);
for (const [index, table] of [prefixes, suffixes].entries()) {
  const original = load(index === 0 ? 'magicprefix' : 'magicsuffix');
  for (const [i, row] of original.rows.entries()) {
    const expected = [...row];
    if ([1, 2, 3].some(n => grantCodes.has(get(original, row, `mod${n}code`)) || get(original, row, `mod${n}code`) === 'charged')) {
      set(original, expected, 'spawnable', '0');
    }
    assert.deepEqual(table.rows[i], expected, 'old affix IDs and unrelated bonuses unchanged');
  }
}
for (const [index, original] of load('uniqueitems').rows.entries()) {
  const updated = ctx.uniqueitems.rows[index];
  for (let slot = 1; slot <= 12; slot++) {
    const code = get(ctx.uniqueitems, original, `prop${slot}`);
    if (code === 'charged' || grantCodes.has(code)) {
      const id = Number(get(ctx.uniqueitems, updated, `par${slot}`));
      assert.ok(BOOK_SPELLS.includes(ctx.skills.rows[id][0]));
      assert.equal(get(ctx.uniqueitems, updated, `prop${slot}`), code === 'charged' ? 'charged' : 'oskill');
      if (code === 'charged') {
        assert.equal(get(ctx.uniqueitems, updated, `max${slot}`), '0');
        assert.equal(get(ctx.uniqueitems, updated, `min${slot}`), get(ctx.uniqueitems, original, `min${slot}`));
      }
    } else for (const field of ['prop', 'par', 'min', 'max']) {
      assert.equal(get(ctx.uniqueitems, updated, `${field}${slot}`), get(ctx.uniqueitems, original, `${field}${slot}`));
    }
  }
}
assert.equal(books.filter(b => b.source === 'drop').length, BOOK_SPELLS.length * 2);
assert.equal(books.filter(b => b.source === 'craft').length, BOOK_SPELLS.length * 2);
assert.equal(books.filter(b => b.source === 'shop').length, 4);
assert.equal(new Set(books.map(b => b.key)).size, books.length);
assert.equal(books.find(b => b.skill === 'Fire Bolt').skillId, iceIndex);
const fireBolt = ctx.skills.rows.find(r => r[0] === 'Fire Bolt');
assert.equal(get(ctx.skills, fireBolt, 'EDmgSymPerCalc'), "((skill('Fire Ball'.lvl)*32+skill('Meteor'.lvl)*44)*par8)/100");
// Synergies keep 20-50% of their native rate by source rarity, weighted before one integer /100.
const { synergyKeep, FORGOTTEN_ARTS_SYNERGY_KEEP } = exports;
assert.deepEqual(Object.values(FORGOTTEN_ARTS_SYNERGY_KEEP), [20, 26, 32, 38, 44, 50]);
assert.equal(synergyKeep(ctx.vanillaSkills, 'Fire Bolt'), 20);
assert.equal(synergyKeep(ctx.vanillaSkills, 'Frozen Orb'), 50);
const skillRow = name => ctx.skills.rows.find(r => r[0] === name);
const descRow = name => ctx.skilldesc.rows.find(r => r[0] === get(ctx.skills, skillRow(name), 'skilldesc'));
const plainLevelUses = new Set();
for (const name of BOOK_SPELLS) {
  for (const [table, row, vanillaTable] of [[ctx.skills, skillRow(name), originalSkillTable], [ctx.skilldesc, descRow(name), originalDescTable]]) {
    const vanilla = vanillaTable.rows.find(r => r[0] === row[0]);
    for (const [i, cell] of row.entries()) {
      const header = table.headers[i];
      for (const [, source, weight] of cell.matchAll(/skill\('([^']+)'\.lvl\)\*(\d+)/g)) {
        assert.equal(Number(weight), synergyKeep(ctx.vanillaSkills, source), `${name} ${header} weights ${source}`);
      }
      if (/\.lvl\)\*\d/.test(cell)) {
        assert.ok(header.endsWith('SymPerCalc') ? cell.endsWith(')/100') : cell.includes(' / 100'), `${name} ${header} divides once`);
      }
      // Only coefficient-free references to catalogue spells may stay unweighted.
      const original = vanillaTable === originalSkillTable ? vanilla[originalSkillTable.headers.indexOf(header)] : vanilla[i];
      for (const [, source, multiplier] of (original ?? '').matchAll(/skill\('([^']+)'\.blvl\)(\s*\*\s*(?:par\d+|skill\('[^']+'\.par\d+\)))?/g)) {
        if (!BOOK_SPELLS.includes(source)) continue;
        if (multiplier || header.endsWith('SymPerCalc')) assert.ok(cell.includes(`skill('${source}'.lvl)*`), `${name} ${header} weights ${source}`);
        else plainLevelUses.add(`${name} <- ${source}`);
      }
      for (const [, source] of cell.matchAll(/skill\('([^']+)'\.blvl\)/g)) assert.ok(!BOOK_SPELLS.includes(source));
    }
  }
}
assert.deepEqual([...plainLevelUses].sort(), ['Summon Defiler', 'Summon Goatman', 'Summon Tainted'].map(n => `${n} <- Demonic Mastery`));
// Evaluate the rewritten formulas with D2's left-to-right integer arithmetic.
const evalCalc = (expr, vars) => {
  const js = expr.replace(/skill\('([^']+)'\.lvl\)/g, (_, n) => String(vars[n] ?? 0))
    .replace(/skill\('[^']+'\.blvl\)/g, '0').replace(/\b(par\d+|ln\d+)\b/g, v => String(vars[v]));
  // Every division in these formulas truncates; wrap each "/ n" operand chain in Math.trunc.
  const tokens = js.match(/\d+|[()+*/-]/g);
  let pos = 0;
  const expr0 = () => { let v = term(); while (tokens[pos] === '+' || tokens[pos] === '-') { const op = tokens[pos++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = atom(); while (tokens[pos] === '*' || tokens[pos] === '/') { const op = tokens[pos++]; const r = atom(); v = op === '*' ? v * r : Math.trunc(v / r); } return v; };
  const atom = () => { if (tokens[pos] === '(') { pos++; const v = expr0(); pos++; return v; } return Number(tokens[pos++]); };
  return expr0();
};
const fireBallSkill = skillRow('Fire Ball');
assert.equal(evalCalc(get(ctx.skills, fireBallSkill, 'EDmgSymPerCalc'), { 'Fire Bolt': 30, par8: 14 }), 84);
assert.equal(evalCalc(get(ctx.skills, fireBallSkill, 'EDmgSymPerCalc'), { 'Fire Bolt': 10, Meteor: 5, par8: 14 }), 58);
assert.equal(evalCalc(get(ctx.skills, fireBolt, 'EDmgSymPerCalc'), { 'Fire Ball': 30, par8: 16 }), 153);
assert.equal(evalCalc(get(ctx.skills, skillRow('Holy Bolt'), 'EDmgSymPerCalc'), { 'Fist of the Heavens': 4, par8: 50 }), 100);
const glacial = skillRow('Glacial Spike');
assert.equal(get(ctx.skills, glacial, 'auralencalc'), "ln34 * (100 + skill('Blizzard'.lvl)*44 * par7 / 100) / 100");
assert.equal(get(ctx.skilldesc, descRow('Glacial Spike'), 'desccalca2'), "ln34 * (100 + skill('Blizzard'.lvl)*44 * par7 / 100) / 100");
assert.equal(evalCalc(get(ctx.skills, glacial, 'auralencalc'), { Blizzard: 10, par7: 3, ln34: 1000 }), 1130);
// Tooltip per-level lines show the rounded rate; the header and non-catalogue sources stay native.
const fireBallDesc = descRow('Fire Ball');
assert.equal(get(ctx.skilldesc, fireBallDesc, 'dsc3calca1'), '2');
assert.equal(get(ctx.skilldesc, fireBallDesc, 'dsc3calca2'), '(par8*20+50)/100');
assert.equal(get(ctx.skilldesc, fireBallDesc, 'dsc3calca3'), '(par8*44+50)/100');
assert.equal(evalCalc(get(ctx.skilldesc, fireBallDesc, 'dsc3calca2'), { par8: 14 }), 3);
assert.equal(get(ctx.skilldesc, descRow('Ice Blast'), 'dsc3calca3'), '(par7*38+50)/100');
const holyBoltDesc = descRow('Holy Bolt');
for (const slot of [1, 2, 3, 4, 5]) {
  const textb = get(ctx.skilldesc, holyBoltDesc, `dsc3textb${slot}`);
  const calc = get(ctx.skilldesc, holyBoltDesc, `dsc3calca${slot}`);
  const original = get(originalDescTable, originalDescTable.rows.find(r => r[0] === holyBoltDesc[0]), `dsc3calca${slot}`);
  if (textb === 'skillname121') assert.equal(calc, `(${original}*50+50)/100`);
  else assert.equal(calc, original, `Holy Bolt dsc3calca${slot} (${textb}) unchanged`);
}
// Golems weight each other's `*skill('X'.par8)` synergies like any other source.
assert.equal(get(ctx.skills, skillRow('Clay Golem'), 'passivecalc3'),
  "par2 * (lvl - 1) + (skill('FireGolem'.lvl)*50*skill('FireGolem'.par8) / 100)");
assert.equal(get(ctx.skills, skillRow('IronGolem'), 'passivecalc2'),
  "skill('Golem Mastery'.ln56)+skill('Clay Golem'.lvl)*26*skill('Clay Golem'.par8) / 100");
assert.equal(evalCalc(get(ctx.skills, skillRow('IronGolem'), 'passivecalc2').replace("skill('Golem Mastery'.ln56)", '0')
  .replace("skill('Clay Golem'.par8)", 'par8'), { 'Clay Golem': 10, par8: 20 }), 52);
assert.equal(get(ctx.skilldesc, descRow('FireGolem'), 'dsc3calca4'), "(skill('Clay Golem'.par8)*26+50)/100");
// Level uses count whole carried levels: stacked Demonic Mastery raises the demon cap.
for (const demon of ['Summon Goatman', 'Summon Tainted', 'Summon Defiler']) {
  assert.equal(get(ctx.skills, skillRow(demon), 'petmax'),
    "(skill('Demonic Mastery'.lvl)>=10)?3:((skill('Demonic Mastery'.lvl)>=5)?2:1)");
}
assert.equal(get(ctx.skills, skillRow('Summon Defiler'), 'passivecalc2'), "par2*((lvl - 1) + (skill('Demonic Mastery'.lvl))");
// Masteries keep their native references; they are the pets' own scaling, not synergies.
assert.equal(get(ctx.skills, skillRow('Raise Skeleton'), 'aurastatcalc2'), "(lvl+skill('Skeleton Mastery'.lvl))*par4");
// Pet attack rows return to vanilla even when the tree shuffle rewrote them.
{
  const shuffled = context();
  const petRow = shuffled.skills.rows.find(r => r[0] === 'Tainted Fire Ball');
  set(shuffled.skills, petRow, 'EDmgSymPerCalc', "skill('Fire Ball'.lvl)*par8");
  applyForgottenArts(shuffled);
  assert.equal(get(shuffled.skills, petRow, 'EDmgSymPerCalc').trim(), "skill('Blood Boil'.blvl)*par8");
  assert.deepEqual(petRow, originalSkillTable.rows.find(r => r[0] === 'Tainted Fire Ball'));
  // A class skill a pet borrows is not restored or claimed by the catalogue.
  assert.equal(get(shuffled.skills, shuffled.skills.rows.find(r => r[0] === 'Holy Fire'), 'charclass'), 'pal');
}
const fireWall = skillRow('Fire Wall');
assert.equal(get(ctx.skills, fireWall, 'EDmgSymPerCalc'), get(originalSkillTable, originalSkillTable.rows.find(r => r[0] === 'Fire Wall'), 'EDmgSymPerCalc'));
for (const book of books) {
  const row = ctx.uniqueitems.rows.find(r => r[0] === book.key);
  assert.equal(get(ctx.uniqueitems, row, 'prop1'), 'oskill');
  const skill = ctx.skills.rows[Number(get(ctx.uniqueitems, row, 'par1'))];
  assert.equal(skill[0], book.skill);
  assert.equal(get(ctx.skills, skill, 'charclass'), '');
  assert.equal(get(ctx.skills, skill, 'skpoints'), '999');
  assert.equal(get(ctx.skills, skill, 'anim'), 'SC');
  assert.equal(get(ctx.skills, skill, 'reqlevel'), '1');
  assert.equal(get(ctx.uniqueitems, row, 'lvl req'), '0');
  assert.equal(get(ctx.uniqueitems, row, 'prop2'), 'levelreq');
  assert.equal(get(ctx.uniqueitems, row, 'min2'), '-7');
  assert.equal(get(ctx.uniqueitems, row, 'max2'), '-7');
  const base = ctx.misc.rows.find(r => get(ctx.misc, r, 'code') === book.code);
  assert.equal(get(ctx.misc, base, 'SkipName'), '1', 'one unique title, no base subtitle');
  assert.equal(get(ctx.uniqueitems, row, 'invfile'), book.bonus === 1 ? 'invrsc' : 'invrbk');
  assert.equal(get(ctx.uniqueitems, row, 'flippyfile'), book.bonus === 1 ? 'flprsc' : 'flprbk');
  // Model the engine's classless-oskill +6, then round-trip its offset through
  // the real save encoding. Checking only lvl req=0 missed the level-7 bug.
  const stat = ctx.itemstatcost.rows.find(r => r[0] === 'item_levelreq');
  const saveAdd = Number(get(ctx.itemstatcost, stat, 'Save Add'));
  const saveBits = Number(get(ctx.itemstatcost, stat, 'Save Bits'));
  const offset = Number(get(ctx.uniqueitems, row, 'min2'));
  const saved = offset + saveAdd;
  assert.ok(saved >= 0 && saved < 2 ** saveBits);
  const loadedOffset = (saved & (2 ** saveBits - 1)) - saveAdd;
  const required = Math.max(Number(get(ctx.uniqueitems, row, 'lvl req')),
    Number(get(ctx.misc, base, 'levelreq')), Number(get(ctx.skills, skill, 'reqlevel')) + 6);
  assert.equal(Math.max(0, required + loadedOffset), 0, `${book.key}: usable after save/reload`);
  assert.equal(get(ctx.uniqueitems, row, 'invtransform'), 'lpur');
  assert.equal(book.requiredLevel, 0);
  assert.ok(book.dropLevel >= 1);
  assert.equal(get(ctx.uniqueitems, row, 'carry1'), '0');
  assert.equal(get(ctx.uniqueitems, row, 'nolimit'), '1');
  assert.equal(Number(get(ctx.uniqueitems, row, 'min1')), book.bonus);
  const desc = ctx.skilldesc.rows.find(r => r[0] === get(ctx.skills, skill, 'skilldesc'));
  assert.equal(get(ctx.skilldesc, desc, 'SkillPage'), '0');
  assert.equal(get(ctx.skilldesc, desc, 'ListRow'), '0');
  assert.equal(Number(get(ctx.skilldesc, desc, 'IconCel')), iconAssets.iconCels.get(book.skill));
}
const starters = ctx.uniqueitems.rows.filter(r => get(ctx.uniqueitems, r, 'code') === 'cm1'
  && get(ctx.uniqueitems, r, 'spawnable') === '1' && get(ctx.uniqueitems, r, 'disabled') !== '1'
  && Number(get(ctx.uniqueitems, r, 'lvl')) <= 1);
assert.equal(starters.length, 1, 'exactly one eligible starting unique charm');
assert.equal(starters[0][0], books.find(b => b.skill === 'Fire Bolt' && b.code === 'cm1').key);
const classes = ctx.charstats.rows.filter(r => get(ctx.charstats, r, 'str'));
assert.equal(classes.length, 8);
for (const row of classes) {
  assert.equal(get(ctx.charstats, row, 'SkillsPerLevel'), '0');
  assert.equal(get(ctx.charstats, row, 'StartSkill'), '');
  assert.ok(Array.from({ length: 10 }, (_, i) => i + 1).some(n =>
    get(ctx.charstats, row, `item${n}`) === 'cm1' && get(ctx.charstats, row, `item${n}quality`) === '7'));
  assert.equal(Array.from({ length: 10 }, (_, i) => get(ctx.charstats, row, `item${i + 1}`)).filter(code => code === 'box').length, 1);
}
// Utility and monster skills retain their full original rows.
for (const original of originalSkills) {
  if (get(ctx.skills, original, 'charclass')) continue;
  assert.deepEqual(ctx.skills.rows.find(r => r[0] === original[0]), original);
}
const tcMap = new Map(ctx.treasureclass.rows.map((r, i) => [r[0], i]));
for (const [index, row] of ctx.treasureclass.rows.entries()) {
  for (let n = 1; n <= 10; n++) {
    const target = get(ctx.treasureclass, row, `Item${n}`);
    if (!target.startsWith('D2RR_FA_')) continue;
    if (tcMap.has(target)) assert.ok(tcMap.get(target) < index, `forward TC reference: ${row[0]} -> ${target}`);
    else assert.ok(books.some(book => book.key === target), `missing book ${target}`);
  }
}
const tunedActOneNames = new Set([
  ...['H2H', 'Cast', 'Miss'].flatMap(kind => ['A', 'B', 'C'].map(tier => `Act 1 ${kind} ${tier}`)),
  'Quill 1', 'Quill 2', 'Quill 3', 'Quill 4',
]);
const totalWeight = row => Number(get(ctx.treasureclass, row, 'NoDrop'))
  + Array.from({ length: 10 }, (_, i) => Number(get(ctx.treasureclass, row, `Prob${i + 1}`)) || 0)
    .reduce((sum, weight) => sum + weight, 0);
for (const original of originalTCs) {
  const row = ctx.treasureclass.rows[tcMap.get(original[0])];
  if (tunedActOneNames.has(original[0]) || /^Act [1-5]( \([NH]\))? Chest C$/.test(original[0])) {
    const originalTotal = totalWeight(original), updatedTotal = totalWeight(row);
    assert.ok(Number(get(ctx.treasureclass, row, 'NoDrop')) >= 0);
    for (const header of ctx.treasureclass.headers) {
      if (!/^(Item\d+|Prob\d+|NoDrop)$/.test(header)) {
        assert.equal(get(ctx.treasureclass, row, header), get(ctx.treasureclass, original, header));
      }
    }
    for (let n = 1; n <= 10; n++) {
      if (!get(ctx.treasureclass, original, `Item${n}`)) continue;
      assert.equal(get(ctx.treasureclass, row, `Item${n}`), get(ctx.treasureclass, original, `Item${n}`));
      const before = Number(get(ctx.treasureclass, original, `Prob${n}`)) / originalTotal;
      const after = Number(get(ctx.treasureclass, row, `Prob${n}`)) / updatedTotal;
      assert.ok(Math.abs(before - after) < 1e-12, `${row[0]} preserves original item odds`);
    }
    continue;
  }
  if (!/^Act [1-5]( \([NH]\))? Good$/.test(original[0])) {
    assert.deepEqual(row, original);
    continue;
  }
  for (let n = 1; n <= 10; n++) {
    if (!get(ctx.treasureclass, original, `Item${n}`)) continue;
    assert.equal(get(ctx.treasureclass, row, `Item${n}`), get(ctx.treasureclass, original, `Item${n}`));
    assert.equal(get(ctx.treasureclass, row, `Prob${n}`), get(ctx.treasureclass, original, `Prob${n}`));
  }
}
// Every book must be reachable from the existing monster loot graph.
const reachable = new Set();
function visit(name) {
  if (reachable.has(name)) return;
  reachable.add(name);
  const row = ctx.treasureclass.rows[tcMap.get(name)];
  if (row) for (let n = 1; n <= 10; n++) visit(get(ctx.treasureclass, row, `Item${n}`));
}
for (const row of originalTCs.filter(r => /^Act [1-5]( \([NH]\))? Good$/.test(r[0]))) visit(row[0]);
for (const book of books) assert.equal(reachable.has(book.key), book.source === 'drop', `drop-only catalogue: ${book.key}`);
function reachableBooks(root) {
  const found = new Set();
  const visitTier = name => {
    const book = books.find(b => b.key === name);
    if (book) { found.add(book); return; }
    const row = ctx.treasureclass.rows[tcMap.get(name)];
    if (row) for (let n = 1; n <= 10; n++) {
      const target = get(ctx.treasureclass, row, `Item${n}`);
      if (target.startsWith('D2RR_FA_')) visitTier(target);
    }
  };
  visitTier(root);
  return found;
}
let previousTier = new Set();
for (let act = 1; act <= 5; act++) {
  const tier = reachableBooks(`D2RR_FA_Act ${act} Good`);
  const cap = [0, 6, 18, 24, 30, 36][act];
  assert.ok(tier.size > previousTier.size, `Act ${act} improves the available catalogue`);
  for (const book of tier) assert.ok(book.dropLevel <= cap);
  for (const book of previousTier) assert.ok(tier.has(book));
  previousTier = tier;
}
assert.ok([...reachableBooks('D2RR_FA_Act 1 Good')].every(b => b.bonus === 1), 'early loot contains only scrolls');
assert.deepEqual([...reachableBooks('D2RR_FA_Act 1 Good')].map(b => b.skill).sort(), ['Fire Bolt', 'Ice Bolt', 'Charged Bolt', 'Teeth', 'Raise Skeleton', 'Holy Bolt'].sort());
assert.ok([...reachableBooks('D2RR_FA_Act 2 Good')].some(b => b.bonus === 3), 'books unlock later');
assert.equal(reachableBooks('D2RR_FA_Act 1 (N) Good').size, BOOK_SPELLS.length * 2);
assert.equal(reachableBooks('D2RR_FA_Act 1 (H) Good').size, BOOK_SPELLS.length * 2);

// Resolve the actual generated drop graph, including its pre-existing Good
// branch. Do not mistake the added branch alone for the final per-kill rate.
const probabilityCache = new Map();
function spellDropProbability(name) {
  if (probabilityCache.has(name)) return probabilityCache.get(name);
  if (books.some(b => b.key === name)) return 1;
  const row = ctx.treasureclass.rows[tcMap.get(name)];
  if (!row) return 0;
  assert.ok(['1', '4'].includes(get(ctx.treasureclass, row, 'Picks')), `per-pick probability model: ${name}`);
  const total = totalWeight(row);
  let chance = 0;
  for (let n = 1; n <= 10; n++) {
    const weight = Number(get(ctx.treasureclass, row, `Prob${n}`)) || 0;
    if (weight) chance += weight / total * spellDropProbability(get(ctx.treasureclass, row, `Item${n}`));
  }
  probabilityCache.set(name, chance);
  return chance;
}
for (const name of tunedActOneNames) {
  assert.ok(tcMap.has(name), `missing tuned table ${name}`);
  const chance = spellDropProbability(name);
  assert.ok(Math.abs(chance - 1 / 90) < 1e-12, `${name}: ${chance}`);
  for (const [kills, expectedLevels] of [[630, 13], [810, 15], [990, 17]]) {
    assert.ok(Math.abs(1 + 3 + 1 + 1 + kills * chance - expectedLevels) < 1e-12);
  }
}
assert.ok(spellDropProbability('Act 1 Wraith A') > 1 / 90, 'wraiths already exceed the ordinary-monster target');
assert.equal(FORGOTTEN_ARTS_PROGRESSION.act1.ordinaryKillsPerScroll, 90);
assert.equal(FORGOTTEN_ARTS_PROGRESSION.act1.referenceOrdinaryKills, 810);
assert.deepEqual(Array.from(FORGOTTEN_ARTS_PROGRESSION.act1.assumedOrdinaryKills), [630, 990]);
assert.deepEqual(Array.from(FORGOTTEN_ARTS_PROGRESSION.act1.targetTotalSkillLevels), [13, 17]);
assert.equal(FORGOTTEN_ARTS_PROGRESSION.act1.encounterSkillLevels, 3);
assert.equal(FORGOTTEN_ARTS_PROGRESSION.act1.assumedPurchasedSkillLevels, 1);
assert.equal(FORGOTTEN_ARTS_PROGRESSION.act1.assumedContainerSkillLevels, 1);

// Consolidation accepts exact unique identities. Independently expand recipe
// quantities and try mixed shop/drop inputs, wrong spells and unrelated charms.
const vanillaRecipes = load('cubemain');
assert.deepEqual(ctx.cubemain.rows.slice(0, vanillaRecipes.rows.length), vanillaRecipes.rows);
const addedRecipes = ctx.cubemain.rows.slice(vanillaRecipes.rows.length);
const repairRecipes = addedRecipes.filter(r => get(ctx.cubemain, r, 'numinputs') === '1');
assert.equal(repairRecipes.length, 4);
const recipes = addedRecipes.filter(r => get(ctx.cubemain, r, 'numinputs') === '3');
// Per spell: scroll->book->grimoire->codex, plus 3 mixed recipes for each of the four Akara spells.
assert.equal(addedRecipes.length, BOOK_SPELLS.length * 3 + 12 + 4);
assert.equal(recipes.length, BOOK_SPELLS.length * 3 + 12);
const bookMap = new Map(books.map(b => [b.key, b]));
function ingredients(row) {
  return Array.from({ length: 7 }, (_, i) => get(ctx.cubemain, row, `input ${i + 1}`))
    .filter(Boolean).flatMap(value => {
      const [key, quantity] = value.replaceAll('"', '').split(',qty=');
      return Array(Number(quantity || 1)).fill(key);
    }).sort();
}
function recipeFor(keys) {
  const sorted = [...keys].sort();
  return recipes.filter(row => JSON.stringify(ingredients(row)) === JSON.stringify(sorted));
}
for (const row of recipes) {
  const inputs = ingredients(row).map(key => bookMap.get(key));
  const output = bookMap.get(get(ctx.cubemain, row, 'output'));
  assert.equal(inputs.length, Number(get(ctx.cubemain, row, 'numinputs')));
  assert.equal(inputs.length, 3);
  assert.ok(output && inputs.every(Boolean));
  assert.ok(inputs.every(b => b.skill === output.skill));
  assert.equal(inputs.reduce((sum, b) => sum + b.bonus, 0), output.bonus);
  assert.ok(Number(get(ctx.cubemain, row, 'lvl')) >= output.dropLevel);
  assert.equal(get(ctx.cubemain, row, 'class'), '');
  assert.equal(get(ctx.cubemain, row, 'min diff'), '');
  assert.equal(recipeFor(ingredients(row)).length, 1, 'no ambiguous recipes');
}
for (const skill of BOOK_SPELLS) {
  const variants = books.filter(b => b.skill === skill && b.bonus === 1);
  for (const a of variants) for (const b of variants) for (const c of variants) {
    assert.equal(recipeFor([a.key, b.key, c.key]).length, 1);
  }
  for (const bonus of [3, 9]) {
    const item = books.find(b => b.skill === skill && b.bonus === bonus);
    assert.equal(recipeFor([item.key, item.key, item.key]).length, 1);
  }
}
const fire = books.find(b => b.skill === 'Fire Bolt' && b.bonus === 1);
const ice = books.find(b => b.skill === 'Ice Bolt' && b.bonus === 1);
assert.equal(recipeFor([fire.key, fire.key, ice.key]).length, 0);
assert.equal(recipeFor(['Annihilus', 'Annihilus', 'Annihilus']).length, 0);
assert.equal(recipeFor([fire.key, fire.key]).length, 0);
for (const book of books.filter(b => b.source === 'craft')) {
  assert.equal(get(ctx.uniqueitems, ctx.uniqueitems.rows.find(r => r[0] === book.key), 'spawnable'), '0');
}

// Shop bases each have exactly one eligible unique, a real vendor cache entry,
// no level requirements, no stock on other vendors, and no generic loot route.
const originalMisc = load('misc');
for (const [i, original] of originalMisc.rows.entries()) {
  const expected = [...original];
  if (['cm1', 'cm2'].includes(get(originalMisc, original, 'code'))) {
    set(originalMisc, expected, 'InvTrans', '8');
    set(originalMisc, expected, 'cost', get(originalMisc, original, 'code') === 'cm1' ? '2000' : '6000');
    set(originalMisc, expected, 'SkipName', '1');
    set(originalMisc, expected, 'invfile', get(originalMisc, original, 'code') === 'cm1' ? 'invrsc' : 'invrbk');
    set(originalMisc, expected, 'uniqueinvfile', get(originalMisc, original, 'code') === 'cm1' ? 'invrsc' : 'invrbk');
  }
  assert.deepEqual(ctx.misc.rows[i], expected);
}
for (const book of books.filter(b => b.source === 'shop')) {
  assert.equal(book.code.length, 3, 'HD items.json rejects four-character base codes');
  const legacy = ctx.misc.rows.find(r => get(ctx.misc, r, 'code') === book.legacyCode);
  assert.ok(legacy, 'saved purchases retain a decodable base');
  for (const field of ['spawnable', 'PermStoreItem', 'AkaraMin', 'AkaraMax', 'AkaraMagicMin', 'AkaraMagicMax']) {
    assert.equal(get(ctx.misc, legacy, field), '0', 'invisible legacy stock is retired');
  }
  const repair = repairRecipes.find(r => get(ctx.cubemain, r, 'input 1') === `"${book.legacyCode},uni"`);
  assert.ok(repair, 'each legacy scroll has a one-item conversion');
  assert.equal(get(ctx.cubemain, repair, 'output'), book.key, 'conversion preserves the exact spell');
  assert.equal(get(ctx.cubemain, repair, 'enabled'), '1');
  const base = ctx.misc.rows.find(r => get(ctx.misc, r, 'code') === book.code);
  assert.ok(base);
  for (const [column, expected] of Object.entries({ unique: '1', spawnable: '1', level: '1', levelreq: '0', AkaraMin: '1', AkaraMax: '1', AkaraMagicLvl: '25', AkaraMagicMin: '1', AkaraMagicMax: '1', bitfield1: '1', PermStoreItem: '0', multibuy: '0', type: 'scha' })) {
    assert.equal(get(ctx.misc, base, column), expected, `${book.key}: ${column}`);
  }
  assert.equal(Number(get(ctx.misc, base, 'cost')), book.shopBaseCost);
  assert.equal(get(ctx.misc, base, 'InvTrans'), '8');
  for (const header of ctx.misc.headers.filter(h => /(?:Min|Max)$/.test(h) && !h.startsWith('Akara') && /Charsi|Gheed|Fara|Lysander|Drognan|Hratli|Alkor|Ormus|Elzix|Asheara|Cain|Halbu|Malah|Larzuk|Anya|Jamella/.test(h))) assert.equal(Number(get(ctx.misc, base, header)), 0);
  assert.equal(ctx.uniqueitems.rows.filter(r => get(ctx.uniqueitems, r, 'code') === book.code).length, 1);
  assert.ok(!ctx.treasureclass.rows.some(r => r.includes(book.code)));
}
for (const original of load('objects').rows) {
  const row = ctx.objects.rows.find(r => r[0] === original[0]);
  if (['Bookshelf1', 'Bookshelf2'].includes(original[0])) {
    const expected = [...original];
    set(ctx.objects, expected, 'OperateFn', '14');
    assert.deepEqual(row, expected);
  } else assert.deepEqual(row, original);
}
for (const name of ['Corpsefire', 'Boneash', 'Griswold']) {
  const row = ctx.superuniques.rows.find(r => r[0] === name);
  const original = load('superuniques').rows.find(r => r[0] === name);
  const wrapper = ctx.treasureclass.rows[tcMap.get(get(ctx.superuniques, row, 'TC'))];
  assert.equal(get(ctx.treasureclass, wrapper, 'Picks'), '-2');
  assert.equal(get(ctx.treasureclass, wrapper, 'Item1'), 'D2RR_FA_Act 1 Good');
  assert.equal(get(ctx.treasureclass, wrapper, 'Prob1'), '1');
  assert.equal(get(ctx.treasureclass, wrapper, 'Item2'), get(ctx.superuniques, original, 'TC'));
  assert.equal(get(ctx.treasureclass, wrapper, 'Prob2'), '1');
  assert.ok(tcMap.get(get(ctx.treasureclass, wrapper, 'Item2')) < tcMap.get(wrapper[0]));
}
for (const original of load('superuniques').rows) {
  const expected = [...original];
  if (['Corpsefire', 'Boneash', 'Griswold'].includes(original[0])) set(ctx.superuniques, expected, 'TC', `D2RR_FA_Reward_${original[0]}`);
  if (original[0] === 'Griswold') for (const difficulty of ['(N)', '(H)']) set(ctx.superuniques, expected, `TC${difficulty}`, `D2RR_FA_Reward_Griswold${difficulty}`);
  assert.deepEqual(ctx.superuniques.rows.find(r => r[0] === original[0]), expected);
}
const chestNames = ctx.treasureclass.rows.filter(r => /^Act [1-5]( \([NH]\))? Chest C$/.test(r[0])).map(r => r[0]);
assert.equal(chestNames.length, 15);
for (const name of chestNames) assert.ok(Math.abs(spellDropProbability(name) - 0.05) < 1e-12, name);

const originalItemArt = JSON.parse(fs.readFileSync('data/hd/items/items.json', 'utf8').replace(/^\uFEFF/, ''));
const originalUniqueArt = JSON.parse(fs.readFileSync('data/hd/items/uniques.json', 'utf8').replace(/^\uFEFF/, ''));
const art = buildForgottenArtsItemGraphics(books, structuredClone(originalItemArt), structuredClone(originalUniqueArt));
const expectedItemArt = structuredClone(originalItemArt);
expectedItemArt.find(e => e.cm1).cm1.asset = 'scroll/forgotten_arts_scroll';
expectedItemArt.find(e => e.cm2).cm2.asset = 'book/forgotten_arts_book';
assert.deepEqual(art.items.slice(0, originalItemArt.length), expectedItemArt);
assert.deepEqual(art.uniques.slice(0, originalUniqueArt.length), originalUniqueArt);
for (const book of books) {
  const asset = book.bonus === 1 ? 'scroll/forgotten_arts_scroll' : 'book/forgotten_arts_book';
  const entry = art.uniques.find(e => e[book.key.toLowerCase()])?.[book.key.toLowerCase()];
  assert.equal(entry.normal, asset);
  if (book.source === 'shop') assert.equal(art.items.find(e => e[book.code])?.[book.code].asset, asset);
}
const itemAssetExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/sprites/forgotten-arts-items.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, { exports: itemAssetExports, require: createRequire(import.meta.url), process, Buffer });
const itemAssets = itemAssetExports.buildForgottenArtsItemAssets();
assert.equal(itemAssets.size, 19);
for (const original of load('itemstatcost').rows) {
  const expected = [...original];
  if (original[0] === 'item_levelreq') set(ctx.itemstatcost, expected, 'Save Add', '7');
  assert.deepEqual(ctx.itemstatcost.rows.find(r => r[0] === original[0]), expected);
}
// Ordinary positive upgrade penalties still survive the adjusted encoding.
for (const value of [0, 5, 7, 12]) assert.equal(((value + 7) & 127) - 7, value);
for (const kind of ['scroll', 'book']) {
  for (const variant of ['', '1', '2', '3']) for (const suffix of ['.sprite', '.lowend.sprite']) {
    assert.deepEqual(itemAssets.get(`hd/global/ui/items/misc/${kind}/forgotten_arts_${kind}${variant}${suffix}`), fs.readFileSync(`data/sprites/forgotten-arts-items/${kind}${suffix}`));
  }
  const sourceUnit = JSON.parse(fs.readFileSync(`data/sprites/forgotten-arts-items/${kind}.json`, 'utf8'));
  sourceUnit.name = `forgotten_arts_${kind}`;
  assert.deepEqual(JSON.parse(itemAssets.get(`hd/items/misc/${kind}/forgotten_arts_${kind}.json`).toString()), sourceUnit);
  const model = itemAssets.get(`hd/items/misc/${kind}/forgotten_arts_${kind}.json`).toString();
  assert.ok(model.includes(`identify_${kind}`), 'Identify source model');
  assert.ok(!model.includes('town_portal'), 'no Town Portal source dependencies');
}
const parseLayout = text => {
  const result = ts.parseConfigFileTextToJson('globaldatahd.json', text);
  assert.equal(result.error, undefined);
  return result.config;
};
const originalLayout = parseLayout(fs.readFileSync('data/sprites/forgotten-arts-items/globaldatahd.json', 'utf8'));
const layout = parseLayout(itemAssets.get('global/ui/layouts/globaldatahd.json').toString('utf8'));
const colorFields = layout.children.find(c => c.type === 'SpriteColoringHelper').fields;
for (const field of ['colorRangeOverride', 'colorTransformOverride']) {
  const custom = colorFields[field].splice(0, 8);
  assert.deepEqual(custom.map(c => c[0]), ['scroll', 'book'].flatMap(kind => ['', '1', '2', '3'].map(variant => `data/hd/global/ui/items/misc/${kind}/forgotten_arts_${kind}${variant}`)));
  if (field === 'colorTransformOverride') for (const entry of custom) {
    assert.equal(entry[1], 'lpur');
    assert.deepEqual(entry[2].hsvTransform, [-0.24, 0, 0.03, 0]);
    assert.deepEqual(entry[2].tintTransform, [0, 0, 0, 0]);
  }
  if (field === 'colorRangeOverride') for (const entry of custom) assert.deepEqual(entry[1].hue, [0.04, 0.06]);
}
assert.deepEqual(layout, originalLayout, 'existing global UI and ordinary-item color rules are unchanged');
// Trace the base -> unique map -> sprite path, including every stored charm
// variation, instead of only checking that an unused alias was packaged.
for (const book of books) {
  const base = ctx.misc.rows.find(r => get(ctx.misc, r, 'code') === book.code);
  const unique = ctx.uniqueitems.rows.find(r => r[0] === book.key);
  assert.ok(get(ctx.misc, base, 'uniqueinvfile'), `${book.key}: enable HD unique lookup`);
  assert.ok(get(ctx.uniqueitems, unique, 'invfile'), `${book.key}: unique art override`);
  const invfile = get(ctx.uniqueitems, unique, 'invfile');
  assert.equal(art.items.find(e => e[invfile])?.[invfile].asset,
    book.bonus === 1 ? 'scroll/forgotten_arts_scroll' : 'book/forgotten_arts_book',
    'unique invfile has an HD alias, not only a legacy filename');
  const itemType = ctx.itemtypes.rows.find(r => get(ctx.itemtypes, r, 'Code') === get(ctx.misc, base, 'type'));
  const variations = Number(get(ctx.itemtypes, itemType, 'VarInvGfx'));
  assert.equal(variations, 0, 'spell carriers cannot select a random charm graphic');
  for (let n = 1; n <= 6; n++) assert.equal(get(ctx.itemtypes, itemType, `InvGfx${n}`), '');
  assert.equal(art.items.find(e => e[book.code])?.[book.code].asset,
    book.bonus === 1 ? 'scroll/forgotten_arts_scroll' : 'book/forgotten_arts_book');
  const mapping = art.uniques.find(e => e[book.key.toLowerCase()])[book.key.toLowerCase()];
  for (const grade of ['normal', 'uber', 'ultra']) {
    for (const variant of ['', ...Array.from({ length: variations }, (_, i) => String(i + 1))]) {
      for (const suffix of ['.sprite', '.lowend.sprite']) {
        const sprite = itemAssets.get(`hd/global/ui/items/misc/${mapping[grade]}${variant}${suffix}`);
        assert.ok(sprite, `${book.key}: ${grade} variant ${variant || 'default'} ${suffix} resolves`);
        assert.ok(sprite.subarray(40).some(v => v !== 0), 'nonempty inventory sprite');
      }
    }
  }
}
assert.throws(() => applyForgottenArts(ctx), /already been applied/);
const full = context();
for (let n = 1; n <= 10; n++) set(full.charstats, full.charstats.rows[0], `item${n}`, 'hp1');
assert.throws(() => applyForgottenArts(full), /no starting item slot/);
const withCube = context();
for (const row of withCube.charstats.rows.filter(r => get(withCube.charstats, r, 'str'))) {
  set(withCube.charstats, row, 'item10', 'box');
  set(withCube.charstats, row, 'item10count', '1');
}
applyForgottenArts(withCube);
for (const row of withCube.charstats.rows.filter(r => get(withCube.charstats, r, 'str'))) {
  assert.equal(Array.from({ length: 10 }, (_, i) => get(withCube.charstats, row, `item${i + 1}`)).filter(c => c === 'box').length, 1, 'honor an existing starting Cube');
}
console.log(`Forgotten Arts verified: ${BOOK_SPELLS.length} spell icons in HD/lowend/legacy, preserved utility artwork, ${books.length} unrestricted charms, ${classes.length} starters, progressively stronger loot tiers.`);
console.log('Act I balance verified: 1/90 ordinary kills plus starter, three encounters, one purchase and one container level averages 13 / 15 / 17 levels at 630 / 810 / 990 kills. Existing item odds preserved.');
console.log(`Verified ${recipes.length} lossless recipes, four Akara spells, starting Cubes, two bookcases, 15 chest pools, three encounter rewards and explicit HD item art.`);
console.log(`Verified ${powerRows.length} specific-spell equipment prefixes, ${chargeRows.length} charged suffixes (no passives), charge-level boundaries through 20, unique equipment grants, and preserved unrelated modifiers.`);

// Native vendor generation rolls unique variants from one shared shop-only base.
const shopCtx = structuredClone(ctx), shopBooks = structuredClone(books);
const oldUniques = structuredClone(shopCtx.uniqueitems.rows);
const lootBeforeShop = JSON.stringify(shopCtx.treasureclass);
exports.configureForgottenArtsShop(shopCtx, shopBooks);
assert.deepEqual(shopCtx.uniqueitems.rows.slice(0, oldUniques.length), oldUniques);
assert.equal(JSON.stringify(shopCtx.treasureclass), lootBeforeShop, 'shop rarity cannot change drops');
const regionalStock = exports.SPELL_SHOP_ACTS.filter(p => p.act > 1).reduce((sum, p) =>
  sum + books.filter(b => b.source === 'drop' && b.bonus === 1 && b.dropLevel <= p.maxSpellTier).length, 0);
// Drops and crafts, four fixed Akara scrolls, two fs4/fs5 variants, six fs6 rolls, regional stock.
assert.equal(shopBooks.length, BOOK_SPELLS.length * 4 + 4 + 2 + 6 + regionalStock);
const stock = shopBooks.filter(b => b.shopWeight);
assert.equal(stock.length, 6 + regionalStock);
assert.equal(new Set(stock.map(b => b.code)).size, 5, 'one shared native roll base per act');
let totalShopWeight = 0;
for (const b of shopBooks.filter(b => b.source === 'shop')) {
  const base = shopCtx.misc.rows.find(r => get(shopCtx.misc, r, 'code') === b.code);
  assert.equal(b.code.length, 3);
  assert.equal(get(shopCtx.misc, base, 'cost'), '7500');
  assert.equal(get(shopCtx.misc, base, 'PermStoreItem'), '0');
  assert.equal(get(shopCtx.misc, base, 'multibuy'), '0');
  const pool = exports.SPELL_SHOP_ACTS.find(p => p.act === b.shopAct);
  for (const vendor of ['Akara', 'Lysander', 'Drognan', 'Alkor', 'Ormus', 'Jamella', 'Malah']) {
    for (const suffix of ['Min', 'Max', 'MagicMin', 'MagicMax']) assert.equal(Number(get(shopCtx.misc, base, vendor + suffix)), pool?.vendors.includes(vendor) ? 3 : 0);
  }
  if (!b.shopWeight) continue;
  assert.equal(get(shopCtx.misc, base, 'unique'), '1');
  assert.equal(get(shopCtx.misc, base, 'rarity'), '0', 'base never enters ordinary loot');
  const unique = shopCtx.uniqueitems.rows.find(r => r[0] === b.key);
  const weight = exports.AKARA_SHOP_WEIGHTS[b.skill] ?? (b.dropLevel >= 24 || ['Static Field', 'Corpse Explosion', 'Teleport', 'Blessed Hammer'].includes(b.skill) ? 2 : 4);
  assert.equal(7500 + Number(get(shopCtx.uniqueitems, unique, 'cost add')), b.shopBaseCost);
  assert.equal(b.shopBaseCost, exports.spellShopPrice(b.skill, b.dropLevel));
  assert.equal(Number(get(shopCtx.uniqueitems, unique, 'rarity')), weight);
  assert.equal(get(shopCtx.uniqueitems, unique, 'nolimit'), '1', 'refreshes/duplicates can generate again');
  assert.equal(get(shopCtx.uniqueitems, unique, 'carry1'), '0');
  assert.equal(get(shopCtx.uniqueitems, unique, 'lvl'), '1', 'every option eligible at first shop visit');
  assert.equal(get(shopCtx.uniqueitems, unique, 'spawnable'), '1');
  if (b.shopAct === 1) totalShopWeight += weight;
}
assert.equal(totalShopWeight, 34);
const allRecipes = shopCtx.cubemain.rows.filter(r => r[0].startsWith('Forgotten Arts:') && get(shopCtx.cubemain, r, 'numinputs') === '3');
const newRecipes = shopCtx.cubemain.rows.slice(ctx.cubemain.rows.length);
assert.ok(newRecipes.length > 42);
for (const row of newRecipes) {
  const inputs = ingredients(row).map(key => shopBooks.find(b => b.key === key));
  const output = shopBooks.find(b => b.key === get(shopCtx.cubemain, row, 'output'));
  assert.equal(inputs.length, 3);
  assert.ok(inputs.every(b => b && b.skill === output.skill && b.bonus === 1));
  assert.equal(output.bonus, 3);
}
for (const skill of BOOK_SPELLS) {
  const variants = shopBooks.filter(b => b.skill === skill && b.bonus === 1);
  for (const a of variants) for (const b of variants) for (const c of variants) {
    const keys = [a.key, b.key, c.key].sort();
    assert.equal(allRecipes.filter(r => JSON.stringify(ingredients(r)) === JSON.stringify(keys)).length, 1, 'every old/new/drop combination has exactly one recipe');
  }
}
const shopArt = exports.buildForgottenArtsItemGraphics(shopBooks, structuredClone(originalItemArt), structuredClone(originalUniqueArt));
assert.equal(shopArt.items.filter(e => e.fs6).length, 1, 'one HD map entry for shared stock base');
for (const b of stock) assert.ok(shopArt.uniques.some(e => e[b.key.toLowerCase()]));
for (const pool of exports.SPELL_SHOP_ACTS) {
  const base = shopCtx.misc.rows.find(r => get(shopCtx.misc, r, 'code') === pool.code);
  const expected = shopBooks.filter(b => b.source === 'drop' && b.bonus === 1 && (pool.act === 1 ? exports.EARLY_BOOK_SPELLS.includes(b.skill) : b.dropLevel <= pool.maxSpellTier));
  assert.deepEqual(stock.filter(b => b.shopAct === pool.act).map(b => b.skill).sort(), expected.map(b => b.skill).sort());
  for (const field of ['NightmareUpgrade', 'HellUpgrade']) assert.equal(get(shopCtx.misc, base, field), pool.act === 5 ? 'xxx' : 'f05');
}
for (const [skill, tier, price] of [['Fire Bolt', 1, 7500], ['Charged Bolt', 1, 12500], ['Teeth', 1, 12500], ['Ice Blast', 6, 12500], ['Fire Ball', 12, 20000], ['Teleport', 18, 45000], ['Meteor', 24, 45000], ['Frozen Orb', 30, 60000]]) assert.equal(exports.spellShopPrice(skill, tier), price);
console.log('Verified all seven potion vendors, expanding act pools, Nightmare/Hell upgrades, spell prices, unchanged loot and every old/new/drop Cube combination.');

// Tooltip metadata is cosmetic, follows actual supported synergies, and keeps saved IDs stable.
const tooltipCtx = { ...shopCtx, properties: load('properties') };
const statsBefore = structuredClone(tooltipCtx.itemstatcost.rows);
const uniquesBefore = structuredClone(tooltipCtx.uniqueitems.rows);
const propertiesBefore = structuredClone(tooltipCtx.properties.rows);
const recipesBefore = tooltipCtx.cubemain.rows.length;
const synergies = exports.addSpellSynergyTooltips(tooltipCtx, shopBooks);
assert.equal(synergies.length, BOOK_SPELLS.length);
const fireBall = synergies.find(s => s.skill === 'Fire Ball');
assert.deepEqual(Array.from(fireBall.strengthenedBy), ['Fire Bolt', 'Meteor']);
assert.equal(fireBall.text, 'Meteor\nFire Bolt\nSynergies:');
assert.equal(synergies.find(s => s.skill === 'Teleport').text, 'None\nSynergies:');
assert.deepEqual(Array.from(synergies.find(s => s.skill === 'Bone Spear').strengthenedBy), ['Teeth', 'Bone Spirit']);
assert.ok(!synergies.some(s => /Bone Wall|Bone Prison/.test(s.text)));
assert.deepEqual(tooltipCtx.itemstatcost.rows.slice(0, statsBefore.length), statsBefore);
assert.deepEqual(tooltipCtx.properties.rows.slice(0, propertiesBefore.length), propertiesBefore);
assert.equal(tooltipCtx.cubemain.rows.length - recipesBefore, shopBooks.length);
for (const [i, row] of tooltipCtx.uniqueitems.rows.entries()) {
  const item = shopBooks.find(b => b.key === row[0]);
  for (const [column, field] of tooltipCtx.uniqueitems.headers.entries()) {
    if (item && ['prop3', 'min3', 'max3'].includes(field)) continue;
    assert.equal(row[column], uniquesBefore[i][column], `${row[0]} ${field} unchanged`);
  }
  if (!item) continue;
  const info = synergies.find(s => s.skill === item.skill);
  assert.equal(get(tooltipCtx.uniqueitems, row, 'prop3'), info.property);
  const stat = tooltipCtx.itemstatcost.rows.find(r => r[0] === info.stat);
  assert.equal(get(tooltipCtx.itemstatcost, stat, 'Add'), '0');
  assert.equal(get(tooltipCtx.itemstatcost, stat, 'Multiply'), '0');
  assert.equal(get(tooltipCtx.itemstatcost, stat, 'descstrpos'), info.key);
  const recipe = tooltipCtx.cubemain.rows.slice(recipesBefore).find(r => get(tooltipCtx.cubemain, r, 'input 1') === item.key);
  assert.equal(get(tooltipCtx.cubemain, recipe, 'output'), item.key);
  assert.equal(get(tooltipCtx.cubemain, recipe, 'numinputs'), '1');
}
console.log(`Verified ${synergies.length} cosmetic synergy descriptions, all item variants, unchanged gameplay properties, and exact-item refresh recipes.`);

if (process.argv.includes('--preview')) {
  const high = iconAssets.files.get('hd/global/ui/spells/submenu/skillicon.sprite');
  const tiles = [];
  for (const [i, source] of iconSources.entries()) {
    const { pixels, width, height } = extract(high, iconAssets.iconCels.get(source.skill));
    const x = (i % 7) * 160, y = Math.floor(i / 7) * 162;
    tiles.push({ input: await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer(), left: x + 14, top: y });
    const label = `<svg width="160" height="30"><text x="80" y="18" text-anchor="middle" fill="#ddd" font-family="Arial" font-size="12">${source.skill}</text></svg>`;
    tiles.push({ input: Buffer.from(label), left: x, top: y + 132 });
  }
  fs.mkdirSync('build', { recursive: true });
  await sharp({ create: { width: 1120, height: 810, channels: 4, background: '#141414' } })
    .composite(tiles).png().toFile('build/forgotten-arts-icons.png');
}
