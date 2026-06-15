/**
 * COFs whose animdata.d2 records get synced (framesPerDirection + frame-event
 * array) before the animdata.d2 is shipped in every generated mod.
 *
 * Audit evidence (scripts/audit-cof.mjs against a vanilla CASC extraction,
 * D2R data as of 2026-06): of all 8 player tokens × every attack/cast mode,
 * exactly these 14 Warlock records disagree with their COFs — every other
 * token/mode is in sync. The WK COF frame counts match the real DCC art
 * (verified against the DCC headers; WK art is the Necromancer set), so the
 * COF side is ground truth and the animdata side is stale:
 *
 *   record    COF (truth)        vanilla animdata.d2
 *   WKA1HTH   F=15, f8=attack    fpd=16, f9=attack
 *   WKA11HS   F=19, f9=attack    fpd=16, f9=attack
 *   WKA1STF   F=20, f11=attack   fpd=17, f10=attack
 *   ... (same pattern for all A1/A2 weapon classes)
 *
 * The engine times skill hits/missiles off this frame data, so the mismatch
 * is why melee skills on Warlock could swing without landing a hit.
 *
 * To refresh after a D2R patch: re-extract (scripts/extract-casc.ps1), re-run
 * scripts/audit-cof.mjs, then scripts/copy-anim-assets.mjs.
 */
export const ANIMDATA_SYNC_COFS: readonly string[] = [
  // Warlock A1 (normal attack) — all weapon classes the token has
  'wka1hth.cof',
  'wka11hs.cof',
  'wka11ht.cof',
  'wka12hs.cof',
  'wka12ht.cof',
  'wka1bow.cof',
  'wka1stf.cof',
  'wka1xbw.cof',
  // Warlock A2 (secondary attack)
  'wka2hth.cof',
  'wka21hs.cof',
  'wka21ht.cof',
  'wka22hs.cof',
  'wka22ht.cof',
  'wka2stf.cof',
];

/**
 * Trigger-frame injections: vanilla animations that are MISSING their attack
 * event entirely. The event byte is poked into the COF, the matching
 * animdata.d2 record is synced to the patched COF, and the patched COF ships
 * in the zip (unlike ANIMDATA_SYNC_COFS, where the game's own COFs are
 * already correct, here they aren't — shipping only one side would create
 * the COF↔animdata desync failure mode).
 *
 * Amazon S1: three of her S1 weapon-class variants carry no attack event
 * (audit: AMS11HS / AMS11HT / AMS1XBW, F=9, zero events), while every other
 * AMS1 variant fires attack on frame 2 (e.g. AMS12HS f2=1). All are 9-frame
 * anims, so the donor frame index transfers directly. Without this, an
 * S1-timed attack (Smite shuffled onto the Amazon) swings without hitting
 * while a 1h sword, 1h throwing weapon, or crossbow is equipped.
 */
export const COF_TRIGGER_INJECTIONS: ReadonlyArray<{
  cof: string;
  frame: number;
  event: number;
  zipPath: string;
}> = [
  { cof: 'ams11hs.cof', frame: 2, event: 1, zipPath: 'data/global/chars/am/cof/ams11hs.cof' },
  { cof: 'ams11ht.cof', frame: 2, event: 1, zipPath: 'data/global/chars/am/cof/ams11ht.cof' },
  { cof: 'ams1xbw.cof', frame: 2, event: 1, zipPath: 'data/global/chars/am/cof/ams1xbw.cof' },
];
