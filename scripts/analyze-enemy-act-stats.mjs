// Read-only analysis of original expansion game tables; no generated mod data.
// Usage: node scripts/analyze-enemy-act-stats.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hashes = {};
function table(name) {
  const bytes = fs.readFileSync(path.join(root, 'data/txt', name));
  hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex');
  const [head, ...lines] = bytes.toString('utf8').trimEnd().split(/\r?\n/);
  const headers = head.replace(/^\uFEFF/, '').split('\t');
  return lines.filter(Boolean).map(line => {
    const cells = line.split('\t');
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
}
const monsters = new Map(table('monstats.txt').map(m => [m.Id, m]));
const levels = table('levels.txt');
const scaling = new Map(table('monlvl.txt').map(m => [+m.Level, m]));
const n = v => Number(v) || 0;
const median = values => {
  const a = values.filter(Number.isFinite).sort((a, b) => a - b), mid = Math.floor(a.length / 2);
  return a.length ? (a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2) : null;
};
const round = x => x === null ? null : Math.round(x * 100) / 100;
const ordinary = m => m && m.enabled === '1' && m.isSpawn === '1' && m.killable === '1' &&
  !['Align', 'npc', 'interact', 'inTown', 'boss', 'primeevil', 'noRatio'].some(k => n(m[k]));
const campaign = a => n(a.Id) >= 2 && n(a.Id) <= 132 && n(a.Id) !== 39 && n(a.Act) >= 0 && n(a.Act) <= 4;
const findings = {};
for (const [difficulty, suffix] of [['Normal', ''], ['Nightmare', '(N)'], ['Hell', '(H)']]) {
  const acts = [];
  for (let act = 1; act <= 5; act++) {
    const occurrences = [];
    const unique = new Map();
    for (const area of levels.filter(a => campaign(a) && n(a.Act) + 1 === act && n(a[`MonDen${suffix}`]) > 0)) {
      const slots = Object.keys(area).filter(k => (suffix ? /^nmon\d+$/ : /^mon\d+$/).test(k));
      for (const id of new Set(slots.map(k => area[k]).filter(Boolean))) {
        const m = monsters.get(id);
        if (!ordinary(m)) continue;
        const level = suffix ? n(area[`MonLvlEx${suffix}`]) : n(m.Level);
        const l = scaling.get(level);
        if (!l) throw Error(`Missing level ${level} for ${id}`);
        const hpMin = suffix ? `MinHP${suffix}` : 'minHP', hpMax = suffix ? `MaxHP${suffix}` : 'maxHP';
        const hpCoefficient = (n(m[hpMin]) + n(m[hpMax])) / 2;
        if (hpCoefficient <= 0) continue;
        // A1 physical only: zero/absent physical attacks are missing samples,
        // not zero-DPS monsters. Spells, A2, elements and missile bonuses excluded.
        const hasA1 = n(m[`A1MaxD${suffix}`]) > 0 && !m.SkillDamage;
        const attackCoefficient = hasA1 ? (n(m[`A1MinD${suffix}`]) + n(m[`A1MaxD${suffix}`])) / 2 : null;
        const record = { id, family: m.BaseId, area: area.Name, level, hpCoefficient, attackCoefficient,
          hp: hpCoefficient * n(l[`L-HP${suffix}`]) / 100,
          attack: hasA1 ? attackCoefficient * n(l[`L-DM${suffix}`]) / 100 : null,
          defense: n(m[`AC${suffix}`]) * n(l[`L-AC${suffix}`]) / 100,
          attackRating: hasA1 ? n(m[`A1TH${suffix}`]) * n(l[`L-TH${suffix}`]) / 100 : null,
          xp: n(m[`Exp${suffix}`]) * n(l[`L-XP${suffix}`]) / 100,
        };
        occurrences.push(record);
        unique.set(`${id}:${level}`, record);
      }
    }
    const rows = [...unique.values()];
    const summary = { act, samples: rows.length, attackSamples: rows.filter(r => r.attack !== null).length,
      levelRange: [Math.min(...rows.map(r => r.level)), Math.max(...rows.map(r => r.level))] };
    for (const key of ['level', 'hpCoefficient', 'attackCoefficient', 'hp', 'attack', 'defense', 'attackRating', 'xp']) {
      summary[key] = median(rows.map(r => r[key]).filter(v => v !== null));
    }
    summary.occurrenceWeightedHP = median(occurrences.map(r => r.hp));
    summary.occurrenceWeightedAttack = median(occurrences.map(r => r.attack).filter(v => v !== null));
    if (acts.length) {
      const previous = acts.at(-1);
      summary.hpIncreasePercent = 100 * (summary.hp / previous.hp - 1);
      summary.attackIncreasePercent = 100 * (summary.attack / previous.attack - 1);
    }
    acts.push(summary);
  }
  findings[difficulty] = acts;
}
const normal = findings.Normal;
const matrices = {};
for (const key of ['hp', 'attack']) matrices[key] = normal.map(src => normal.map(dst => round(100 * (dst[key] / src[key] - 1))));
const levelCurve = [1, 5, 10, 15, 20, 25, 30, 35, 40, 43].map(level => {
  const row = scaling.get(level);
  return { level, hp: n(row['L-HP']), damage: n(row['L-DM']), defense: n(row['L-AC']), attackRating: n(row['L-TH']), xp: n(row['L-XP']) };
});
const families = {};
for (const area of levels.filter(a => campaign(a) && n(a.MonDen) > 0)) for (const [key, id] of Object.entries(area)) {
  if (!/^mon\d+$/.test(key)) continue;
  const m = monsters.get(id);
  if (!ordinary(m)) continue;
  const group = families[m.BaseId] ??= new Map();
  group.set(`${n(area.Act) + 1}:${id}`, { act: n(area.Act) + 1, id, level: n(m.Level), hpCoefficient: (n(m.minHP) + n(m.maxHP)) / 2, attackCoefficient: (n(m.A1MinD) + n(m.A1MaxD)) / 2 });
}
const crossActFamilies = Object.fromEntries(Object.entries(families).filter(([, rows]) => new Set([...rows.values()].map(r => r.act)).size > 1).map(([family, rows]) => [family, [...rows.values()]]));
console.log(JSON.stringify({ hashes, methodology: 'Unique (act, monster ID, effective level), equal weight; ordinary ratio-scaled random campaign spawns; expansion monlvl L- columns; midrange stats before integer rounding; no player count, champions/uniques, skills, elemental damage, missile bonuses, resistance or attack frequency. Alternate per-area occurrence weighting supplied as sensitivity check.', findings, normalPercentChangeMatrices: matrices, levelCurve, crossActFamilies }, (_, v) => typeof v === 'number' ? round(v) : v, 2));
