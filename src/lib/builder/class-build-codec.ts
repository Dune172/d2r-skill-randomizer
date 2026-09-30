import type { TreePage } from '../randomizer/types';
import { CLASS_DEFS } from '../randomizer/config';
import {
  type BuildSkill,
  type ClassBuild,
  PAGE_REFS,
  SLOTS_PER_CLASS,
  orderedSlotKeys,
  pageKey,
  resolvePages,
} from './class-build';

export class CodecError extends Error {}

const VERSION = 2;
const EMPTY = 0xff;

/**
 * Share-link layout (39 bytes → 52 base64url chars):
 *
 *   0       format version
 *   1       skill table checksum
 *   2       class index (CLASS_DEFS order)
 *   3..4    three page indexes into PAGE_REFS, 5 bits each (tab 0 in the high bits)
 *   5..34   30 skill indexes into codecTable(), in orderedSlotKeys order; 0xFF = empty
 *   35..38  seed, big-endian u32
 *
 * The code is also the build's identity: /api/randomize keys its cache on it
 * and derives the mod folder name from it, and a build can only have one
 * encoding, so two players with the same build share one cached zip.
 */

/**
 * Skills sorted by the game's own *Id rather than loadSkills() order — that is
 * Object.entries(skills.json) insertion order, which a reformat of the file
 * would shift. *Id is stable game data, so links survive it.
 */
export function codecTable<T extends BuildSkill>(skills: T[]): T[] {
  return [...skills].sort((a, b) => a.id - b.id);
}

/** One byte identifying the table, so a changed skill set fails loudly on decode. */
export function tableChecksum(skills: BuildSkill[]): number {
  let h = skills.length & 0xff;
  for (const s of codecTable(skills)) {
    h = (h * 31 + s.id) & 0xff;
    for (let i = 0; i < s.skill.length; i++) h = (h * 31 + s.skill.charCodeAt(i)) & 0xff;
  }
  return h;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new CodecError('Build code contains invalid characters.');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export function encodeClassBuild(
  spec: ClassBuild,
  skills: BuildSkill[],
  treePages: Map<string, TreePage>,
): string {
  const pages = resolvePages(spec, treePages);
  if (!pages) throw new CodecError('Build references unknown tree pages.');
  const classIdx = CLASS_DEFS.findIndex(d => d.code === spec.classCode);
  if (classIdx === -1) throw new CodecError('Unknown class.');
  const pageIdx = spec.pages.map(ref => PAGE_REFS.findIndex(p => pageKey(p) === pageKey(ref)));
  const indexOf = new Map(codecTable(skills).map((s, i) => [s.skill, i]));
  const keys = orderedSlotKeys(pages);
  if (keys.length !== SLOTS_PER_CLASS) throw new CodecError('Tree pages must have 30 slots.');

  const bytes = new Uint8Array(5 + SLOTS_PER_CLASS + 4);
  bytes[0] = VERSION;
  bytes[1] = tableChecksum(skills);
  bytes[2] = classIdx;
  const packed = (pageIdx[0] << 10) | (pageIdx[1] << 5) | pageIdx[2];
  bytes[3] = packed >> 8;
  bytes[4] = packed & 0xff;
  keys.forEach((key, i) => {
    const name = spec.slots[key];
    const idx = name ? indexOf.get(name) : undefined;
    if (name && idx === undefined) throw new CodecError(`Unknown skill "${name}".`);
    bytes[5 + i] = idx ?? EMPTY;
  });
  const seed = spec.seed >>> 0;
  bytes.set([seed >>> 24, (seed >>> 16) & 0xff, (seed >>> 8) & 0xff, seed & 0xff], 5 + SLOTS_PER_CLASS);
  return toBase64Url(bytes);
}

export function decodeClassBuild(
  code: string,
  skills: BuildSkill[],
  treePages: Map<string, TreePage>,
): ClassBuild {
  const bytes = fromBase64Url(code);
  if (bytes.length !== 5 + SLOTS_PER_CLASS + 4 || bytes[0] !== VERSION) {
    throw new CodecError('That build link is not valid.');
  }
  if (bytes[1] !== tableChecksum(skills)) {
    throw new CodecError('That build link was made for a different version of the skill data.');
  }
  const classDef = CLASS_DEFS[bytes[2]];
  if (!classDef) throw new CodecError('That build link names an unknown class.');

  const packed = (bytes[3] << 8) | bytes[4];
  const refs = [(packed >> 10) & 31, (packed >> 5) & 31, packed & 31].map(i => PAGE_REFS[i]);
  if (refs.some(r => !r)) throw new CodecError('That build link names an unknown tree page.');

  const spec: ClassBuild = {
    v: 2,
    classCode: classDef.code,
    pages: refs.map(r => ({ ...r })) as ClassBuild['pages'],
    slots: {},
    seed: ((bytes[35] << 24) | (bytes[36] << 16) | (bytes[37] << 8) | bytes[38]) >>> 0,
  };
  const pages = resolvePages(spec, treePages)!;
  const table = codecTable(skills);
  orderedSlotKeys(pages).forEach((key, i) => {
    const b = bytes[5 + i];
    if (b === EMPTY) return;
    const skill = table[b];
    if (!skill) throw new CodecError('That build link names an unknown skill.');
    spec.slots[key] = skill.skill;
  });
  return spec;
}
