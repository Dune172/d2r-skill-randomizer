import fs from 'fs';
import path from 'path';
import { parseCof, patchCofEvent } from './cof-parser';
import { parseAnimData, findAnimRecord, syncAnimDataRecord, AnimDataRecord } from './animdata-parser';
import { ANIMDATA_SYNC_COFS, COF_TRIGGER_INJECTIONS } from './patch-config';

const ANIM_DIR = path.join(process.cwd(), 'data', 'anim');

export interface PatchedAnimAssets {
  /** animdata.d2 with all patch-config repairs applied */
  animData: Buffer;
  /** zip-relative path (under data/) → patched COF bytes, for trigger injections */
  cofs: Map<string, Buffer>;
}

// Patched output is identical for every seed — build once, cache forever.
let _cache: PatchedAnimAssets | null = null;

/**
 * Load the vanilla animdata.d2 from data/anim/ and apply both repair types
 * from patch-config:
 *
 * 1. ANIMDATA_SYNC_COFS — records whose vanilla animdata.d2 frame data
 *    doesn't match the (correct) COFs/DCC art. The 14 Warlock A1/A2 records:
 *    Blizzard copied Necromancer animations for the WK token but left stale
 *    frame data in animdata.d2, so melee hits on Warlock misfired. Only the
 *    animdata side is shipped — the game's own COFs are already right.
 *
 * 2. COF_TRIGGER_INJECTIONS — animations missing their attack event in BOTH
 *    files (Amazon S1 on three weapon classes). The event byte is injected
 *    into the COF, the animdata record is synced to it, and the patched COF
 *    ships in the zip alongside animdata.d2 so the two stay consistent.
 */
export function loadPatchedAnimAssets(): PatchedAnimAssets {
  if (_cache) return _cache;

  const animData = Buffer.from(fs.readFileSync(path.join(ANIM_DIR, 'animdata.d2')));
  const records = parseAnimData(animData);

  const syncRecordToCof = (cofName: string, cofBuf: Buffer): void => {
    const cof = parseCof(cofBuf, cofName);
    const record: AnimDataRecord | undefined = findAnimRecord(records, cofName);
    if (!record) {
      throw new Error(`animdata.d2 has no record for ${cofName}`);
    }
    syncAnimDataRecord(animData, record, cof.framesPerDirection, cof.events);
  };

  for (const cofFile of ANIMDATA_SYNC_COFS) {
    const cofName = cofFile.replace(/\.cof$/i, '').toUpperCase();
    syncRecordToCof(cofName, fs.readFileSync(path.join(ANIM_DIR, 'cof', cofFile)));
  }

  const cofs = new Map<string, Buffer>();
  for (const inj of COF_TRIGGER_INJECTIONS) {
    const cofName = inj.cof.replace(/\.cof$/i, '').toUpperCase();
    const raw = fs.readFileSync(path.join(ANIM_DIR, 'cof', inj.cof));
    const patched = patchCofEvent(raw, inj.frame, inj.event, cofName);
    syncRecordToCof(cofName, patched);
    cofs.set(inj.zipPath, patched);
  }

  _cache = { animData, cofs };
  return _cache;
}
