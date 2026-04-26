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
