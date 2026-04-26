/**
 * verify-ctc-castable.mjs
 *
 * End-to-end check that the post-shuffle item-skills remap (in
 * src/lib/randomizer/item-skills-writer.ts) never lands on a passive
 * (passive=1) or aura (aura=1) skill.
 *
 * The remap only runs on:
 *   - uniqueitems rows whose `code` is class-restricted (paladin shields,
 *     druid pelts, etc. per ITEM_CLASS_MAP)
 *   - magicprefix/magicsuffix rows with a non-empty `class` column
 * and only for `skill` / `charged` prop or mod codes. Other props / item
 * codes are left at their vanilla values (which legitimately include
 * "+N to Thorns"-style passive/aura granters on class-agnostic items).
 *
 * For each of several seeds:
 *   1. POST /api/randomize and GET /api/download
 *   2. Parse the generated skills.txt, uniqueitems.txt, magicprefix.txt, magicsuffix.txt
 *   3. For every CTC slot in those item files, resolve the target skill row
 *      and assert passive=0 AND aura=0
 *
 * Run with: node scripts/verify-ctc-castable.mjs
 *   (dev server must already be running: `npm run dev`)
 */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const SEEDS = [1, 1337, Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) * 31337];

// Vanilla reqlevel ground truth — output skills.txt rewrites reqlevel based
// on placement row, so we have to look up the original from the unmodified
// data file. Map: skill name → vanilla reqlevel.
function loadVanillaReqlevels() {
  const file = fs.readFileSync(path.join(process.cwd(), 'data', 'txt', 'skills.txt'), 'utf-8');
  const lines = file.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
  const headers = lines[0].split('\t');
  const nameCol = 0;
  const reqCol = headers.indexOf('reqlevel');
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const r = lines[i].split('\t');
    const name = r[nameCol];
    const req = parseInt(r[reqCol], 10) || 1;
    if (name) map.set(name, req);
  }
  return map;
}
const VANILLA_REQLEVEL = loadVanillaReqlevels();

function parseTxt(content) {
  const lines = content.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = lines[0].split('\t');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    rows.push(lines[i].split('\t'));
  }
  return { headers, rows };
}

async function generateZip(seed) {
  const r = await fetch(`${BASE}/api/randomize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed }),
  });
  if (!r.ok) throw new Error(`randomize ${seed}: ${r.status} ${await r.text()}`);
  const dl = await fetch(`${BASE}/api/download?seed=${seed}`);
  if (!dl.ok) throw new Error(`download ${seed}: ${dl.status} ${await dl.text()}`);
  return new AdmZip(Buffer.from(await dl.arrayBuffer()));
}

function readTxt(zip, suffix) {
  const e = zip.getEntries().find(x => x.entryName.endsWith(suffix));
  return e ? parseTxt(e.getData().toString('utf-8')) : null;
}

// Procs should only roll low-tier skills. Vanilla reqlevels: 1/6/12/18/24/30.
// PROC_POOL_MAX_REQLEVEL in item-skills-writer.ts is 18 — match it here.
const MAX_PROC_REQLEVEL = 18;

function buildSkillIndex(skills) {
  // Numeric skill references in item txt files (par* / mod*param) point at
  // the ROW INDEX in skills.txt, not the *Id column. Build byRowIndex from
  // row position; build byName for string refs in custom uniques.
  const nameCol = 0;
  const passCol = skills.headers.indexOf('passive');
  const auraCol = skills.headers.indexOf('aura');
  const idCol = skills.headers.indexOf('*Id');
  const reqLvlCol = skills.headers.indexOf('reqlevel');
  if (passCol < 0 || auraCol < 0) {
    throw new Error(`skills.txt missing column: passive=${passCol} aura=${auraCol}`);
  }
  const byRowIndex = new Map();
  const byName = new Map();
  for (let i = 0; i < skills.rows.length; i++) {
    const r = skills.rows[i];
    const name = r[nameCol];
    const idVal = idCol >= 0 ? parseInt(r[idCol], 10) : NaN;
    const passive = r[passCol] === '1';
    const aura = r[auraCol] === '1';
    const reqlevel = reqLvlCol >= 0 ? (parseInt(r[reqLvlCol], 10) || 1) : 1;
    const entry = { rowIndex: i, id: idVal, name, passive, aura, reqlevel };
    byRowIndex.set(i, entry);
    if (name) byName.set(name, entry);
  }
  return { byRowIndex, byName };
}

function checkSlot(target, kind, label, par, ctx, failures) {
  if (par === undefined || par === '' || par == null) return;
  const s = par.trim();
  if (!s) return;
  const numId = parseInt(s, 10);
  let entry = !isNaN(numId) ? ctx.byRowIndex.get(numId) : null;
  if (!entry) entry = ctx.byName.get(s);
  if (!entry) {
    // Unresolvable reference — flag separately, not a passive/aura bug
    failures.push({ kind, label, par: s, reason: 'unresolved-skill-reference' });
    return;
  }
  // Granters can legitimately point at passives in vanilla — don't flag.
  // (`target` here is the prop/mod code: 'skill', 'oskill', 'gethit-skill', …)
  if (GRANTER_CODES.has(target)) return;
  if (entry.passive || entry.aura) {
    failures.push({
      kind, label, par: s,
      reason: entry.passive ? 'passive' : 'aura',
      skillId: entry.id, skillName: entry.name, rowIndex: entry.rowIndex,
    });
    return;
  }
  // Reqlevel ceiling — proc shouldn't fire vanilla high-tier skills.
  const vanillaReq = VANILLA_REQLEVEL.get(entry.name) ?? 1;
  if (vanillaReq > MAX_PROC_REQLEVEL) {
    failures.push({
      kind, label, par: s,
      reason: `vanilla-reqlevel-${vanillaReq}`,
      skillId: entry.id, skillName: entry.name, rowIndex: entry.rowIndex,
    });
  }
}

// Mirrors ITEM_CLASS_MAP in src/lib/randomizer/item-skills-writer.ts — only
// these item codes get their `skill`/`charged` props remapped post-shuffle.
const CLASS_RESTRICTED_ITEM_CODES = new Set([
  // Druid pelts
  'dr1','dr2','dr3','dr4','dr5','dr6','dr7','dr8','dr9','dra','drb','drc','drd','dre','drf',
  // Necromancer shrunken heads
  'ne1','ne2','ne3','ne4','ne5','ne6','ne7','ne8','ne9','nea','neb','neg','ned','nee','nef',
  // Barbarian primal helms
  'ba1','ba2','ba3','ba4','ba5','ba6','ba7','ba8','ba9','baa','bab','bac','bad','bae','baf',
  // Paladin auric shields
  'pa1','pa2','pa3','pa4','pa5','pa6','pa7','pa8','pa9','paa','pab','pac','pad','pae','paf',
  // Sorceress orbs
  'ob1','ob2','ob3','ob4','ob5','ob6','ob7','ob8','ob9','oba','obb','obc','obd','obe','obf',
  // Amazon weapons
  'am1','am2','am3','am4','am5','am6','am7','am8','am9','ama','amb','amc','amd','ame','amf',
  // Assassin claws
  'ktr','wrb','axf','ces','clw','btl','skr','9ar','9wb','9xf','9cs','9lw','9tw','9qr',
  '7ar','7wb','7xf','7cs','7lw','7tw','7qr',
  // Warlock grimoires (custom)
  'wa6','wac','wae','waf',
]);

// Proc codes — the destination MUST be castable (passive/aura silently fails).
const PROC_CODES = new Set([
  'charged',
  'hit-skill', 'hit-skill-noc',
  'att-skill', 'att-skill-noc',
  'gethit-skill', 'gethit-skill-noc',
  'kill-skill', 'kill-skill-noc',
  'death-skill', 'death-skill-noc',
  'levelup-skill', 'levelup-skill-noc',
]);

// Granter codes — vanilla legitimately points these at passives ("+N to
// Warmth"). We don't flag them as bugs, but we do remap their row index for
// identity preservation.
const GRANTER_CODES = new Set(['skill', 'oskill']);

const SKILL_REF_CODES = new Set([...PROC_CODES, ...GRANTER_CODES]);

function checkUniqueItems(unique, ctx, failures) {
  if (!unique) return 0;
  const codeCol = unique.headers.indexOf('code');
  let checked = 0;
  for (const r of unique.rows) {
    const itemCode = (r[codeCol] ?? '').trim();
    if (!itemCode) continue;
    for (let slot = 1; slot <= 12; slot++) {
      const propCol = unique.headers.indexOf(`prop${slot}`);
      const parCol = unique.headers.indexOf(`par${slot}`);
      if (propCol < 0 || parCol < 0) continue;
      const prop = r[propCol];
      if (!SKILL_REF_CODES.has(prop)) continue;
      checked++;
      checkSlot(prop, 'unique', `${r[0]}/${itemCode}/prop${slot}=${prop}`, r[parCol], ctx, failures);
    }
  }
  return checked;
}

function checkAffixes(affix, label, ctx, failures) {
  if (!affix) return 0;
  let checked = 0;
  for (const r of affix.rows) {
    for (let slot = 1; slot <= 3; slot++) {
      const codeCol = affix.headers.indexOf(`mod${slot}code`);
      const paramCol = affix.headers.indexOf(`mod${slot}param`);
      if (codeCol < 0 || paramCol < 0) continue;
      const code = r[codeCol];
      if (!SKILL_REF_CODES.has(code)) continue;
      checked++;
      checkSlot(code, label, `${r[0]}/mod${slot}code=${code}`, r[paramCol], ctx, failures);
    }
  }
  return checked;
}

(async function main() {
  let totalFail = 0;
  for (const seed of SEEDS) {
    console.log(`\n=== seed ${seed} ===`);
    const zip = await generateZip(seed);
    const skills = readTxt(zip, 'skills.txt');
    const unique = readTxt(zip, 'uniqueitems.txt');
    const prefix = readTxt(zip, 'magicprefix.txt');
    const suffix = readTxt(zip, 'magicsuffix.txt');
    if (!skills) { console.log('skills.txt missing — skip'); continue; }
    const ctx = buildSkillIndex(skills);

    const failures = [];
    const u = checkUniqueItems(unique, ctx, failures);
    const p = checkAffixes(prefix, 'magicprefix', ctx, failures);
    const s = checkAffixes(suffix, 'magicsuffix', ctx, failures);
    console.log(`  CTC slots checked: unique=${u} prefix=${p} suffix=${s}`);

    const passAura = failures.filter(f => f.reason === 'passive' || f.reason === 'aura');
    const tooStrong = failures.filter(f => typeof f.reason === 'string' && f.reason.startsWith('vanilla-reqlevel-'));
    const unresolved = failures.filter(f => f.reason === 'unresolved-skill-reference');
    if (passAura.length === 0 && tooStrong.length === 0) {
      console.log(`  PASS — no passive/aura targets, no high-tier procs`);
    } else {
      if (passAura.length > 0) {
        console.log(`  FAIL — ${passAura.length} passive/aura target(s):`);
        for (const f of passAura.slice(0, 10)) {
          console.log(`    [${f.kind}] ${f.label} par=${f.par} → ${f.reason} (id=${f.skillId} name=${f.skillName})`);
        }
        if (passAura.length > 10) console.log(`    … +${passAura.length - 10} more`);
      }
      if (tooStrong.length > 0) {
        console.log(`  FAIL — ${tooStrong.length} high-tier proc target(s) (vanilla reqlevel > ${MAX_PROC_REQLEVEL}):`);
        for (const f of tooStrong.slice(0, 10)) {
          console.log(`    [${f.kind}] ${f.label} par=${f.par} → ${f.skillName} (${f.reason})`);
        }
        if (tooStrong.length > 10) console.log(`    … +${tooStrong.length - 10} more`);
      }
      totalFail += passAura.length + tooStrong.length;
    }
    if (unresolved.length > 0) {
      console.log(`  NOTE — ${unresolved.length} unresolved skill reference(s) (not necessarily a bug; could be a vanilla string ref to an out-of-class skill):`);
      for (const f of unresolved.slice(0, 5)) {
        console.log(`    [${f.kind}] ${f.label} par=${f.par}`);
      }
    }
  }
  console.log(`\n=== TOTAL: ${totalFail === 0 ? 'PASS' : `FAIL (${totalFail})`} ===`);
  process.exit(totalFail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
