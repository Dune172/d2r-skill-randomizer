import fs from 'fs';
import path from 'path';
import { parseCof } from './cof-parser';
import { parseAnimData, findAnimRecord, syncAnimDataRecord } from './animdata-parser';
import { ANIMDATA_SYNC_COFS } from './patch-config';

const ANIM_DIR = path.join(process.cwd(), 'data', 'anim');

// Patched animdata.d2 is identical for every seed — build once, cache forever.
let _patchedAnimData: Buffer | null = null;

/**
 * Load the vanilla animdata.d2 from data/anim/ and repair the records listed
 * in ANIMDATA_SYNC_COFS so each matches its COF (data/anim/cof/) exactly:
 * framesPerDirection and the per-frame event array.
 *
 * Why: the vanilla Warlock A1/A2 animdata records carry frame counts that
 * don't match the WK COFs/DCC art (Blizzard copied Necromancer animations for
 * the token but left stale frame data in animdata.d2). The engine fires a
 * skill's hit/missile on the trigger frame from this data, so the mismatch
 * makes melee skills on Warlock swing without ever landing. Shipping the
 * synced animdata.d2 in every generated mod fixes that, which is what lets
 * the randomizer emit A1 animations for Warlock (see CLASS_SUPPORTED_ANIMS).
 */
export function loadPatchedAnimData(): Buffer {
  if (_patchedAnimData) return _patchedAnimData;

  const animData = Buffer.from(fs.readFileSync(path.join(ANIM_DIR, 'animdata.d2')));
  const records = parseAnimData(animData);

  for (const cofFile of ANIMDATA_SYNC_COFS) {
    const cofName = cofFile.replace(/\.cof$/i, '').toUpperCase();
    const cofBuf = fs.readFileSync(path.join(ANIM_DIR, 'cof', cofFile));
    const cof = parseCof(cofBuf, cofName);
    const record = findAnimRecord(records, cofName);
    if (!record) {
      throw new Error(`animdata.d2 has no record for ${cofName}`);
    }
    syncAnimDataRecord(animData, record, cof.framesPerDirection, cof.events);
  }

  _patchedAnimData = animData;
  return _patchedAnimData;
}
