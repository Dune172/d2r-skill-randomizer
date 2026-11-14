// Item randomization: unique, set item, set bonus and runeword lines are rerolled from
// pools of vanilla lines, and every skill line is remapped into the seed's skill rows.
// Run: node --test scripts/verify-item-randomizer.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import AdmZip from 'adm-zip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root); // the data loader reads data/ from the working directory
const require = createRequire(import.meta.url);
const modules = new Map();
function load(name) {
  const file = path.resolve(root, name);
  if (modules.has(file)) return modules.get(file).exports;
  if (file.endsWith('.json')) return require(file);
  const mod = { exports: {} };
  modules.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
  }).outputText;
  const resolve = spec => {
    const base = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : path.join(root, 'src', spec.slice(2));
    if (spec.endsWith('.json')) return base;
    return fs.existsSync(`${base}.ts`) ? `${base}.ts` : fs.existsSync(`${base}.tsx`) ? `${base}.tsx` : path.join(base, 'index.ts');
  };
  new Function('require', 'module', 'exports', code)(spec =>
    spec.startsWith('.') || spec.startsWith('@/') ? load(resolve(spec)) : require(spec), mod, mod.exports);
  return mod.exports;
}

const { generateMod } = load('src/lib/randomizer/generate-mod.ts');
const { DEFAULT_OPEN_ACTS } = load('src/lib/randomizer/open-acts/options.ts');
const ir = load('src/lib/randomizer/item-randomizer.ts');
const opt = load('src/lib/item-rando.ts');

const OPTS = {
  classBuild: null, weeklyEnabled: false, weekNumber: 0, forgottenArts: false, enablePrereqs: true,
  playersEnabled: false, playersCount: 1, playersActs: [], startingTeleportStaff: false,
  teleportStaffLevel: 1, teleportStaffDropSource: 'Corpsefire', teleportStaffSpeed: false,
  hirelingAura: true, disableChat: false, startingHoradricCube: false, xpMultiplier: 1,
  xpActs: [], xpDifficulties: [], raceMode: false, enemyShuffle: false,
  openActs: DEFAULT_OPEN_ACTS, mutationIds: [], customMutations: [],
  extras: { seasonal: false, anyClassItems: false },
};

const readTable = (text) => {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean).map(l => l.split('\t'));
  return { headers: lines[0], rows: lines.slice(1) };
};
const source = (name, base = false) =>
  readTable(fs.readFileSync(path.join(root, 'data', 'txt', ...(base ? ['base'] : []), name), 'utf8'));

async function build(seed, extra = {}) {
  const result = await generateMod(seed, { ...OPTS, ...extra });
  const files = new Map(new AdmZip(result.zip).getEntries().map(e => [e.entryName, e]));
  const xl = extra.baseGame ? 'global/excel/base' : 'global/excel';
  const raw = (name) => files.get(`${result.modName}.mpq/data/${xl}/${name}`)?.getData().toString('utf8');
  const table = (name) => {
    const text = raw(name);
    assert.ok(text, `${result.modName}: missing ${xl}/${name}`);
    return readTable(text);
  };
  const contents = () => new Map([...files].map(([n, e]) => [n, e.getData()]));
  return { ...result, files, raw, table, contents, has: (name) => raw(name) !== undefined };
}

function assertSameZip(a, b, label) {
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort(), `${label}: entry list`);
  for (const [n, buf] of a) assert.ok(buf.equals(b.get(n)), `${label}: ${n}`);
}

// Every [code, param, min, max] slot in each table, as the randomizer names them.
const SLOTS = {
  'uniqueitems.txt': ir.UNIQUE_PROP_NAMES,
  'setitems.txt': [...ir.SETITEM_PROP_NAMES, ...ir.SETITEM_APROP_NAMES],
  'sets.txt': [...ir.SET_PARTIAL_NAMES, ...ir.SET_FULL_NAMES],
  'runes.txt': ir.RUNEWORD_PROP_NAMES,
};
const lines = (t, names) => names.map(n => n.map(c => t.headers.indexOf(c))).filter(c => c.every(i => i !== -1));

const SKILL_CODES = new Set(['skill', 'oskill', 'charged', 'aura', 'hit-skill', 'gethit-skill', 'Gethit-skill',
  'att-skill', 'kill-skill', 'death-skill', 'levelup-skill']);
const PROC_CODES = new Set(['hit-skill', 'gethit-skill', 'att-skill', 'kill-skill', 'death-skill', 'levelup-skill', 'charged']);
const FIXED = new Set(['sock', 'ethereal', 'indestruct', 'dur', 'rep-dur', 'rep-quant', 'stack', 'randclassskill', 'state']);

test('off: set and runeword tables ship with only their skill references changed', async () => {
  for (const seed of [1, 42]) {
    const off = await build(seed);
    const zero = await build(seed, { itemRando: 0 });
    assertSameZip(zero.contents(), off.contents(), `seed ${seed}: itemRando 0 differs from no option`);
    assert.equal(off.itemRandoReport, undefined);
    for (const name of ['setitems.txt', 'sets.txt', 'runes.txt']) {
      const src = source(name);
      const out = off.table(name);
      assert.deepEqual(out.headers, src.headers, `${name}: headers`);
      assert.equal(out.rows.length, src.rows.length, `${name}: row count`);
      // Every column but the param of a skill line is vanilla.
      const skillParams = new Set();
      for (let i = 0; i < src.rows.length; i++) {
        for (const [c, p] of lines(src, SLOTS[name])) if (SKILL_CODES.has(src.rows[i][c])) skillParams.add(`${i}:${p}`);
      }
      for (let i = 0; i < src.rows.length; i++) {
        for (let j = 0; j < src.headers.length; j++) {
          if (skillParams.has(`${i}:${j}`)) continue;
          assert.equal(out.rows[i][j], src.rows[i][j], `${name} row ${i} (${src.rows[i][0]}) ${src.headers[j]}`);
        }
      }
    }
  }
});

test('off: Leaf and Black grant the skills they name in vanilla', async () => {
  const vanilla = source('skills.txt');
  let checked = 0;
  for (const seed of [1, 42, 777, 2026]) {
    const mod = await build(seed);
    const skills = mod.table('skills.txt');
    const runes = mod.table('runes.txt');
    const src = source('runes.txt');
    for (const rw of ['Leaf', 'Black']) {
      const i = src.rows.findIndex(r => r[1] === rw);
      assert.ok(i !== -1, rw);
      for (const [c, p] of lines(src, SLOTS['runes.txt'])) {
        if (!['skill', 'oskill', 'charged'].includes(src.rows[i][c]) || !/^\d+$/.test(src.rows[i][p])) continue;
        assert.equal(skills.rows[Number(runes.rows[i][p])][0], vanilla.rows[Number(src.rows[i][p])][0],
          `seed ${seed} ${rw}: ${src.rows[i][c]} ${src.rows[i][p]} -> ${runes.rows[i][p]}`);
        checked++;
      }
    }
  }
  // Leaf: +3 Fire Bolt, Warmth, Inferno; Black: Corpse Explosion charges. Four lines per seed.
  assert.equal(checked, 16);
});

test('fully random: lines change, skills.txt and trees do not, output is deterministic', async () => {
  for (const seed of [1, 42, 777, 2026]) {
    const off = await build(seed);
    const on = await build(seed, { itemRando: 2 });
    const again = await build(seed, { itemRando: 2 });
    assertSameZip(on.contents(), again.contents(), `seed ${seed}: not deterministic`);
    assert.equal(on.raw('skills.txt'), off.raw('skills.txt'), `seed ${seed}: skills.txt changed`);
    assert.equal(on.raw('charstats.txt'), off.raw('charstats.txt'), `seed ${seed}: charstats.txt changed`);
    assert.equal(on.raw('magicprefix.txt'), off.raw('magicprefix.txt'), `seed ${seed}: magic affixes changed`);
    const r = on.itemRandoReport;
    assert.ok(r && r.items > 500, `seed ${seed}: only ${r?.items} items`);
    assert.ok(r.rerolled > r.kept * 4, `seed ${seed}: rerolled ${r.rerolled}, kept ${r.kept}`);

    // Fixed lines stay exactly where they were.
    for (const [name, names] of Object.entries(SLOTS)) {
      const src = source(name);
      const out = on.table(name);
      assert.equal(out.rows.length, src.rows.length, `${name}: row count`);
      const cols = lines(src, names);
      let changed = 0, total = 0;
      for (let i = 0; i < src.rows.length; i++) {
        const seen = new Set();
        for (const [c, p] of cols) {
          const code = src.rows[i][c];
          if (FIXED.has(code)) assert.equal(out.rows[i][c], code, `${name} row ${i}: fixed ${code} moved`);
          if (code) { total++; if (out.rows[i][c] !== code || out.rows[i][p] !== src.rows[i][p]) changed++; }
          // A set item's own lines and its green set lines are separate groups.
          const key = `${src.headers[c].startsWith('aprop') ? 'green' : 'own'}|${out.rows[i][c]}|${out.rows[i][p]}`;
          if (out.rows[i][c] && !FIXED.has(out.rows[i][c]) && SKILL_CODES.has(out.rows[i][c]) === false) {
            assert.ok(!seen.has(key), `${name} row ${i} (${src.rows[i][0]}): duplicate line ${key}`);
          }
          seen.add(key);
        }
      }
      assert.ok(changed > total * 0.6, `${name}: only ${changed}/${total} lines changed`);
    }
  }
});

test('every skill line names a real skill, procs cast something', async () => {
  for (const seed of [3, 42, 99999]) {
    for (const level of [1, 2]) {
      const mod = await build(seed, { itemRando: level });
      const skills = mod.table('skills.txt');
      const names = new Set(skills.rows.map(r => r[0].toLowerCase()));
      const passive = skills.headers.indexOf('passive');
      const aurafilter = skills.headers.indexOf('aura');
      for (const [name, slotNames] of Object.entries(SLOTS)) {
        const t = mod.table(name);
        for (const row of t.rows) {
          for (const [c, p] of lines(t, slotNames)) {
            const code = row[c];
            if (!SKILL_CODES.has(code) || !row[p]) continue;
            const par = row[p];
            const id = Number(par);
            const skillRow = Number.isInteger(id) && /^\d+$/.test(par) ? skills.rows[id] : skills.rows.find(r => r[0].toLowerCase() === par.toLowerCase());
            assert.ok(skillRow || names.has(par.toLowerCase()), `seed ${seed} ${name} ${row[0]}: ${code} ${par} is not a skill`);
            if (PROC_CODES.has(code) && skillRow) {
              assert.ok(skillRow[passive] !== '1' && skillRow[aurafilter] !== '1',
                `seed ${seed} ${name} ${row[0]}: ${code} ${par} (${skillRow[0]}) is a passive or aura`);
            }
          }
        }
      }
    }
  }
});

test('kept skill lines on set items and runewords follow their skill through the shuffle', async () => {
  const vanillaSkills = source('skills.txt');
  let checked = 0;
  for (const seed of [5, 6, 7, 8]) {
    const mod = await build(seed, { itemRando: 1 });
    const skills = mod.table('skills.txt');
    for (const name of ['setitems.txt', 'sets.txt', 'runes.txt']) {
      const src = source(name);
      const out = mod.table(name);
      const cols = lines(src, SLOTS[name]);
      for (let i = 0; i < src.rows.length; i++) {
        for (const [c, p, mi, ma] of cols) {
          const code = src.rows[i][c];
          if (!['oskill', 'skill'].includes(code) || !/^\d+$/.test(src.rows[i][p])) continue;
          if (name === 'setitems.txt' && code === 'skill') continue; // class pieces position-remap
          // Kept in place (same code and values): the remapped row names the same skill.
          if (out.rows[i][c] !== code || out.rows[i][mi] !== src.rows[i][mi] || out.rows[i][ma] !== src.rows[i][ma]) continue;
          const before = vanillaSkills.rows[Number(src.rows[i][p])][0];
          const after = skills.rows[Number(out.rows[i][p])]?.[0];
          assert.equal(after, before, `seed ${seed} ${name} ${src.rows[i][0]}: ${code} ${src.rows[i][p]}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 5, `only ${checked} kept numeric skill lines checked`);
});

test('partly random keeps about half the lines', async () => {
  const r = (await build(11, { itemRando: 1 })).itemRandoReport;
  const share = r.kept / (r.kept + r.rerolled);
  assert.ok(share > 0.4 && share < 0.65, `kept share ${share.toFixed(2)}`);
});

test('bow-only lines land only on bows and crossbows', async () => {
  const types = new Map();
  for (const f of ['weapons.txt', 'armor.txt', 'misc.txt']) {
    const t = source(f);
    const code = t.headers.indexOf('code'), type = t.headers.indexOf('type');
    for (const r of t.rows) types.set(r[code], r[type]);
  }
  const BOWS = new Set(['bow', 'xbow', 'abow', 'miss']);
  for (const seed of [1, 2, 3, 4, 5]) {
    const t = (await build(seed, { itemRando: 2 })).table('uniqueitems.txt');
    const code = t.headers.indexOf('code');
    for (const row of t.rows) {
      for (const [c] of lines(t, SLOTS['uniqueitems.txt'])) {
        if (['explosivearrow', 'magicarrow'].includes(row[c])) {
          assert.ok(BOWS.has(types.get(row[code])), `seed ${seed}: ${row[0]} (${row[code]}) got ${row[c]}`);
        }
      }
    }
  }
});

test('base-game mods reroll the base tables', async () => {
  const mod = await build(9, { itemRando: 2, baseGame: true });
  for (const name of ['uniqueitems.txt', 'setitems.txt', 'sets.txt', 'runes.txt']) {
    assert.equal(mod.table(name).rows.length, source(name, true).rows.length, `base ${name}: row count`);
  }
  assert.ok(mod.itemRandoReport.rerolled > 1000);
});

test('refused with challenges, Forgotten Arts and Archipelago', async () => {
  await assert.rejects(build(1, { itemRando: 2, weeklyEnabled: true, weekNumber: 18 }), /Item randomization/);
  await assert.rejects(build(1, { itemRando: 2, forgottenArts: true }), /Item randomization/);
  await assert.rejects(build(1, { itemRando: 2, ap: { savepath: 'x' } }), /Item randomization/);
});

test('option helpers', () => {
  assert.equal(opt.normalizeItemRando('2'), 2);
  assert.equal(opt.normalizeItemRando(7), 0);
  assert.equal(opt.normalizeItemRando(undefined), 0);
  assert.equal(opt.parseItemRando(null), 0);
  assert.equal(opt.parseItemRando('1'), 1);
  assert.equal(opt.itemRandoParam(0), '');
  assert.equal(opt.itemRandoParam(2), 'items=2');
  assert.equal(opt.itemRandoCacheSegment(0), '');
});
