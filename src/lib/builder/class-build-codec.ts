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

// ---------------------------------------------------------------------------
// Several hand-built classes in one mod

const SET_VERSION = 3;
/** class index, two page bytes, 30 skill bytes: bytes 2..34 of a single-class code. */
const CLASS_BLOCK = 3 + SLOTS_PER_CLASS;

/**
 * A set of hand-built classes sharing one seed. One class encodes exactly as
 * encodeClassBuild, so every existing link (and its cached zip and mod folder) is
 * unchanged. Two or more use version 3:
 *
 *   0       format version (3)
 *   1       skill table checksum
 *   2       class count N (2..8)
 *   3..     N blocks of 33 bytes, in CLASS_DEFS order, each laid out as bytes
 *           2..34 of a single-class code (class index, pages, 30 skills)
 *   last 4  seed, big-endian u32
 *
 * Eight classes are 271 bytes, 362 base64url characters.
 */
export function encodeClassBuildSet(
  specs: readonly ClassBuild[],
  skills: BuildSkill[],
  treePages: Map<string, TreePage>,
): string {
  if (specs.length === 0) throw new CodecError('A build needs at least one class.');
  const ordered = [...specs].sort((a, b) =>
    CLASS_DEFS.findIndex(d => d.code === a.classCode) - CLASS_DEFS.findIndex(d => d.code === b.classCode));
  const seed = ordered[0].seed >>> 0;
  if (ordered.length === 1) return encodeClassBuild(ordered[0], skills, treePages);
  if (ordered.length > CLASS_DEFS.length) throw new CodecError('Too many classes.');
  const bytes = new Uint8Array(3 + CLASS_BLOCK * ordered.length + 4);
  bytes[0] = SET_VERSION;
  bytes[1] = tableChecksum(skills);
  bytes[2] = ordered.length;
  ordered.forEach((spec, i) => {
    // Reuse the single-class layout so the two formats can never drift apart.
    const single = fromBase64Url(encodeClassBuild({ ...spec, seed }, skills, treePages));
    bytes.set(single.subarray(2, 2 + CLASS_BLOCK), 3 + CLASS_BLOCK * i);
  });
  bytes.set([seed >>> 24, (seed >>> 16) & 0xff, (seed >>> 8) & 0xff, seed & 0xff], bytes.length - 4);
  return toBase64Url(bytes);
}

/** Inverse of encodeClassBuildSet: a single-class code decodes to a one-element list. */
export function decodeClassBuildSet(
  code: string,
  skills: BuildSkill[],
  treePages: Map<string, TreePage>,
): ClassBuild[] {
  const bytes = fromBase64Url(code);
  if (bytes[0] !== SET_VERSION) return [decodeClassBuild(code, skills, treePages)];
  const n = bytes[2];
  if (!(n >= 2 && n <= CLASS_DEFS.length) || bytes.length !== 3 + CLASS_BLOCK * n + 4) {
    throw new CodecError('That build link is not valid.');
  }
  if (bytes[1] !== tableChecksum(skills)) {
    throw new CodecError('That build link was made for a different version of the skill data.');
  }
  const seedBytes = bytes.subarray(bytes.length - 4);
  return Array.from({ length: n }, (_, i) => {
    const single = new Uint8Array(5 + SLOTS_PER_CLASS + 4);
    single[0] = VERSION;
    single[1] = bytes[1];
    single.set(bytes.subarray(3 + CLASS_BLOCK * i, 3 + CLASS_BLOCK * (i + 1)), 2);
    single.set(seedBytes, 5 + SLOTS_PER_CLASS);
    return decodeClassBuild(toBase64Url(single), skills, treePages);
  });
}
