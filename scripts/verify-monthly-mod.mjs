// Run against an isolated local server with the Discord webhook disabled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import AdmZip from 'adm-zip';

const base = 'http://127.0.0.1:3100';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/challenge/options.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const response = await fetch(`${base}/api/randomize`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    seed: 21392, ...exports.SEASON1_OPTIONS,
    // The API must choose the event even if these client flags disagree.
    forgottenArts: false, enemyShuffle: false,
    weeklyChallenge: { enabled: true, weekOverride: 16 },
  }),
});
assert.equal(response.status, 200, await response.text());
const query = '?seed=21392&weekly=1&week=16&weekOverride=16&teleportStaff=18&staffSpeed=0&xpMultiplier=1.5&xpActs=1,2&xpDifficulties=1&raceMode=0';
const download = await fetch(`${base}/api/download${query}`);
assert.equal(download.status, 200, 'download normalizes October flags to the generated cache key');
assert.ok(download.headers.get('content-disposition').includes('d2rr_return_to_tristram_2026-10-01.zip'));
const bytes = Buffer.from(await download.arrayBuffer());
const zip = new AdmZip(bytes);
const entries = zip.getEntries();
const text = suffix => {
  const entry = entries.find(e => e.entryName.endsWith(`/${suffix}`));
  assert.ok(entry, `${suffix} included`);
  return entry.getData().toString('utf8').replace(/^\uFEFF/, '');
};
const table = raw => {
  const [headers, ...rows] = raw.trimEnd().split(/\r?\n/).map(line => line.split('\t'));
  return { headers, rows };
};
const get = (t, row, key) => row[t.headers.indexOf(key)];
assert.equal(JSON.parse(text('modinfo.json')).savepath, 'seed21392');
const spells = JSON.parse(text('forgotten-arts.json'));
const spellCount = spells.shop.eligibleSpells.length;
assert.equal(spellCount, 48);
assert.ok(!spells.shop.eligibleSpells.includes('Bone Armor'));
const regionalStock = spells.books.filter(b => b.source === 'shop' && b.shopAct > 1).length;
// Drops and crafts, four fixed Akara scrolls, two fs4/fs5 variants, six fs6 rolls, regional stock.
assert.equal(spells.books.length, spellCount * 4 + 4 + 2 + 6 + regionalStock);
const chars = table(text('charstats.txt'));
for (const row of chars.rows.filter(r => get(chars, r, 'class') && get(chars, r, 'class') !== 'Expansion')) {
  assert.equal(+get(chars, row, 'SkillsPerLevel'), 0);
  assert.ok(chars.headers.some((h, i) => /^item\d+$/.test(h) && row[i] === 'cm1'), 'starter scroll');
  assert.ok(chars.headers.some((h, i) => /^item\d+$/.test(h) && row[i] === 'box'), 'starter Cube');
}
for (const name of ['armor', 'weapons']) {
  const actual = table(text(`${name}.txt`));
  const vanilla = table(fs.readFileSync(`data/txt/${name}.txt`, 'utf8'));
  for (const row of vanilla.rows) {
    if (!row[0] || get(vanilla, row, 'nodurability') === '1') continue;
    const changed = actual.rows.find(r => get(actual, r, 'code') === get(vanilla, row, 'code'));
    assert.ok(changed);
    const durability = +get(vanilla, row, 'durability');
    if (durability > 0) assert.equal(+get(actual, changed, 'durability'), Math.max(1, Math.floor(durability / 4)));
    const cost = +get(vanilla, row, 'cost');
    if (cost > 0) assert.equal(+get(actual, changed, 'cost'), cost * 10);
  }
}
const enemies = JSON.parse(text('enemy-shuffle.json'));
assert.ok(enemies.profiles.length > 0);
for (const profile of enemies.profiles) {
  for (const key of ['Velocity', 'Run']) if (+profile.balanced[key] > 0) {
    assert.equal(+profile.final[key], Math.max(1, Math.round(+profile.balanced[key] * 0.7)));
  }
  if (+profile.balanced.A2MinD > 0 && +profile.balanced.A2MaxD > 0) {
    assert.equal(+profile.final.A2MinD, +profile.balanced.A2MinD * 2);
    assert.equal(+profile.final.A2MaxD - +profile.final.A2MinD, +profile.balanced.A2MaxD - +profile.balanced.A2MinD);
  }
}
assert.ok(text('magicprefix.txt').includes('D2RR_FA_Power_'));
assert.ok(text('magicsuffix.txt').includes('D2RR_FA_Charges_'));
const uniques = table(text('uniqueitems.txt'));
const originalUniques = table(fs.readFileSync('data/txt/uniqueitems.txt', 'utf8'));
for (const [index, original] of originalUniques.rows.entries()) {
  assert.equal(uniques.rows[index][0], original[0], 'preserve original unique IDs');
  for (const field of ['disabled', 'spawnable', 'rarity', 'code', 'lvl']) {
    assert.equal(get(uniques, uniques.rows[index], field), get(originalUniques, original, field), `${original[0]} ${field}`);
  }
}
assert.equal(uniques.rows[originalUniques.rows.length + spellCount * 4 + 4][0], 'Astral Wayfarer', 'append staff after existing spell IDs');
const shopMisc = table(text('misc.txt'));
assert.equal(spells.shop.unlimitedStock, false);
assert.equal(spells.shop.duplicatesAllowed, true);
assert.ok(spells.shop.selection.includes('every vendor refresh'));
assert.equal(spells.books.filter(b => b.shopWeight).length, 6 + regionalStock);
for (const spell of spells.books.filter(b => b.source === 'shop')) {
  const base = shopMisc.rows.find(r => get(shopMisc, r, 'code') === spell.code);
  const pool = spells.shop.acts.find(p => p.act === spell.shopAct);
  for (const vendor of ['Akara', 'Lysander', 'Drognan', 'Alkor', 'Ormus', 'Jamella', 'Malah']) assert.equal(Number(get(shopMisc, base, vendor + 'Max')), pool?.vendors.includes(vendor) ? 3 : 0);
  assert.equal(get(shopMisc, base, 'PermStoreItem'), '0');
  assert.equal(get(shopMisc, base, 'multibuy'), '0');
}
const names = JSON.parse(text('item-names.json'));
const otherStringIds = new Set(['skills', 'item-modifiers'].flatMap(file => JSON.parse(fs.readFileSync(`data/local/strings/${file}.json`, 'utf8').replace(/^\uFEFF/, '')).map(e => e.id)));
for (const spell of spells.books) {
  const name = names.find(n => n.Key === spell.key);
  assert.equal(name.enUS, spell.name);
  assert.ok(name.id >= 40000 && name.id < 41000);
  assert.ok(!otherStringIds.has(name.id), `${spell.key} string ID collision`);
  const item = uniques.rows.find(r => r[0] === spell.key);
  const baseCost = spell.source === 'shop' ? 7500 : spell.bonus === 1 ? 2000 : 6000;
  assert.equal(baseCost + Number(get(uniques, item, 'cost add')), spell.source === 'shop' ? spell.shopBaseCost : 2000 * spell.bonus);
}
assert.equal(new Set(names.map(n => n.id)).size, names.length, 'unique string IDs');
const tooltipStats = table(text('itemstatcost.txt'));
const tooltipProperties = table(text('properties.txt'));
const tooltipRecipes = table(text('cubemain.txt'));
assert.equal(spells.synergies.length, spellCount);
for (const synergy of spells.synergies) {
  const name = names.find(n => n.Key === synergy.key);
  assert.equal(name.enUS, synergy.text);
  assert.ok(name.id >= 41000 && name.id < 41000 + spellCount && !otherStringIds.has(name.id));
  const property = tooltipProperties.rows.find(r => r[0] === synergy.property);
  assert.equal(get(tooltipProperties, property, 'stat1'), synergy.stat);
  const stat = tooltipStats.rows.find(r => r[0] === synergy.stat);
  assert.equal(get(tooltipStats, stat, 'descstrpos'), synergy.key);
  assert.equal(get(tooltipStats, stat, 'descfunc'), '19');
  for (const book of spells.books.filter(b => b.skill === synergy.skill)) {
    const item = uniques.rows.find(r => r[0] === book.key);
    assert.equal(get(uniques, item, 'prop3'), synergy.property);
    assert.ok(tooltipRecipes.rows.some(r => get(tooltipRecipes, r, 'input 1') === book.key && get(tooltipRecipes, r, 'output') === book.key && get(tooltipRecipes, r, 'numinputs') === '1'));
  }
}
const loot = table(text('treasureclassex.txt'));
const superuniques = table(text('superuniques.txt'));
const corpsefire = superuniques.rows.find(r => r[0] === 'Corpsefire');
const griswold = superuniques.rows.find(r => r[0] === 'Griswold');
for (const column of ['TC', 'TC(N)', 'TC(H)']) {
  const staffDrop = loot.rows.find(r => r[0] === get(superuniques, corpsefire, column));
  assert.equal(get(loot, staffDrop, 'Picks'), '-2');
  assert.equal(get(loot, staffDrop, 'Item1'), 'Astral Wayfarer');
  assert.ok(loot.rows.find(r => r[0] === get(loot, staffDrop, 'Item2')), 'retain prior loot');
  const scrollDrop = loot.rows.find(r => r[0] === get(superuniques, griswold, column));
  assert.equal(get(loot, scrollDrop, 'Picks'), '-2');
  assert.equal(get(loot, scrollDrop, 'Item1'), 'D2RR_FA_Act 1 Good');
}
assert.equal(entries.filter(e => /forgotten_arts_(scroll|book)[123]?(\.lowend)?\.sprite$/.test(e.entryName)).length, 16);
const preview = await fetch(`${base}/api/preview`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ seed: 21392, weekNumber: 16 }),
});
assert.equal(preview.status, 200);
const previewData = await preview.json();
assert.equal(previewData.mode, 'forgotten-arts');
assert.deepEqual(previewData.classes, []);
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/d2rr_return_to_tristram_2026-10-01.zip', bytes);
console.log('PASS: October generates/downloads with all three mutations, correct starter items, equipment, artwork, preview and isolated saves');
