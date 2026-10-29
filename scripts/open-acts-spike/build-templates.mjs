// Open Acts Phase 1: build the two template mods the starter characters are made in
// (docs/open-acts/PLAN.md, "Phase 1").
//   d2rr_tpl       vanilla data, every class's StartSkill cleared
//   d2rr_tpl_cube  the same, plus the Horadric Cube in the starting gear
// starter-save.ts later writes each seed's StartSkill into these characters, so the
// templates must start with no skill. Each mod saves to its own folder (savepath = mod
// name), so the 16 characters land in Saved Games\Diablo II Resurrected\mods\<mod>\.
// Usage: node scripts/open-acts-spike/build-templates.mjs [modsDir]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const modsDir = process.argv[2] ?? 'C:/Program Files (x86)/Diablo II Resurrected/mods';

const raw = fs.readFileSync(path.join(repo, 'data', 'txt', 'charstats.txt'), 'latin1');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(eol);
const trailing = lines[lines.length - 1] === '' ? lines.pop() : null;
const headers = lines[0].split('\t');
const col = h => {
  const i = headers.indexOf(h);
  if (i < 0) throw new Error(`charstats.txt: no column ${h}`);
  return i;
};
const CLASSES = ['Amazon', 'Sorceress', 'Necromancer', 'Paladin', 'Barbarian', 'Druid', 'Assassin', 'Warlock'];
const dataVersion = fs.readFileSync(path.join(repo, 'data', 'dataversionbuild.txt'), 'utf-8').trim();

// Same rule as applyHoradricCube in src/lib/randomizer/starting-items.ts: the Cube goes
// in the first empty item slot. Only class rows are touched here; the "Expansion"
// divider row has no character.
function addCube(row) {
  for (let n = 1; n <= 10; n++) {
    const v = row[col(`item${n}`)];
    if (v === '0' || v === '') {
      row[col(`item${n}`)] = 'box';
      row[col(`item${n}loc`)] = '';
      row[col(`item${n}count`)] = '1';
      row[col(`item${n}quality`)] = '2';
      return;
    }
  }
  throw new Error(`${row[col('class')]}: no free item slot for the Cube`);
}

for (const [mod, cube] of [['d2rr_tpl', false], ['d2rr_tpl_cube', true]]) {
  const rows = lines.slice(1).map(l => l.split('\t'));
  const seen = [];
  for (const row of rows) {
    if (!CLASSES.includes(row[col('class')])) continue;
    row[col('StartSkill')] = '';
    if (cube) addCube(row);
    seen.push(row[col('class')]);
  }
  if (seen.length !== CLASSES.length) throw new Error(`expected ${CLASSES.length} classes, found ${seen.join(', ')}`);

  const mpq = path.join(modsDir, mod, `${mod}.mpq`);
  fs.rmSync(path.join(modsDir, mod), { recursive: true, force: true });
  fs.mkdirSync(path.join(mpq, 'data', 'global', 'excel'), { recursive: true });
  fs.writeFileSync(path.join(mpq, 'modinfo.json'), JSON.stringify({ name: mod, savepath: mod }));
  fs.writeFileSync(path.join(mpq, 'data', 'global', 'DataVersionBuild.txt'), dataVersion);
  const body = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join(eol) + (trailing !== null ? eol : '');
  fs.writeFileSync(path.join(mpq, 'data', 'global', 'excel', 'charstats.txt'), body, 'latin1');
  console.log(`wrote ${path.join(modsDir, mod)} (${cube ? 'with Cube, ' : ''}StartSkill cleared for ${seen.length} classes)`);
}
console.log('Launch each with: D2R.exe -mod <mod> -txt (or launch-d2r.ps1 -Mod <mod> -SavePath <mod>)');
