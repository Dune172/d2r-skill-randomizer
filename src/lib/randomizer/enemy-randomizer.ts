import { createRNG, seedFromString } from './seed';
import { balanceEnemy } from './enemy-balance';

export interface EnemyTable { headers: string[]; rows: string[][] }
type Monster = Record<string, string>;
type Role = 'melee' | 'ranged';

// Reviewed basic attack families. Skills, spawners, special death handlers and
// independent missile damage are additionally rejected below, per variant.
// Monster level scales combat stats; enemy-balance handles non-level outliers.
const FAMILIES: Record<string, { role: Role }> = {
  zombie1:       { role: 'melee' },
  brute2:        { role: 'melee' },
  corruptrogue1: { role: 'melee' },
  baboon1:       { role: 'melee' },
  goatman1:      { role: 'melee' },
  pantherwoman1: { role: 'melee' },
  cr_lancer1:    { role: 'melee' },
  doomknight1:   { role: 'melee' },
  snowyeti1:     { role: 'melee' },
  cr_archer1:    { role: 'ranged' },
  sk_archer1:    { role: 'ranged' },
  slinger1:      { role: 'ranged' },
  quillrat1:     { role: 'ranged' },
  fallen1:       { role: 'melee' },
  mummy1:        { role: 'melee' },
  minion1:       { role: 'melee' },
  zealot1:       { role: 'melee' },
};
// Replacing an ordinary monster does not require supporting its original spells:
// the replacement uses its own reviewed AI. Keep this separate from donor safety.
const TARGET_FAMILIES = new Set([...Object.keys(FAMILIES).filter(f => f !== 'zealot1'),
  'skeleton1', 'sandraider1', 'clawviper1', 'sandleaper1', 'swarm1', 'mummy1',
  'arach1', 'thornhulk1', 'vampire1', 'blunderbore1', 'bighead1',
  'skmage_pois1', 'skmage_cold1', 'skmage_fire1', 'skmage_ltng1',
  'megademon1', 'doomknight2', 'reanimatedhorde1', 'frozenhorror1',
  'bloodlord1', 'deathmauler1', 'minion1',
  'scarab1', 'regurgitator1', 'fetish1', 'fetishblow1', 'bonefetish1',
]);
// These properties disappear with the original target's AI/shape. They are
// never waived for donors. Linked resurrection groups are protected per area.
const REPLACEABLE_RESURRECTION = new Set(['skeleton1', 'fetish1', 'fetishblow1']);
const DIFFICULTIES = ['', '(N)', '(H)'] as const;
const MISSILE_COLS = ['MissA1', 'MissA2', 'MissS1', 'MissS2', 'MissS3', 'MissS4', 'MissC', 'MissSQ'];
// Fixed encounters and special areas are deliberately outside the first roster.
const PROTECTED_AREAS = new Set([0, 1, 37, 39, 40, 73, 75, 102, 103, 108, 109, 110, 120, 131, 132]);
const MAX_CLONES = 512;
const DAMAGE_ELEMENTS = new Set(['fire', 'ltng', 'cold', 'mag', 'rand', 'pois']);
const n = (v: string | undefined) => Number(v) || 0;
const records = (t: EnemyTable): Monster[] => t.rows.map(r =>
  Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? ''])));

export interface EnemyReplacement {
  area: string;
  areaId: number;
  act: number;
  slot: string;
  original: string;
  replacement: string;
  clone: string;
  normalLevel: number;
  nightmareLevel: number;
  hellLevel: number;
}

export interface EnemyManifest {
  version: number;
  seed: number;
  status: string;
  replacements: EnemyReplacement[];
  skipped: { areaId: number; slot: string; original: string; reason: string }[];
  // Coefficients, not final in-game stats. Recorded before and after modifiers.
  profiles: { sourceAct: number; id: string; source: string; baseline: string; act: number; balanced: Monster; final?: Monster }[];
  projectiles: { id: string; source: string; policy: string }[];
}

export interface EnemyShuffleResult {
  destinationActs: Map<string, number>;
  graphics: Record<string, string>;
  manifest: EnemyManifest;
  missiles: EnemyTable;
}

function basicMissile(m: Monster | undefined): m is Monster {
  if (!m || n(m.SrcDamage) !== 128 || m.Skill || n(m.pSrvDoFunc) !== 1) return false;
  if (n(m.pSrvHitFunc) || n(m.pSrvDmgFunc) || m.EType || m.DmgCalc1 || m.SrvCalc1 ||
      m.DmgSymPerCalc || m.EDmgSymPerCalc || m.ExplosionMissile || n(m.SrcMissDmg) ||
      n(m.Half2HSrc) || n(m.HitShift) !== 8 || n(m.Explosion) || n(m.AlwaysExplode)) return false;
  return !Object.entries(m).some(([key, value]) => value && /^(SubMissile|HitSubMissile|CltSubMissile|CltHitSubMissile)/.test(key));
}

function simpleMissile(m: Monster | undefined): boolean {
  if (!basicMissile(m)) return false;
  return !Object.entries(m).some(([key, value]) => value && (
    (/^(MinDamage|MaxDamage|MinLevDam\d|MaxLevDam\d|EMin|EMax|MinELev\d|MaxELev\d)$/.test(key) && n(value) !== 0)
  ));
}

function editableQuill(m: Monster | undefined): m is Monster {
  return basicMissile(m) && /^spike[1-6]$/.test(m.Missile);
}

function selfParty(m: Monster): boolean {
  return m.minion1 === m.Id && !m.minion2;
}

function commonEligibility(m: Monster, ex: Map<string, Monster>, asTarget = false): string | null {
  if (m.enabled !== '1' || m.isSpawn !== '1' || m.killable !== '1' || n(m.Align) !== 0 ||
      n(m.npc) || n(m.interact) || n(m.inTown) || n(m.boss) || n(m.primeevil) || n(m.noRatio)) return 'protected-monster';
  const replaceableProperty = asTarget && m.BaseId === 'blunderbore1' && m.MonProp === 'blunderbore';
  const replaceableDeath = asTarget && m.BaseId === 'bonefetish1';
  if (((m.minion1 || m.minion2) && !selfParty(m)) || m.spawn || n(m.placespawn) || (m.MonProp && !replaceableProperty) || m.SkillDamage ||
      (n(m.deathDmg) && !replaceableDeath) || n(m.SplEndDeath) || n(m.SplGetModeChart) || n(m.SplEndGeneric) || n(m.SplClientEnd)) return 'linked-or-special-behavior';
  const shape = ex.get(m.MonStatsEx);
  if (!shape || n(shape.spawnCol) || n(m.flying) ||
      n(shape.SizeX) < 1 || n(shape.SizeY) < 1) return 'unsupported-placement-or-graphics';
  if (n(shape.ResurrectMode) || (shape.ResurrectSkill && !(asTarget && REPLACEABLE_RESURRECTION.has(m.BaseId) && shape.ResurrectSkill === 'SkeletonRaise')) || n(shape.SpawnUniqueMod)) return 'special-extended-behavior';
  // Spell-only targets need an explicit spell damage budget before replacement.
  if (asTarget && DIFFICULTIES.some(diff => n(m[`A1MaxD${diff}`]) <= 0)) return 'missing-local-attack-budget';
  return null;
}

function donorEligibility(m: Monster, ex: Map<string, Monster>, missiles: Map<string, Monster>, graphics: Record<string, string>): string | null {
  if (!FAMILIES[m.BaseId]) return 'family-outside-donor-roster';
  const common = commonEligibility(m, ex);
  if (common) return common;
  if (!graphics[m.Id]) return 'missing-graphics';
  if (Array.from({ length: 8 }, (_, i) => m[`Skill${i + 1}`]).some(Boolean)) return 'skill-driven-attacks';
  if (MISSILE_COLS.some(c => m[c] && !simpleMissile(missiles.get(m[c])) &&
      !(m.BaseId === 'quillrat1' && c === 'MissA2' && editableQuill(missiles.get(m[c]))))) return 'independent-missile-damage';
  if ([1, 2, 3].some(i => m[`El${i}Type`] && !DAMAGE_ELEMENTS.has(m[`El${i}Type`]) && m[`El${i}Type`] !== 'stun')) return 'unsupported-element';
  return null;
}

function targetRole(m: Monster): Role { return n(m.rangedtype) ? 'ranged' : 'melee'; }

/** Appends isolated monsters and rewrites ordinary spawns; reference missiles stay untouched. */
export function randomizeEnemies(
  seed: number,
  monstats: EnemyTable,
  levels: EnemyTable,
  monstats2: EnemyTable,
  missilesTable: EnemyTable,
  graphics: Record<string, string>,
  summonIds: ReadonlySet<string> = new Set(),
): EnemyShuffleResult {
  for (const [table, required] of [[monstats, ['Id', '*hcIdx', 'BaseId', 'MonStatsEx', 'Level', 'A1MaxD']],
    [levels, ['Id', 'Act', 'MonDen', 'mon1', 'nmon1', 'umon1']],
    [missilesTable, ['Missile', '*ID', 'SrcDamage', 'HitShift', 'MinDamage', 'MaxDamage',
      'MinLevDam1', 'MaxLevDam1', 'EType', 'EMin', 'EMax']]] as const) {
    for (const name of required) if (!table.headers.includes(name)) throw new Error(`Enemy shuffle: missing ${name}`);
  }
  const monsters = records(monstats);
  const byId = new Map(monsters.map(m => [m.Id, m]));
  const extended = new Map(records(monstats2).map(m => [m.Id, m]));
  const missiles = new Map(records(missilesTable).map(m => [m.Missile, m]));
  const areas = records(levels);
  const slots = levels.headers.filter(h => /^(mon|nmon|umon)\d+$/.test(h));
  // Derive origins from Normal campaign spawns. Nightmare/Hell guest monsters
  // would otherwise make many Act 1 families appear native to Act 5.
  const origins = new Map<string, Set<number>>();
  for (const area of areas) {
    if (n(area.Id) > 132 || n(area.Id) === 39) continue;
    for (const slot of slots.filter(s => /^mon\d+$/.test(s))) {
      if (!area[slot]) continue;
      if (!origins.has(area[slot])) origins.set(area[slot], new Set());
      origins.get(area[slot])!.add(n(area.Act) + 1);
    }
  }
  const reasons = new Map(monsters.map(m => [m.Id, summonIds.has(m.Id) ? 'player-summon' :
    !TARGET_FAMILIES.has(m.BaseId) ? 'family-outside-target-roster' : commonEligibility(m, extended, true)]));
  const donors = monsters.filter(m => !summonIds.has(m.Id) && !donorEligibility(m, extended, missiles, graphics) && origins.has(m.Id));
  if (!donors.length) throw new Error('Enemy shuffle: no compatible monster families in the game data');
  const familyOrigins = new Map<string, Set<number>>();
  for (const m of monsters) for (const act of origins.get(m.Id) ?? []) {
    if (!familyOrigins.has(m.BaseId)) familyOrigins.set(m.BaseId, new Set());
    familyOrigins.get(m.BaseId)!.add(act);
  }
  const rng = createRNG(seedFromString(`enemies:v3:${seed | 0}`));
  const familyOrder = rng.shuffle(Object.keys(FAMILIES).sort());
  const choices = new Map<string, string>();
  const reuse = new Map<string, number>();
  const clones = new Map<string, string>();
  const destinationActs = new Map<string, number>();
  const resultGraphics = { ...graphics };
  const manifest: EnemyManifest = { version: 5, seed, status: 'experimental; requires in-game validation', replacements: [], skipped: [], profiles: [], projectiles: [] };
  const outputMissiles: EnemyTable = { headers: [...missilesTable.headers], rows: missilesTable.rows.map(r => [...r]) };
  const projectileClones = new Map<string, string>();
  const isolateProjectile = (original: string): string => {
    const existing = projectileClones.get(original);
    if (existing) return existing;
    const source = missiles.get(original);
    if (!editableQuill(source)) throw new Error(`Enemy shuffle: unsupported projectile ${original}`);
    const id = `d2rr_${original}`;
    if (missiles.has(id)) throw new Error(`Enemy shuffle: missile ID collision ${id}`);
    const missile: Monster = { ...source, Missile: id, '*ID': String(outputMissiles.rows.filter(r => r[0] !== 'Expansion').length) };
    // Keep the original visual/collision behavior, but all damage now comes
    // from the monster's balanced attack, including NM/Hell and user modifiers.
    for (const key of outputMissiles.headers) {
      if (/^(MinDamage|MaxDamage|MinLevDam\d|MaxLevDam\d|EMin|EMax|MinELev\d|MaxELev\d|ELen|ELevLen\d)$/.test(key)) missile[key] = '0';
    }
    missile.SrcDamage = '128';
    missile.HitShift = '8';
    missile.VelLev = '0';
    outputMissiles.rows.push(outputMissiles.headers.map(h => missile[h] ?? ''));
    projectileClones.set(original, id);
    manifest.projectiles.push({ id, source: original, policy: '100% of locally balanced monster attack; no independent base or per-level damage' });
    return id;
  };
  // *hcIdx is a comment; the engine uses row position (excluding Expansion marker).
  let nextIndex = monsters.filter(m => m.Id !== 'Expansion').length;
  for (let areaIndex = 0; areaIndex < areas.length; areaIndex++) {
    const area = areas[areaIndex];
    const areaId = n(area.Id);
    const act = n(area.Act) + 1;
    const protectedArea = PROTECTED_AREAS.has(areaId) || areaId > 132 || act < 1 || act > 5 || n(area.MonDen) === 0;
    const linkedMembers = new Set<string>();
    const linkedFamilies = new Set<string>();
    for (const s of slots) {
      const leader = byId.get(area[s]);
      if (!leader) continue;
      for (const field of ['minion1', 'minion2', 'spawn']) {
        if (leader[field] && leader[field] !== leader.Id) {
          linkedMembers.add(leader[field]);
          const member = byId.get(leader[field]);
          if (member) linkedFamilies.add(member.BaseId);
        }
      }
      // Greater mummies can raise more undead than their minion1 names; fetish
      // shamans likewise raise both melee and blowgun variants.
      if (leader.AI === 'GreaterMummy') for (const family of ['skeleton1', 'sk_archer1', 'skmage_pois1', 'skmage_cold1', 'skmage_fire1', 'skmage_ltng1', 'mummy1']) linkedFamilies.add(family);
      if (leader.AI === 'FetishShaman') for (const family of ['fetish1', 'fetishblow1']) linkedFamilies.add(family);
    }
    for (const slot of slots) {
      const original = area[slot];
      if (!original) continue;
      const target = byId.get(original);
      const reason = protectedArea ? 'protected-or-scripted-area' : !target ? 'unknown-monster' :
        (linkedMembers.has(original) || linkedFamilies.has(target.BaseId)) ? 'linked-area-group' : reasons.get(original);
      const skip = (why: string) => manifest.skipped.push({ areaId, slot, original, reason: why });
      if (reason || !target) { skip(reason ?? 'unknown-monster'); continue; }
      const shape = extended.get(target.MonStatsEx)!;
      const compatible = donors.filter(d => d.BaseId !== target.BaseId && !origins.get(d.Id)!.has(act) &&
        !linkedFamilies.has(d.BaseId) &&
        FAMILIES[d.BaseId].role === targetRole(target) &&
        n(extended.get(d.MonStatsEx)!.SizeX) <= n(shape.SizeX) && n(extended.get(d.MonStatsEx)!.SizeY) <= n(shape.SizeY));
      // Prefer an entirely foreign family; fall back to a foreign variant of a
      // different family when the small first roster cannot provide one.
      const foreign = compatible.filter(d => !familyOrigins.get(d.BaseId)?.has(act));
      const pool = foreign.length ? foreign : compatible;
      if (!pool.length) { skip('no-compatible-cross-act-family'); continue; }
      const choiceKey = `${act}:${target.BaseId}:${shape.SizeX}:${shape.SizeY}`;
      let chosenFamily = choices.get(choiceKey);
      if (!chosenFamily || !pool.some(d => d.BaseId === chosenFamily)) {
        const families = familyOrder.filter(f => pool.some(d => d.BaseId === f));
        families.sort((a, b) => (reuse.get(`${act}:${a}`) ?? 0) - (reuse.get(`${act}:${b}`) ?? 0));
        chosenFamily = families[0];
        choices.set(choiceKey, chosenFamily);
        reuse.set(`${act}:${chosenFamily}`, (reuse.get(`${act}:${chosenFamily}`) ?? 0) + 1);
      }
      // Keep palette progression while every variant receives local stats.
      const variants = pool.filter(d => d.BaseId === chosenFamily).sort((a, b) =>
        Math.abs(n(a.Level) - n(target.Level)) - Math.abs(n(b.Level) - n(target.Level)) || (a.Id < b.Id ? -1 : a.Id > b.Id ? 1 : 0));
      const source = variants[0];
      const cloneKey = `${act}:${original}:${source.Id}`;
      let cloneId = clones.get(cloneKey);
      if (!cloneId) {
        if (clones.size >= MAX_CLONES) { skip('clone-limit'); continue; }
        cloneId = `d2rr_e${manifest.profiles.length}`;
        if (byId.has(cloneId) || resultGraphics[cloneId]) throw new Error(`Enemy shuffle: ID collision ${cloneId}`);
        const sourceAct = Math.min(...origins.get(source.Id)!);
        const clone = balanceEnemy(source, target);
        clone.Id = cloneId;
        if (selfParty(source)) {
          clone.minion1 = cloneId;
          clone.SetBoss = source.SetBoss;
          clone.BossXfer = source.BossXfer;
        }
        if (source.BaseId === 'quillrat1' && source.MissA2) clone.MissA2 = isolateProjectile(source.MissA2);
        clone['*hcIdx'] = String(nextIndex++);
        // Keep the original base type/extended graphics pointer and detach the
        // clone from variant upgrade chains so its local stats cannot be bypassed.
        clone.NextInClass = '';
        monstats.rows.push(monstats.headers.map(h => clone[h] ?? ''));
        clones.set(cloneKey, cloneId);
        destinationActs.set(cloneId, act);
        resultGraphics[cloneId] = graphics[source.Id];
        manifest.profiles.push({ sourceAct, id: cloneId, source: source.Id, baseline: original, act, balanced: { ...clone } });
      }
      levels.rows[areaIndex][levels.headers.indexOf(slot)] = cloneId;
      manifest.replacements.push({ area: area['*StringName'] || area.Name, areaId, act, slot,
        original, replacement: source.Id, clone: cloneId, normalLevel: n(target.Level),
        nightmareLevel: n(area['MonLvlEx(N)']), hellLevel: n(area['MonLvlEx(H)']) });
    }
  }
  if (!manifest.replacements.length) throw new Error('Enemy shuffle: no compatible spawn slots were replaced');
  return { destinationActs, graphics: resultGraphics, manifest, missiles: outputMissiles };
}

/** Capture modifiers after players/XP/weekly processing for a truthful export. */
export function finalizeEnemyManifest(manifest: EnemyManifest, monstats: EnemyTable): void {
  const rows = new Map(records(monstats).map(m => [m.Id, m]));
  for (const profile of manifest.profiles) profile.final = rows.get(profile.id);
}
