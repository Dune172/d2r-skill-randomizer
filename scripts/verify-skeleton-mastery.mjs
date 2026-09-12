// Regression checks using the original summon rows and real synergy writers.
// Run: node --test scripts/verify-skeleton-mastery.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const modules = new Map();
function load(name) {
  const file = path.resolve(root, name);
  if (modules.has(file)) return modules.get(file).exports;
  const mod = { exports: {} };
  modules.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(spec => spec.startsWith('.')
    ? load(path.resolve(path.dirname(file), `${spec}.ts`)) : require(spec), mod, mod.exports);
  return mod.exports;
}
const { updateSkillsSynergies, updateSkillDescSynergies } = load('src/lib/randomizer/synergy-updater.ts');
const { writeSkillDescRows } = load('src/lib/randomizer/skilldesc-writer.ts');
const { loadSkills, loadTreeGrid } = load('src/lib/data-loader.ts');
const { createRNG } = load('src/lib/randomizer/seed.ts');
const { randomizeTrees } = load('src/lib/randomizer/tree-randomizer.ts');
const { placeSkills, groupByClass, HARDCODED_CLASS_SKILLS } = load('src/lib/randomizer/skill-placer.ts');
const { applyRaceMode } = load('src/lib/randomizer/race-mode.ts');
const { NO_GUARD_EXCLUDED_SKILLS } = load('src/lib/randomizer/mutations/no-guard.ts');
function table(name) {
  const [head, ...lines] = fs.readFileSync(path.join(root, 'data/txt', name), 'utf8').trimEnd().split(/\r?\n/);
  return { headers: head.replace(/^\uFEFF/, '').split('\t'), rows: lines.map(l => l.split('\t')) };
}
function fixture(summonName, masteryClass = 'sor') {
  const skills = table('skills.txt'), descs = table('skilldesc.txt');
  const get = (t, row, key) => row[t.headers.indexOf(key)] ?? '';
  const skillRows = new Map(skills.rows.map(r => [r[0], r]));
  const descRows = new Map(descs.rows.map(r => [r[0], r]));
  const names = [summonName, 'Fire Bolt', 'Skeleton Mastery', 'Summon Resist'];
  const placements = names.map((name, i) => ({ skill: { skill: name, skilldesc: get(skills, skillRows.get(name), 'skilldesc') },
    targetClass: name === 'Skeleton Mastery' ? masteryClass : name === 'Summon Resist' ? 'nec' : 'sor',
    tabIndex: i === 2 ? 2 : 0, row: 1, col: 1, iconCel: i * 2 }));
  const byClass = new Map();
  for (const p of placements) byClass.set(p.targetClass, [...(byClass.get(p.targetClass) ?? []), p]);
  const strNames = new Map(descs.rows.map(r => [r[0], get(descs, r, 'str name')]));
  const skillByName = new Map(skills.rows.map(r => [r[0], { skilldesc: get(skills, r, 'skilldesc') }]));
  const strToName = new Map(skills.rows.map(r => [strNames.get(get(skills, r, 'skilldesc')), r[0]]));
  // Deliberately choose Fire Bolt first: the old code disconnected Mastery even
  // when it was placed on the same class as its summon, on a different tab.
  const rng = { randInt: min => min, shuffle: a => [...a], next: () => 0 };
  const substitutions = updateSkillsSynergies(skills.rows, placements, byClass, rng, skills.headers, descs.rows);
  const updates = updateSkillDescSynergies(placements, byClass, strNames, descs, substitutions, skillByName, strToName, rng);
  writeSkillDescRows(descs.headers, descs.rows, placements, updates);
  const summon = skillRows.get(summonName), desc = descRows.get(get(skills, summon, 'skilldesc'));
  return { skills, descs, skillRows, summon, desc, substitutions,
    stat: key => get(skills, summon, key), display: key => get(descs, desc, key),
    str: name => strNames.get(skillByName.get(name).skilldesc) };
}
// Evaluate the narrow arithmetic used by these original health/damage formulas.
function evaluate(f, formula, masteryLevel) {
  const expression = formula.replace(/skill\('([^']+)'\.(lvl|blvl|par\d+)\)/g, (_, name, field) => {
    if (field === 'lvl' || field === 'blvl') return String(name === 'Skeleton Mastery' ? masteryLevel : 0);
    const row = f.skillRows.get(name);
    return row[f.skills.headers.indexOf(`Param${field.slice(3)}`)] || '0';
  }).replace(/\bpar(\d+)\b/g, (_, i) => f.stat(`Param${i}`) || '0').replace(/\blvl\b/g, '1').replace(/\bedmn\b/g, '1');
  assert.match(expression, /^[\d\s+*/().?:<>-]+$/);
  return new Function(`return (${expression});`)();
}

test('co-located Skeleton Mastery increases skeleton health, damage and matching tooltip values', () => {
  const f = fixture('Raise Skeleton');
  assert.equal(f.substitutions.get('Raise Skeleton').refToReplacement.get('Skeleton Mastery'), 'Skeleton Mastery');
  for (const points of [1, 5]) {
    assert.equal(evaluate(f, f.stat('passivecalc1'), points) - evaluate(f, f.stat('passivecalc1'), 0), points * 8 * 256);
    assert.equal(evaluate(f, f.stat('passivecalc2'), points) - evaluate(f, f.stat('passivecalc2'), 0), points * 2);
    assert.equal(evaluate(f, f.display('desccalcb6'), points) - evaluate(f, f.display('desccalcb6'), 0), points * 8);
  }
  assert.equal(f.display('dsc3texta2'), f.str('Skeleton Mastery'));
  assert.equal(f.display('dsc3texta3'), f.str('Summon Resist'), 'stat-based passive must not be relabeled as a random synergy');
  assert.equal(f.display('dsc3textb1'), f.str('Raise Skeleton'), 'bonus-list header remains a self-reference');
});

test('mage and Revive preserve their actual co-located mastery bonuses', () => {
  const mage = fixture('Raise Skeletal Mage');
  assert.equal(evaluate(mage, mage.stat('passivecalc1'), 1), 8 * 256);
  assert.match(mage.stat('sumsk1calc'), /skill\('Skeleton Mastery'\.lvl\)/);
  const revive = fixture('Revive');
  assert.equal(evaluate(revive, revive.stat('calc1'), 1) - evaluate(revive, revive.stat('calc1'), 0), 5);
  assert.equal(evaluate(revive, revive.stat('aurastatcalc1'), 1), 10);
});

test('Skeleton Mastery is a fixed summon dependency, never a randomized synergy', () => {
  const f = fixture('Raise Skeleton', 'bar');
  assert.match(f.stat('passivecalc2'), /skill\('Skeleton Mastery'\.lvl\)/);
  assert.match(f.stat('passivecalc2'), /skill\('Skeleton Mastery'\.par2\)/, 'retain original coefficient');
  assert.match(f.display('desccalcb6'), /skill\('Skeleton Mastery'\.lvl\)/);
  assert.equal(f.display('dsc3texta2'), f.str('Skeleton Mastery'));
  assert.equal(f.display('dsc3texta3'), f.str('Summon Resist'));
});

test('Mastery requires only one skeleton summon across seeds, mutations and Race Mode', () => {
  const skills = loadSkills(), pages = loadTreeGrid();
  const summons = ['Raise Skeleton', 'Raise Skeletal Mage'];
  let splitSummons = 0, separateRevive = 0, racesWithMastery = 0;
  for (const noGuard of [false, true]) for (let seed = 0; seed < 64; seed++) {
    const rng = createRNG(seed);
    const placed = placeSkills(rng, skills, randomizeTrees(rng, pages),
      noGuard ? { excludeSkills: new Set(NO_GUARD_EXCLUDED_SKILLS) } : undefined);
    const byName = new Map(placed.placements.map(p => [p.skill.skill, p]));
    const host = byName.get('Skeleton Mastery').targetClass;
    assert.ok(summons.some(name => byName.get(name).targetClass === host), `${seed}: Mastery needs at least one skeleton summon`);
    if (byName.get(summons[0]).targetClass !== byName.get(summons[1]).targetClass) splitSummons++;
    if (byName.get('Revive').targetClass !== host) separateRevive++;
    assert.equal(byName.size, 240, 'unique skill identities');
    for (const rows of groupByClass(placed.placements).values()) {
      assert.equal(rows.length, 30, 'class capacity preserved');
      assert.equal(new Set(rows.map(p => `${p.tabIndex}:${p.row}:${p.col}`)).size, 30, 'unique tree positions');
    }
    for (const [name, cls] of Object.entries(HARDCODED_CLASS_SKILLS)) if (!placed.droppedSkillNames.has(name)) assert.equal(byName.get(name).targetClass, cls);
    for (const [name, anchors] of Object.entries({ 'Feral Rage': ['Wearwolf'], Rabies: ['Wearwolf'], Maul: ['Wearbear'], 'Fire Claws': ['Wearwolf', 'Wearbear'], Hunger: ['Wearwolf', 'Wearbear'], 'Shape Shifting': ['Wearwolf', 'Wearbear'] })) {
      if (placed.droppedSkillNames.has(name)) continue;
      assert.ok(anchors.some(a => byName.get(a).targetClass === byName.get(name).targetClass), 'shapeshift dependencies remain intact');
    }
    const race = applyRaceMode(seed, placed.placements, placed.substitutes, skills);
    if (race.raceClass === host) {
      racesWithMastery++;
      assert.ok(summons.some(name => !race.substitutes.some(s => s.droppedSkill.skill === name)), 'playable Mastery retains at least one actual summon');
    }
  }
  assert.ok(splitSummons > 0 && separateRevive > 0 && racesWithMastery > 0);
  console.log(`Verified 128 placements: skeleton skills split across classes in ${splitSummons}; Mastery always has at least one`);
});
