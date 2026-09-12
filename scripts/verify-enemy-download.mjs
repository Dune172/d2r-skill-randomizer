// Run against an isolated local server: node scripts/verify-enemy-download.mjs
// Generates three ZIPs; do not point this at production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

const base = 'http://127.0.0.1:3107';
const seed = 424242;
async function generate(enemyShuffle, boost = false) {
  const options = { seed, raceMode: false, enemyShuffle, ...(boost ? {
    playersEnabled: true, playersCount: 4, playersActs: [1, 3],
    xpMultiplier: 3, xpActs: [1, 3], xpDifficulties: [1],
  } : {}) };
  const response = await fetch(`${base}/api/randomize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options),
  });
  assert.equal(response.status, 200, await response.text());
  const params = new URLSearchParams({ seed: String(seed), raceMode: '0' });
  if (enemyShuffle) params.set('enemyShuffle', '1');
  if (boost) {
    params.set('players', '4'); params.set('acts', '1,3');
    params.set('xpMultiplier', '3'); params.set('xpActs', '1,3'); params.set('xpDifficulties', '1');
  }
  const download = await fetch(`${base}/api/download?${params}`);
  assert.equal(download.status, 200, 'download matches generation options');
  const bytes = Buffer.from(await download.arrayBuffer());
  return { zip: new AdmZip(bytes), bytes };
}
function entry(zip, suffix) {
  const found = zip.getEntries().find(e => e.entryName.endsWith(suffix));
  assert.ok(found, `missing ${suffix}`);
  return found.getData().toString('utf8');
}
function table(text) {
  const [header, ...lines] = text.trimEnd().split(/\r?\n/);
  const headers = header.replace(/^\uFEFF/, '').split('\t');
  return lines.map(line => Object.fromEntries(headers.map((h, i) => [h, line.split('\t')[i] ?? ''])));
}
const off = await generate(false);
const on = await generate(true);
for (const e of off.zip.getEntries().filter(e => !e.isDirectory && !e.entryName.endsWith('/monstats.txt'))) {
  assert.deepEqual(on.zip.getEntry(e.entryName)?.getData(), e.getData(), `unrelated file ${e.entryName}`);
}
const originalMon = table(entry(off.zip, '/monstats.txt'));
const shuffledMon = table(entry(on.zip, '/monstats.txt'));
assert.deepEqual(shuffledMon.slice(0, originalMon.length), originalMon);
const manifest = JSON.parse(entry(on.zip, '/enemy-shuffle.json'));
assert.equal(manifest.version, 5);
assert.equal(manifest.replacements.filter(p => p.areaId === 2 && /^mon\d+$/.test(p.slot)).length, 3);
const missiles = table(entry(on.zip, '/missiles.txt'));
const originalMissiles = table(fs.readFileSync('data/txt/missiles.txt', 'utf8'));
assert.deepEqual(missiles.slice(0, originalMissiles.length), originalMissiles);
assert.ok(manifest.projectiles.length);
for (const p of manifest.projectiles) {
  const missile = missiles.find(m => m.Missile === p.id);
  assert.equal(missile.SrcDamage, '128');
  assert.equal(missile.MinDamage, '0');
  assert.equal(missile.MaxDamage, '0');
  assert.ok(shuffledMon.some(m => m.MissA2 === p.id));
}
console.log('PASS: real ZIP contains all three Blood Moor replacements and isolated quill projectiles; original rows and unrelated files are identical');
const boosted = await generate(true, true);
const boostedManifest = JSON.parse(entry(boosted.zip, '/enemy-shuffle.json'));
for (const p of boostedManifest.profiles) {
  const affected = [1, 3].includes(p.act);
  assert.equal(+p.final.minHP, affected ? Math.round(+p.balanced.minHP * 2.5) : +p.balanced.minHP);
  assert.equal(+p.final.Exp, affected ? Math.round(Math.round(+p.balanced.Exp * 2.5) * 3) : +p.balanced.Exp);
  assert.equal(+p.final['Exp(H)'], affected ? Math.round(+p.balanced['Exp(H)'] * 2.5) : +p.balanced['Exp(H)']);
}
assert.equal(entry(on.zip, '/missiles.txt'), entry(boosted.zip, '/missiles.txt'), 'projectiles inherit monster changes without extra scaling');
const output = path.join(os.tmpdir(), 'd2rr-enemy-runtime', `enemy-shuffle-v5-seed${seed}.zip`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, on.bytes);
console.log(`PASS: destination player/XP modifiers; sample ZIP: ${output}`);
