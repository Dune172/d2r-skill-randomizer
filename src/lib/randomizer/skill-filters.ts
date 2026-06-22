import { SkillEntry } from './types';

// Passive (passive=1) and aura (aurastate non-empty) skills have no
// ItemEffect/srvdofunc execution path, so they silently fail when used as
// CTC ("chance to cast") or charged-item targets. Filter them out at
// write time. Note: skills.txt has both `passive` (the flag) and
// `passiveitype` (a weapon-gate column that's null for many passives like
// Critical Strike / Evade / Warmth) — the flag is the source of truth.
export function isCastableTarget(skill: SkillEntry): boolean {
  return skill.passive !== 1 && !skill.aurastate;
}

// Skills that are castable (so they pass isCastableTarget) but make poor or
// nonsensical INJECTED procs — they fire reactively on hit/strike, where a
// creature summon just clutters, and charge-up finishers / positional skills do
// nothing useful. Excluded only from injected-proc pools (Heavy Burden armor
// procs, Titan's Grip weapon procs); the `+N to skill` granter path still allows
// them (a "+3 to Raise Skeleton" item is legitimate).
//
// NOTE: we deliberately do NOT key off the skills.txt `summon` column — it's
// unreliable here. It false-positives on direct skills (Fire Claws, Bone Wall,
// Weapon Block, Whirlwind, Leap all carry a `summon` value as an artifact) and
// false-negatives on Revive (no fixed summon). Offensive turrets (Hydra and the
// Assassin sentries/traps) are intentionally KEPT — they auto-fire and work well.
const PROC_EXCLUDED_SKILLS: ReadonlySet<string> = new Set([
  // Explicitly excluded: charge-ups, finishers, walls, and channel skills that
  // are useless as a reactive proc.
  'Bone Prison', 'Bone Wall', 'Charge', 'Dragon Tail', 'Dragon Talon', 'Claws of Thunder', 'Blood Boil',
  // Creature / pet / spirit summons — every class, by exact skills.txt name.
  'Raise Skeleton', 'Raise Skeletal Mage', 'Revive',
  'Clay Golem', 'BloodGolem', 'IronGolem', 'FireGolem',
  'Raven', 'Plague Poppy', 'Vines', 'Oak Sage', 'Heart of Wolverine', 'Spirit of Barbs',
  'Summon Spirit Wolf', 'Summon Fenris', 'Summon Grizzly',
  'Valkyrie', 'Dopplezon', 'Shadow Warrior', 'Shadow Master',
  'Summon Goatman', 'Summon Defiler', 'Summon Tainted', 'Cycle of Life',
]);

// Eligible as an injected chance-to-cast proc target. Beyond isCastableTarget:
//   1. Not weapon-gated. Skills with `itypea1` set (bow/javelin/spear/throw/claw/
//      dagger/shield/melee attack-replacements) require that specific weapon class
//      — and often ammo — equipped to execute. Fired from armor (or a mismatched
//      weapon) they silently fizzle, so they're poor procs. `itypea1` is a reliable
//      signal (unlike the `summon` column); pure casts (Nova, Fire Ball, traps,
//      golems) have no itypea1.
//   2. Not in the curated PROC_EXCLUDED_SKILLS list (summons + a few cast skills
//      that are still nonsensical reactively, e.g. Bone Prison / Blood Boil).
export function isProcTarget(skill: SkillEntry): boolean {
  return isCastableTarget(skill)
    && !skill.itypea1
    && !PROC_EXCLUDED_SKILLS.has(skill.skill);
}
