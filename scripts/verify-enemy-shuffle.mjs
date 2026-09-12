/** Run real TS modules against the bundled game tables: node scripts/verify-enemy-shuffle.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const modules = new Map();
// In-memory TS loader, using the actual implementation and resolving project aliases.
function load(name) {
  const filename = path.resolve(root, name);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = spec => {
    if (!spec.startsWith('.') && !spec.startsWith('@/')) return require(spec);
    const target = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(filename), spec);
    if (target.endsWith('.json')) return require(target);
    return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'));
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}
const { loadTxtFile, serializeTxtFile } = load('src/lib/data-loader.ts');
const { randomizeEnemies, finalizeEnemyManifest } = load('src/lib/randomizer/enemy-randomizer.ts');
const { balanceEnemy } = load('src/lib/randomizer/enemy-balance.ts');
const { scaleMonstats, monsterAct } = load('src/lib/randomizer/players-scaler.ts');
const { scaleExperienceRows } = load('src/lib/randomizer/experience-scaler.ts');
const { applyTheHorde } = load('src/lib/randomizer/mutations/the-horde.ts');
const { applyCourtOfKings } = load('src/lib/randomizer/mutations/court-of-kings.ts');
const { applyWeeklyMutations } = load('src/lib/randomizer/mutations/index.ts');
const { buildZip } = load('src/lib/zip-builder.ts');
const { makeCacheKey } = load('src/lib/zip-cache.ts');
const graphics = JSON.parse(fs.readFileSync(path.join(root, 'data/hd/character/monsters.json'), 'utf8'));
const baseMon = loadTxtFile('monstats.txt');
const baseLevels = loadTxtFile('levels.txt');
const monstats2 = loadTxtFile('monstats2.txt');
const missiles = loadTxtFile('missiles.txt');
const monlvl = loadTxtFile('monlvl.txt');
const obj = (t, row) => Object.fromEntries(t.headers.map((h, i) => [h, row[i] ?? '']));
const byId = new Map(baseMon.rows.map(r => [r[0], obj(baseMon, r)]));
const clone = t => ({ headers: [...t.headers], rows: t.rows.map(r => [...r]) });
const run = seed => {
  const monstats = clone(baseMon), levels = clone(baseLevels);
  const result = randomizeEnemies(seed, monstats, levels, monstats2, missiles, graphics);
  return { ...result, monstats, levels };
};

let first;
const donatedFamilies = new Set();
for (const seed of [0, 1, 2, 42, 12345, 2147483647, -1, -2147483648]) {
  const r = run(seed);
  first ??= r;
  assert.deepEqual(r.monstats.rows.slice(0, baseMon.rows.length), baseMon.rows, 'original monsters unchanged');
  assert.deepEqual(r.missiles.rows.slice(0, missiles.rows.length), missiles.rows, 'original projectiles unchanged');
  const missileById = new Map(r.missiles.rows.map(row => [row[0], obj(r.missiles, row)]));
  assert.equal(missileById.size, r.missiles.rows.length, 'unique projectile IDs');
  for (const [i, projectile] of r.manifest.projectiles.entries()) {
    const missile = missileById.get(projectile.id);
    assert.equal(missile['*ID'], String(missiles.rows.filter(row => row[0] !== 'Expansion').length + i));
    assert.equal(missile.SrcDamage, '128');
    assert.equal(missile.HitShift, '8');
    assert.equal(missile.VelLev, '0');
    for (const key of r.missiles.headers.filter(h => /^(MinDamage|MaxDamage|MinLevDam\d|MaxLevDam\d|EMin|EMax|MinELev\d|MaxELev\d)$/.test(h))) assert.equal(+missile[key], 0, 'no independent projectile damage');
  }
  assert.ok(r.manifest.projectiles.length > 0, 'quill projectiles are included');
  assert.deepEqual(new Set(r.manifest.replacements.map(p => p.act)), new Set([1, 2, 3, 4, 5]));
  assert.ok(r.manifest.profiles.length > 0 && r.manifest.profiles.length <= 512);
  assert.equal(new Set(r.monstats.rows.map(row => row[0])).size, r.monstats.rows.length);
  const originalIndexes = baseMon.rows.filter(row => row[0] !== 'Expansion').length;
  for (const [i, profile] of r.manifest.profiles.entries()) {
    const local = byId.get(profile.baseline), source = byId.get(profile.source), m = profile.balanced;
    donatedFamilies.add(source.BaseId);
    assert.equal(m.MonProp, '', 'target monster properties never transfer to donors');
    assert.equal(+m.deathDmg, 0, 'target death explosions never transfer to donors');
    assert.ok(!['scarab1', 'blunderbore1', 'bonefetish1', 'regurgitator1', 'skeleton1', 'fetish1', 'fetishblow1'].includes(source.BaseId), 'new target exceptions are not donor permissions');
    if (source.BaseId === 'zealot1') assert.notEqual(profile.act, 3, 'quest-dependent zealot flight cannot activate outside Act 3');
    assert.equal(m['*hcIdx'], String(originalIndexes + i));
    assert.equal(m.Level, local.Level);
    assert.equal(m.MonStatsEx, source.MonStatsEx);
    assert.equal(m.BaseId, source.BaseId);
    assert.equal(m.NextInClass, '');
    assert.equal(m.minion1, source.minion1 === source.Id ? m.Id : '', 'only donor self parties are retained');
    assert.equal(m.minion2, '');
    assert.equal(m.Velocity, source.Velocity, 'native walking speed retained');
    assert.equal(m.Run, source.Run, 'native running speed retained');
    assert.ok(+m.MinGrp <= +m.MaxGrp && +m.MinGrp >= 1 && +m.MaxGrp <= 8);
    assert.ok(+m.MaxGrp <= Math.max(1, +source.MaxGrp), 'never enlarge a donor pack to match the replaced enemy');
    if (source.BaseId === 'quillrat1') {
      assert.equal(m.MissA2, `d2rr_${source.MissA2}`);
      assert.ok(missileById.has(m.MissA2), 'quill uses an exported private projectile');
    }
    assert.equal(r.graphics[m.Id], graphics[source.Id]);
    assert.equal(r.destinationActs.get(m.Id), profile.act);
    for (const key of baseMon.headers.filter(h => h.startsWith('TreasureClass') || h === 'Rarity')) {
      assert.equal(m[key], local[key], `${key}: preserve destination rewards / population`);
    }
    for (const suffix of ['', '(N)', '(H)']) {
      const min = suffix ? `MinHP${suffix}` : 'minHP', max = suffix ? `MaxHP${suffix}` : 'maxHP';
      assert.ok(+m[min] <= +m[max]);
      for (const field of [min, max, `AC${suffix}`, `Exp${suffix}`]) {
        assert.equal(m[field], source[field], `${field}: level handles scaling without coefficient normalization`);
      }
      for (const attack of ['A1', 'A2', 'S1']) {
        for (const stat of ['MinD', 'MaxD', 'TH']) {
          const field = `${attack}${stat}${suffix}`;
          assert.equal(m[field], source[field], `${field}: retain donor attack, including unused channels`);
        }
      }
      for (const i of [1, 2, 3]) {
        if (['fire', 'ltng', 'cold', 'mag', 'rand', 'pois'].includes(source[`El${i}Type`]) &&
            ['A1', 'A2', 'S1'].includes(source[`El${i}Mode`]) && +source[`El${i}Pct${suffix}`] > 0) {
          for (const stat of ['MinD', 'MaxD']) assert.equal(m[`El${i}${stat}${suffix}`], source[`El${i}${stat}${suffix}`], 'active elemental magnitude scales by level');
        }
        assert.ok(+m[`El${i}Dur${suffix}`] <= 25, 'status duration remains bounded');
      }
    }
    for (const res of ['ResDm', 'ResMa', 'ResFi', 'ResLi', 'ResCo', 'ResPo']) {
      assert.ok(+m[res] <= (+local.Level < 12 ? 25 : 50), 'Normal retains resistance caps');
      for (const diff of ['(N)', '(H)']) assert.equal(m[`${res}${diff}`], source[`${res}${diff}`], 'Nightmare/Hell retain donor resistances and immunities exactly');
    }
    assert.ok(!Object.entries(m).some(([k, v]) => !k.startsWith('*') && /^-?\d+\.\d+$/.test(v)));
    assert.ok(!Object.keys(m).some(k => /^Skill\d$/.test(k) && m[k]), 'no unreviewed skill damage');
    // Multiplying both by the same real level-table value must preserve the
    // intended local ratio. There is no second source/target level multiplier.
    const lvl = monlvl.rows.find(row => row[0] === local.Level);
    assert.ok(lvl, `missing monster level ${local.Level}`);
    for (const hpColumn of ['HP', 'L-HP']) {
      const scale = +lvl[monlvl.headers.indexOf(hpColumn)] / 100;
      assert.ok(+m.maxHP * scale > 0, 'level-scaled life is positive');
    }
  }
  for (let i = 0; i < baseLevels.rows.length; i++) for (let c = 0; c < baseLevels.headers.length; c++) {
    const before = baseLevels.rows[i][c], after = r.levels.rows[i][c];
    if (before === after) continue;
    assert.match(baseLevels.headers[c], /^(mon|nmon|umon)\d+$/);
    assert.ok(before, 'never fill an empty spawn slot');
    assert.ok(r.destinationActs.has(after));
  }
  for (const replacement of r.manifest.replacements) {
    assert.notEqual(byId.get(replacement.original).BaseId, byId.get(replacement.replacement).BaseId);
    const sourceAreas = baseLevels.rows.map(row => obj(baseLevels, row)).filter(area =>
      Object.entries(area).some(([k, v]) => /^mon\d+$/.test(k) && v === replacement.replacement));
    assert.ok(sourceAreas.every(area => +area.Act + 1 !== replacement.act), 'donor variant must come from another act');
    const area = obj(baseLevels, baseLevels.rows.find(row => +row[baseLevels.headers.indexOf('Id')] === replacement.areaId));
    const leaders = Object.entries(area).filter(([k, v]) => /^(mon|nmon|umon)\d+$/.test(k) && v).map(([, v]) => byId.get(v)).filter(Boolean);
    const forbidden = new Set();
    for (const leader of leaders) {
      for (const field of ['minion1', 'minion2', 'spawn']) if (leader[field] !== leader.Id && byId.has(leader[field])) forbidden.add(byId.get(leader[field]).BaseId);
      if (leader.AI === 'GreaterMummy') ['skeleton1', 'sk_archer1', 'skmage_pois1', 'skmage_cold1', 'skmage_fire1', 'skmage_ltng1', 'mummy1'].forEach(f => forbidden.add(f));
      if (leader.AI === 'FetishShaman') ['fetish1', 'fetishblow1'].forEach(f => forbidden.add(f));
    }
    assert.ok(!forbidden.has(byId.get(replacement.original).BaseId), 'dependent family variants remain with their leader');
    assert.ok(!forbidden.has(byId.get(replacement.replacement).BaseId), 'donors cannot join unbalanced leader interactions');
  }
  for (const family of ['scarab1', 'blunderbore1', 'regurgitator1', 'skeleton1', 'fetish1', 'fetishblow1', 'bonefetish1']) assert.ok(r.manifest.replacements.some(p => byId.get(p.original).BaseId === family), `${family} has replaceable encounters`);
  assert.deepEqual(r.manifest.replacements.filter(p => p.areaId === 2 && /^mon\d+$/.test(p.slot)).map(p => p.original).sort(), ['fallen1', 'quillrat1', 'zombie1'], 'all three Blood Moor Normal families change');
  assert.ok(r.manifest.skipped.some(p => p.reason === 'linked-area-group'), 'mixed leader/minion groups remain intact');
  assert.ok(!r.manifest.replacements.some(p => [37, 39, 73, 102, 108, 110, 120, 131, 132, 133, 134, 135, 136].includes(p.areaId)));
  console.log(`seed ${seed}: ${r.manifest.profiles.length} isolated monsters, ${r.manifest.replacements.length} slots (${r.manifest.replacements.filter(p => /^mon\d+$/.test(p.slot)).length} Normal), ${r.manifest.projectiles.length} private projectiles across all five acts`);
}
for (const family of ['mummy1', 'minion1', 'zealot1']) assert.ok(donatedFamilies.has(family), `${family} appears in the expanded donor pool`);
assert.deepEqual(run(0), first, 'same seed produces identical output');
assert.notDeepEqual(run(1).manifest.replacements, first.manifest.replacements, 'different seeds vary the roster');
assert.deepEqual(monstats2, loadTxtFile('monstats2.txt'));
assert.deepEqual(missiles, loadTxtFile('missiles.txt'));
assert.equal(Object.keys(graphics).some(k => k.startsWith('d2rr_')), false, 'reference graphics not mutated');

// Same monster keeps its own coefficients regardless of the species it replaces.
const brute = balanceEnemy(byId.get('brute2'), byId.get('fallen1'));
const bruteOverZombie = balanceEnemy(byId.get('brute2'), byId.get('zombie1'));
const fallen = balanceEnemy(byId.get('fallen1'), byId.get('zombie1'));
for (const field of ['minHP', 'maxHP', 'A1MinD', 'A1MaxD', 'A2MinD', 'A2MaxD', 'Velocity', 'Run', 'MinGrp', 'MaxGrp', 'AC', 'Exp']) assert.equal(brute[field], bruteOverZombie[field], `${field} does not inherit replaced species' toughness`);
assert.ok(+brute.minHP > +fallen.minHP * 3 && +brute.maxHP > +fallen.maxHP * 2);
assert.ok(+brute.MaxGrp < +byId.get('fallen1').MaxGrp && !brute.PartyMax, 'brute never inherits Fallen escorts');
assert.ok(+brute.A2MaxD > +brute.A1MaxD, 'heavy swing remains stronger');
const levelBase = (level, field) => +monlvl.rows.find(row => +row[0] === level)[monlvl.headers.indexOf(field)];
const laterBrute = balanceEnemy(byId.get('brute2'), { ...byId.get('fallen1'), Level: '20' });
assert.equal(laterBrute.maxHP, brute.maxHP, 'raw health is unchanged by relocation');
assert.equal(laterBrute.A1MaxD, brute.A1MaxD, 'raw attack is unchanged by relocation');
const effectiveHP = m => +m.maxHP * levelBase(+m.Level, 'L-HP') / 100;
const effectiveDamage = m => +m.A1MaxD * levelBase(+m.Level, 'L-DM') / 100;
assert.ok(effectiveHP(laterBrute) > effectiveHP(brute));
assert.ok(effectiveDamage(laterBrute) > effectiveDamage(brute));
// Published research example: level 32 -> 18 changes HP by 64/150 and damage by 12/20.
const late = { ...byId.get('minion1'), Level: '32' };
const relocated = balanceEnemy(late, { ...byId.get('fallen1'), Level: '18' });
assert.ok(Math.abs(effectiveHP(relocated) / effectiveHP(late) - 64 / 150) < 1e-10);
assert.ok(Math.abs(effectiveDamage(relocated) / effectiveDamage(late) - 12 / 20) < 1e-10);
const relabeledSource = balanceEnemy({ ...late, Level: '90' }, { ...byId.get('fallen1'), Level: '18' });
assert.equal(relabeledSource.maxHP, relocated.maxHP, 'no second level multiplier');
// Explicit Act V -> early Act I elemental resistance regression, including an immunity outlier.
const immuneDonor = { ...byId.get('minion1'), ResFi: '150', ResCo: '100', ResLi: '75', ResPo: '-20',
  'ResFi(N)': '150', 'ResFi(H)': '150', 'ResCo(H)': '0' };
const earlyDestination = { ...byId.get('fallen1'), 'ResFi(H)': '0', 'ResCo(H)': '120' };
const killable = balanceEnemy(immuneDonor, earlyDestination);
assert.equal(killable.ResFi, '25');
assert.equal(killable.ResCo, '25');
assert.equal(killable.ResLi, '25');
assert.equal(killable.ResPo, '-20', 'preserve elemental vulnerability');
assert.equal(killable['ResFi(N)'], '150', 'Nightmare donor immunity is uncapped');
assert.equal(killable['ResFi(H)'], '150', 'Hell donor immunity is uncapped');
assert.equal(killable['ResCo(H)'], '0', 'do not add the replaced monster immunity');
assert.equal(balanceEnemy(immuneDonor, { ...earlyDestination, Level: '12' }).ResFi, '50');
const mummy = balanceEnemy(byId.get('mummy1'), byId.get('fallen1'));
assert.equal(mummy.El1MaxD, byId.get('mummy1').El1MaxD, 'poison rate uses native level-scaled damage');
assert.ok(+mummy.El1Dur > 0 && +mummy.El1Dur <= 25, 'long poison duration is limited');
const cold = balanceEnemy({ ...late, El1Type: 'cold', El1Mode: 'A1', El1Pct: '100', El1MinD: '20', El1MaxD: '40', El1Dur: '100' }, earlyDestination);
assert.equal(cold.El1MaxD, '40', 'cold damage still scales with level');
assert.equal(cold.El1Dur, '0', 'no imported early chill duration');
console.log('PASS: native stat coefficients, original level curve, Act V resistance outliers, and status duration safeguards');

// Explicit destination must win over stale/special loot-table act inference.
const p = first.manifest.profiles[0];
const dest = new Map([[p.id, 5]]);
assert.equal(monsterAct(p.id, 'Act 1 H2H A', dest), 5);
assert.equal(monsterAct(p.id, 'Quill 1', dest), 5);
const index = first.monstats.rows.findIndex(row => row[0] === p.id);
const hp = first.monstats.headers.indexOf('minHP'), xp = first.monstats.headers.indexOf('Exp');
const scaled = scaleMonstats(first.monstats.headers, first.monstats.rows, 8, [5], new Set(), dest);
assert.equal(+scaled[index][hp], Math.round(+first.monstats.rows[index][hp] * 4.5));
assert.deepEqual(scaleMonstats(first.monstats.headers, first.monstats.rows, 8, [1], new Set(), dest)[index], first.monstats.rows[index]);
const boosted = scaleExperienceRows(first.monstats.headers, scaled, 3, [5], [1], new Set(), dest);
assert.equal(+boosted[index][xp], Math.round(+scaled[index][xp] * 3));
assert.equal(boosted[index][first.monstats.headers.indexOf('Exp(H)')], scaled[index][first.monstats.headers.indexOf('Exp(H)')]);
assert.deepEqual(scaleMonstats(first.monstats.headers, first.monstats.rows, 8, [5], new Set([p.id]), dest)[index], first.monstats.rows[index]);

const horde = clone(first.monstats);
horde.rows[index][horde.headers.indexOf('TreasureClass')] = 'Quill 1';
applyTheHorde({ monstats: horde, monsterDestinationActs: dest });
assert.equal(+horde.rows[index][xp], Math.max(1, Math.round(+first.monstats.rows[index][xp] * 2 / 3)), 'mutations recognize relocated special-drop enemies');
const kings = clone(first.levels);
applyCourtOfKings({ levels: kings });
assert.equal(kings.rows[2][kings.headers.indexOf('mon1')], first.levels.rows[2][first.levels.headers.indexOf('mon1')]);
assert.equal(kings.rows[110][kings.headers.indexOf('MonDen')], baseLevels.rows[110][baseLevels.headers.indexOf('MonDen')]);
const ctx = { monsterDestinationActs: first.destinationActs, monstats: clone(first.monstats), levels: clone(first.levels) };
for (const [key, file] of Object.entries({charstats:'charstats',skills:'skills',superuniques:'superuniques',treasureclass:'treasureclassex',experience:'experience',armor:'armor',weapons:'weapons',misc:'misc',uniqueitems:'uniqueitems',magicprefix:'magicprefix',magicsuffix:'magicsuffix',hireling:'hireling'})) ctx[key] = loadTxtFile(`${file}.txt`);
applyWeeklyMutations(1, ctx); // Also verifies the metadata map is not treated as a TXT table.
finalizeEnemyManifest(first.manifest, { ...first.monstats, rows: boosted });
assert.equal(first.manifest.profiles[0].final.minHP, boosted[index][hp]);

const args = [42, 1, 0, [1,2,3,4,5], true, 'Corpsefire', false, false, true, 1, [1,2,3,4,5], [1,2,3], 0, false, false, true];
assert.notEqual(makeCacheKey(...args, false), makeCacheKey(...args, true));
const AdmZip = require('adm-zip');
const zipInput = { modName:'seed42', seed:42, raceMode:false, skillsTxt:'stub', skillDescTxt:'stub', treeSprites:new Map(), iconSprites:new Map() };
const missileText = serializeTxtFile(first.missiles.headers, first.missiles.rows);
const zip = new AdmZip(buildZip({ ...zipInput, missilesTxt:missileText, monsterGraphicsJson:JSON.stringify(first.graphics), enemyManifestJson:JSON.stringify(first.manifest) }));
assert.equal(zip.readAsText('seed42/seed42.mpq/data/global/excel/missiles.txt'), missileText);
assert.ok(zip.getEntry('seed42/seed42.mpq/data/hd/character/monsters.json'));
assert.ok(zip.getEntry('seed42/enemy-shuffle.json'));
const vanillaZip = new AdmZip(buildZip(zipInput));
assert.ok(!vanillaZip.getEntries().some(e => e.entryName.includes('enemy-shuffle') || e.entryName.includes('monsters.json') || e.entryName.endsWith('/missiles.txt')));
const badMon = clone(baseMon);
badMon.headers[badMon.headers.indexOf('Level')] = 'broken';
assert.throws(() => randomizeEnemies(0, badMon, clone(baseLevels), monstats2, missiles, graphics), /missing Level/);
assert.throws(() => randomizeEnemies(0, clone(baseMon), clone(baseLevels), monstats2, missiles, {}), /no compatible/);
console.log('PASS: determinism, protected rows, level scaling/rewards, references, modifiers, cache separation and ZIP exports');
