// /builder hand-built class: placer invariants, validator, fill and share codec.
// Run: node --test scripts/verify-class-build.mjs
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
  new Function('require', 'module', 'exports', code)(spec =>
    spec.startsWith('.') ? load(path.resolve(path.dirname(file), `${spec}.ts`))
      : spec.startsWith('@/') ? load(path.join(root, 'src', `${spec.slice(2)}.ts`))
        : require(spec), mod, mod.exports);
  return mod.exports;
}

const { loadSkills, loadTreeGrid } = load('src/lib/data-loader.ts');
const { createRNG } = load('src/lib/randomizer/seed.ts');
const { CLASS_DEFS } = load('src/lib/randomizer/config.ts');
const { HARDCODED_CLASS_SKILLS, SKILL_CLASS_EXCLUSIONS, COPACEMENT_REQUIRES, orderedFilledSlots } =
  load('src/lib/randomizer/skill-placer.ts');
const { runPlacement } = load('src/lib/randomizer/placement-step.ts');
const cb = load('src/lib/builder/class-build.ts');
const { encodeClassBuild, decodeClassBuild, encodeClassBuildSet, decodeClassBuildSet } = load('src/lib/builder/class-build-codec.ts');
const { resolveClassBuild } = load('src/lib/builder/class-build-server.ts');

const skills = loadSkills();
const treePages = loadTreeGrid();

/** A random complete, valid build for `classCode`: random pages on any tab, filled. */
function randomBuild(classCode, n) {
  const rng = createRNG(n * 7919 + 17);
  const spec = cb.emptyBuild(classCode, (n * 2654435761) >>> 0);
  spec.pages = [0, 1, 2].map(() => ({ ...cb.PAGE_REFS[rng.randInt(0, 23)] }));
  // Some builds pre-place a few foreign skills by hand before the fill.
  const pages = cb.resolvePages(spec, treePages);
  const keys = cb.orderedSlotKeys(pages);
  const pool = rng.shuffle(skills.filter(s => !cb.blockReason(s.skill, classCode) && !cb.partnersFor(s)));
  for (let i = 0; i < n % 6; i++) spec.slots[keys[rng.randInt(0, keys.length - 1)]] = pool[i].skill;
  // A duplicate from overwriting the same key twice is impossible (same key), but
  // the same skill on two keys is: dedupe by rebuilding from the fill.
  const seen = new Set();
  for (const [k, v] of Object.entries(spec.slots)) { if (seen.has(v)) delete spec.slots[k]; seen.add(v); }
  return cb.fillEmptySlots(spec, skills, treePages, n);
}

test('fill produces complete builds with no errors on every class', () => {
  for (const def of CLASS_DEFS) {
    for (let n = 0; n < 25; n++) {
      const spec = randomBuild(def.code, n);
      const issues = cb.checkClassBuild(spec, skills, treePages);
      assert.deepEqual(issues.filter(i => i.severity === 'error'), [], `${def.code} #${n}`);
      assert.equal(Object.keys(spec.slots).length, 30);
    }
  }
});

test('share codec round-trips, including empty slots', () => {
  for (const def of CLASS_DEFS) {
    const full = randomBuild(def.code, 3);
    const code = encodeClassBuild(full, skills, treePages);
    assert.ok(code.length <= 52, code);
    assert.deepEqual(decodeClassBuild(code, skills, treePages), full);
    const draft = { ...full, slots: Object.fromEntries(Object.entries(full.slots).slice(0, 7)) };
    assert.deepEqual(decodeClassBuild(encodeClassBuild(draft, skills, treePages), skills, treePages), draft);
  }
});

test('validator rejects locked, excluded, duplicate and missing skills', () => {
  const spec = randomBuild('sor', 1);
  const keys = cb.orderedSlotKeys(cb.resolvePages(spec, treePages));
  const codes = s => cb.checkClassBuild(s, skills, treePages).filter(i => i.severity === 'error').map(i => i.code);
  assert.ok(codes({ ...spec, slots: { ...spec.slots, [keys[0]]: 'Whirlwind' } }).includes('blocked_skill'));
  assert.ok(codes({ ...spec, classCode: 'nec', slots: { ...spec.slots, [keys[0]]: 'Charge' } }).includes('blocked_skill'));
  assert.ok(codes({ ...spec, slots: { ...spec.slots, [keys[0]]: spec.slots[keys[1]] } }).includes('duplicate_skill'));
  const missing = { ...spec.slots }; delete missing[keys[5]];
  assert.ok(codes({ ...spec, slots: missing }).includes('empty_slot'));
  assert.deepEqual(cb.checkClassBuild({ ...spec, slots: missing }, skills, treePages, { requireComplete: false })
    .filter(i => i.severity === 'error'), []);
});

test('placement keeps the fixed class verbatim and leaves a perfect bijection', () => {
  for (const def of CLASS_DEFS) {
    for (let n = 0; n < 40; n++) {
      const spec = randomBuild(def.code, n);
      const build = resolveClassBuild(encodeClassBuild(spec, skills, treePages));
      const placed = runPlacement(createRNG(build.seed), { treePages, skills, build });
      const tag = `${def.code} #${n}`;

      // Fixed class: exactly the hand-built placements, untouched.
      const mine = placed.placements.filter(p => p.targetClass === def.code);
      assert.equal(mine.length, 30, tag);
      for (const fp of build.classes[0].fixed.placements) {
        const p = mine.find(m => m.tabIndex === fp.tabIndex && m.row === fp.row && m.col === fp.col);
        assert.equal(p?.skill.skill, fp.skill.skill, tag);
        assert.equal(p.skill.charclass, fp.skill.charclass, `${tag} ${fp.skill.skill} was substituted`);
      }
      // iconCel / skillIndex follow the canonical slot rank on every class.
      for (const c of CLASS_DEFS) {
        const order = orderedFilledSlots(placed.treeAssignments.get(c.code));
        for (const p of placed.placements.filter(q => q.targetClass === c.code)) {
          const rank = order.findIndex(s => s.tabIndex === p.tabIndex && s.row === p.row && s.col === p.col);
          assert.equal(p.skillIndex, rank, `${tag} ${c.code} ${p.skill.skill}`);
          assert.equal(p.iconCel, rank * 2, tag);
        }
        assert.equal(placed.placements.filter(q => q.targetClass === c.code).length, 30, `${tag} ${c.code}`);
      }
      // Every skill row is used exactly once (substitutes keep the dropped row's name).
      const names = placed.placements.map(p => p.skill.skill).sort();
      assert.deepEqual(names, skills.map(s => s.skill).sort(), tag);

      // Nothing locked ends up working on a foreign class, and no exclusions are broken.
      const subs = new Set(placed.substitutes.map(s => s.droppedSkill.skill));
      for (const p of placed.placements) {
        const pinned = HARDCODED_CLASS_SKILLS[p.skill.skill];
        if (pinned && pinned !== p.targetClass) assert.ok(subs.has(p.skill.skill), `${tag} ${p.skill.skill} live on ${p.targetClass}`);
        if (!subs.has(p.skill.skill)) assert.ok(!SKILL_CLASS_EXCLUSIONS[p.targetClass]?.has(p.skill.skill), tag);
      }
      // Substitutes never land on the fixed class.
      assert.ok(placed.substitutes.every(s => s.targetClass !== def.code), tag);
      // The fixed class's own unplaced locked skills were dropped, not placed live elsewhere.
      for (const [name, cls] of Object.entries(HARDCODED_CLASS_SKILLS)) {
        if (cls === def.code && !Object.values(spec.slots).includes(name)) assert.ok(subs.has(name), `${tag} ${name}`);
      }
      // Co-placement keys off the fixed class sit with a peer (or are substitutes).
      const classOf = new Map(placed.placements.map(p => [p.skill.skill, p.targetClass]));
      for (const [name, peers] of Object.entries(COPACEMENT_REQUIRES)) {
        const cls = classOf.get(name);
        if (cls === def.code || subs.has(name)) continue;
        assert.ok(peers.some(peer => classOf.get(peer) === cls), `${tag} ${name} on ${cls} without ${peers}`);
      }
    }
  }
});

test('placement is deterministic for a build', () => {
  const build = resolveClassBuild(encodeClassBuild(randomBuild('ass', 4), skills, treePages));
  const run = () => runPlacement(createRNG(build.seed), { treePages, skills, build }).placements
    .map(p => `${p.targetClass}:${p.tabIndex}:${p.row}:${p.col}:${p.skill.skill}:${p.skill.charclass}`);
  assert.deepEqual(run(), run());
});

// ---------------------------------------------------------------------------
// Several hand-built classes in one mod (stridssill: "build all 8 classes at the same time")

/** n hand-built classes, each filled around the ones before it; one shared seed. */
function randomSet(codes, n) {
  const seed = (n * 2654435761 + 99) >>> 0;
  const specs = [];
  for (const code of codes) {
    const spec = cb.emptyBuild(code, seed);
    specs.push(cb.fillEmptySlots(spec, skills, treePages, n * 31 + specs.length, cb.skillsInBuilds(specs)));
  }
  return specs;
}

test('a single-class code encodes exactly as before', () => {
  for (const def of CLASS_DEFS) {
    const spec = randomBuild(def.code, 3);
    const code = encodeClassBuild(spec, skills, treePages);
    assert.equal(encodeClassBuildSet([spec], skills, treePages), code);
    assert.equal(resolveClassBuild(code).code, code);
    assert.equal(decodeClassBuildSet(code, skills, treePages).length, 1);
  }
});

test('multi-class codes round-trip in class order, up to all eight', () => {
  const codes = CLASS_DEFS.map(d => d.code);
  for (const count of [2, 3, 5, 8]) {
    for (let n = 0; n < 6; n++) {
      const picked = createRNG(n + count * 100).shuffle(codes).slice(0, count);
      const specs = randomSet(picked, n);
      assert.deepEqual(cb.checkClassBuildSet(specs, skills, treePages).filter(i => i.severity === 'error'), [], `${count} #${n}`);
      const code = encodeClassBuildSet(specs, skills, treePages);
      assert.ok(code.length <= 362, `${count} classes: ${code.length} chars`);
      const back = decodeClassBuildSet(code, skills, treePages);
      assert.deepEqual(back.map(s => s.classCode), codes.filter(c => picked.includes(c)), 'class order');
      for (const s of back) assert.deepEqual(s.slots, specs.find(x => x.classCode === s.classCode).slots);
      // Any input order gives the same canonical code.
      assert.equal(encodeClassBuildSet([...specs].reverse(), skills, treePages), code);
    }
  }
});

test('the set validator rejects a skill on two classes and a class built twice', () => {
  const [a, b] = randomSet(['sor', 'nec'], 1);
  const key = Object.keys(b.slots)[0];
  const clash = { ...b, slots: { ...b.slots, [key]: Object.values(a.slots).find(s => !cb.blockReason(s, 'nec')) } };
  assert.ok(cb.checkClassBuildSet([a, clash], skills, treePages).some(i => i.code === 'skill_on_two_classes'));
  assert.ok(cb.checkClassBuildSet([a, a], skills, treePages).some(i => i.code === 'duplicate_class'));
  assert.ok(cb.checkClassBuildSet([a, { ...b, seed: b.seed + 1 }], skills, treePages).some(i => i.code === 'seed_mismatch'));
});

test('placement keeps every hand-built class verbatim and uses every skill once', () => {
  const codes = CLASS_DEFS.map(d => d.code);
  for (const count of [2, 4, 7, 8]) {
    for (let n = 0; n < 8; n++) {
      const picked = createRNG(n * 13 + count).shuffle(codes).slice(0, count);
      const build = resolveClassBuild(encodeClassBuildSet(randomSet(picked, n), skills, treePages));
      const placed = runPlacement(createRNG(build.seed), { treePages, skills, build });
      const tag = `${count} [${picked}] #${n}`;
      for (const { fixed } of build.classes) {
        const mine = placed.placements.filter(p => p.targetClass === fixed.classCode);
        assert.equal(mine.length, 30, tag);
        for (const fp of fixed.placements) {
          const p = mine.find(m => m.tabIndex === fp.tabIndex && m.row === fp.row && m.col === fp.col);
          assert.equal(p?.skill.skill, fp.skill.skill, `${tag} ${fixed.classCode}`);
          assert.equal(p.skill.charclass, fp.skill.charclass, `${tag} ${fp.skill.skill} was substituted`);
        }
      }
      for (const c of CLASS_DEFS) assert.equal(placed.placements.filter(q => q.targetClass === c.code).length, 30, `${tag} ${c.code}`);
      assert.deepEqual(placed.placements.map(p => p.skill.skill).sort(), skills.map(s => s.skill).sort(), tag);
      assert.ok(placed.substitutes.every(s => !picked.includes(s.targetClass)), `${tag} substitute on a hand-built class`);
      if (count === CLASS_DEFS.length) assert.equal(placed.substitutes.length, 0, `${tag} full build needs no substitutes`);
    }
  }
});

// ---------------------------------------------------------------------------
// Partial shuffle (jondanger: "a 50% or 25% random version")

test('a partial shuffle keeps each class on its own pages with the rest of its skills in place', () => {
  const vanillaSlot = new Map();
  for (const def of CLASS_DEFS) for (let t = 1; t <= 3; t++) {
    for (const g of treePages.get(`${def.code}-${t}`).slots) if (g.skill) vanillaSlot.set(g.skill, `${def.code}:${t - 1}:${g.row}:${g.col}`);
  }
  for (const share of [0.5, 0.25]) {
    for (let seed = 1; seed <= 40; seed++) {
      const placed = runPlacement(createRNG(seed), { treePages, skills, shuffleShare: share });
      const tag = `${share} seed ${seed}`;
      assert.deepEqual(placed.placements.map(p => p.skill.skill).sort(), skills.map(s => s.skill).sort(), tag);
      for (const def of CLASS_DEFS) {
        assert.deepEqual(placed.treeAssignments.get(def.code).map(p => `${p.classCode}-${p.treeIndex}`),
          [1, 2, 3].map(t => `${def.code}-${t}`), `${tag} ${def.code} pages`);
        const mine = placed.placements.filter(p => p.targetClass === def.code);
        assert.equal(mine.length, 30, `${tag} ${def.code}`);
        assert.equal(new Set(mine.map(p => p.skillIndex)).size, 30, `${tag} ${def.code} slots`);
        const order = orderedFilledSlots(placed.treeAssignments.get(def.code));
        for (const p of mine) {
          const rank = order.findIndex(s => s.tabIndex === p.tabIndex && s.row === p.row && s.col === p.col);
          assert.equal(p.skillIndex, rank, tag);
          assert.equal(p.iconCel, rank * 2, tag);
        }
        // About (1 - share) of each class stays exactly where it is in vanilla.
        const home = mine.filter(p => p.skill.charclass === def.code
          && vanillaSlot.get(p.skill.skill) === `${def.code}:${p.tabIndex}:${p.row}:${p.col}`).length;
        assert.ok(home >= Math.floor(30 * (1 - share)) - 8, `${tag} ${def.code}: only ${home} stayed`);
        assert.ok(home <= Math.ceil(30 * (1 - share)) + 8, `${tag} ${def.code}: ${home} stayed`);
      }
      const again = runPlacement(createRNG(seed), { treePages, skills, shuffleShare: share });
      assert.deepEqual(again.placements.map(p => `${p.targetClass}:${p.skillIndex}:${p.skill.skill}`),
        placed.placements.map(p => `${p.targetClass}:${p.skillIndex}:${p.skill.skill}`), `${tag} deterministic`);
    }
  }
});

test('a partial shuffle cannot be combined with a build', () => {
  const build = resolveClassBuild(encodeClassBuild(randomBuild('sor', 2), skills, treePages));
  assert.throws(() => runPlacement(createRNG(1), { treePages, skills, build, shuffleShare: 0.5 }), /partial shuffle/i);
});
