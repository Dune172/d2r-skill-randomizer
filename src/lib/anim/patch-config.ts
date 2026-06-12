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
