// End-to-end checks for the Open Acts generator options against a running dev server.
// Generates one seed with Open Acts off and in several settings, downloads each ZIP the
// way the site does, and checks what changed.
// Usage: node scripts/verify-open-acts.mjs [baseUrl=http://localhost:3000] [seed=31337]
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const base = process.argv[2] ?? 'http://localhost:3000';
const seed = Number(process.argv[3] ?? 31337);
const repo = process.cwd();
let failures = 0;
const fail = msg => { failures++; console.log(`FAIL ${msg}`); };
const ok = msg => console.log(`ok   ${msg}`);

async function retry(fn) {
  for (let i = 0; ; i++) {
    const res = await fn();
    if ((res.status === 429 || res.status === 503) && i < 20) { await new Promise(r => setTimeout(r, 5000)); continue; }
    return res;
  }
}

// settings → POST body field and the share-link params the site would use
async function generate(openActs, params) {
  const res = await retry(() => fetch(`${base}/api/randomize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed, raceMode: false, ...(openActs ? { openActs } : {}) }),
  }));
  if (!res.ok) throw new Error(`randomize ${res.status}: ${await res.text()}`);
  const dl = await retry(() => fetch(`${base}/api/download?seed=${seed}&raceMode=0${params}`));
  if (!dl.ok) throw new Error(`download ${dl.status} for params "${params}" (cache key mismatch?)`);
  return new AdmZip(Buffer.from(await dl.arrayBuffer()));
}

const table = buf => {
  const lines = buf.toString('latin1').split(/\r?\n/);
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop(); // trailing newline
  return { h: lines[0].split('\t'), rows: lines.slice(1).map(l => l.split('\t')) };
};
const entryMap = zip => new Map(zip.getEntries().filter(e => !e.isDirectory).map(e => [e.entryName, e.getData()]));

const m = `seed${seed}`;
const d = `${m}/${m}.mpq`;
const X = `${d}/data/global/excel`;
const ALLOWED = new Set([`${X}/objects.txt`, `${X}/treasureclassex.txt`, `${X}/monstats.txt`, `${X}/superuniques.txt`,
  `${d}/data/local/lng/strings/quests.json`, `${m}/quest-shuffle.json`, `${d}/modinfo.json`]);
const BOSS_MONSTATS = new Set(['bloodraven', 'andariel', 'radament', 'summoner', 'duriel']);
const BOSS_SUPERUNIQUES = new Set(['Griswold', 'Radament', 'The Summoner', 'Sarina the Battlemaid', 'Icehawk Riftwing']);

const off = entryMap(await generate(null, ''));
ok(`off: ${off.size} entries`);
if (off.has(`${d}/data/local/lng/strings/quests.json`) || [...off.keys()].some(k => k.includes('starter-saves'))) fail('off ZIP has Open Acts files');
if (!off.get(`${d}/modinfo.json`).toString().includes('"savepath":"D2RRandomizer"')) fail('off savepath changed');

const variants = [
  { name: 'shuffle + Acts II/III', oa: { shuffle: true, acts: [2, 3] }, params: '&shuffleQuests=1&openActs=2,3', bosses: true, hints: true, spoiler: true, acts: [2, 3] },
  { name: 'shuffle only, no bosses/hints/spoiler', oa: { shuffle: true, bosses: false, hints: false, spoiler: false }, params: '&shuffleQuests=1&questBosses=0&questHints=0&questSpoiler=0', bosses: false, hints: false, spoiler: false, acts: [] },
  { name: 'Act II open, no shuffle', oa: { acts: [2] }, params: '&openActs=2', shuffle: false, acts: [2] },
  { name: 'shuffle + Acts II–V, hardcore, named', oa: { shuffle: true, acts: [5], hardcore: true, name: 'Swanny' }, params: '&shuffleQuests=1&openActs=2,3,4,5&starterHc=1&starterName=Swanny', bosses: true, hints: true, spoiler: true, acts: [2, 3, 4, 5], hardcore: true,
    starters: ['Swanny-Ama', 'Swanny-Sorc', 'Swanny-Necro', 'Swanny-Pala', 'Swanny-Barb', 'Swanny-Druid', 'Swanny-Sin', 'Swanny-Lock'] },
];

for (const v of variants) {
  const shuffle = v.shuffle !== false;
  const on = entryMap(await generate(v.oa, v.params));
  const label = v.name;
  // 1. Nothing outside the Open Acts files changes.
  for (const [name, data] of off) {
    if (ALLOWED.has(name)) continue;
    if (!on.has(name) || !on.get(name).equals(data)) fail(`${label}: ${name} changed`);
  }
  const added = [...on.keys()].filter(k => !off.has(k));
  const expectAdded = new Set([
    ...(shuffle ? [`${d}/data/local/lng/strings/quests.json`] : []),
    ...(shuffle && v.spoiler ? [`${m}/quest-shuffle.json`] : []),
    ...(shuffle ? [`${X}/objects.txt`] : []),
    ...(v.acts.length ? [...(v.starters ?? ['Amazon', 'Sorceress', 'Necromancer', 'Paladin', 'Barbarian', 'Druid', 'Assassin', 'Warlock']).map(c => `${m}/starter-saves/${c}.d2s`), `${m}/starter-saves/README.txt`] : []),
  ]);
  for (const k of added) if (!expectAdded.has(k) && !off.has(k) && k !== `${X}/treasureclassex.txt`) fail(`${label}: unexpected file ${k}`);
  for (const k of expectAdded) if (!on.has(k)) fail(`${label}: missing ${k}`);

  // 2. Table changes stay on the pool rows.
  if (shuffle) {
    const vObj = table(fs.readFileSync(path.join(repo, 'data', 'txt', 'objects.txt')));
    const zObj = table(on.get(`${X}/objects.txt`));
    const cls = vObj.h.indexOf('Class'), fn = vObj.h.indexOf('OperateFn');
    const pool = new Set(['InifussTree', 'Malus', 'Wirt', 'HoradricCubeChest', 'StaffOfKingsChest', 'LamEsensTome', 'KhalimHeartChest', 'KhalimEyeChest', 'KhalimBrainChest']);
    zObj.rows.forEach((r, i) => {
      const before = vObj.rows[i] ?? [];
      if (r.join('\t') === before.join('\t')) return;
      if (!pool.has(r[cls])) fail(`${label}: objects.txt row ${r[cls]} changed`);
      if (r.some((c, j) => j !== fn && c !== before[j])) fail(`${label}: objects.txt ${r[cls]} changed beyond OperateFn`);
    });
    if (zObj.rows.find(r => r[cls] === 'Malus')?.[fn] === '12') fail(`${label}: Malus got the Inifuss handler`);
  }
  const tcOff = off.has(`${X}/treasureclassex.txt`) ? table(off.get(`${X}/treasureclassex.txt`)) : table(fs.readFileSync(path.join(repo, 'data', 'txt', 'treasureclassex.txt')));
  const tcOn = on.has(`${X}/treasureclassex.txt`) ? table(on.get(`${X}/treasureclassex.txt`)) : tcOff;
  const wrappers = tcOn.rows.filter(r => r[0]?.startsWith('OpenActs_'));
  tcOff.rows.forEach((r, i) => { if (r.join('\t') !== (tcOn.rows[i] ?? []).join('\t')) fail(`${label}: treasureclassex row ${r[0]} changed (only appends allowed)`); });
  if (shuffle && v.bosses && !wrappers.length) fail(`${label}: no boss wrappers`);
  if ((!shuffle || !v.bosses) && wrappers.length) fail(`${label}: boss wrappers with bosses off`);
  for (const [file, key, bosses] of [['monstats.txt', 'Id', BOSS_MONSTATS], ['superuniques.txt', 'Superunique', BOSS_SUPERUNIQUES]]) {
    const a = table(off.get(`${X}/${file}`)), b = table(on.get(`${X}/${file}`));
    const k = a.h.indexOf(key);
    a.rows.forEach((r, i) => {
      const r2 = b.rows[i] ?? [];
      if (r.join('\t') === r2.join('\t')) return;
      if (!bosses.has(r[k])) fail(`${label}: ${file} row ${r[k]} changed`);
      r.forEach((c, j) => { if (c !== r2[j] && !String(r2[j]).startsWith('OpenActs_')) fail(`${label}: ${file} ${r[k]}.${a.h[j]} changed to ${r2[j]}`); });
    });
  }

  // 3. quests.json text, spoiler, saves.
  if (shuffle) {
    const raw = on.get(`${d}/data/local/lng/strings/quests.json`).toString('utf8');
    if (!raw.startsWith('﻿') || !raw.includes('\r\n')) fail(`${label}: quests.json lost BOM/CRLF`);
    const q = JSON.parse(raw.slice(1));
    const den = q.find(e => e.Key === 'qstsa1q11').enUS;
    const eye = q.find(e => e.Key === 'qstsa3q21').enUS;
    if (v.hints && !/Act I/.test(eye)) fail(`${label}: no act hint in "${eye}"`);
    if (!v.hints && (/Act I/.test(eye) || /Relic acts:/.test(den))) fail(`${label}: hints off but "${eye}"`);
  }
  if (shuffle && v.spoiler) {
    const s = JSON.parse(on.get(`${m}/quest-shuffle.json`).toString());
    if (!s.playthrough?.some(p => p.key)) fail(`${label}: empty spoiler`);
  }
  const modinfo = JSON.parse(on.get(`${d}/modinfo.json`).toString());
  const wantSavepath = v.acts.length ? `${m}_openacts` : 'D2RRandomizer';
  if (modinfo.savepath !== wantSavepath) fail(`${label}: savepath ${modinfo.savepath}, want ${wantSavepath}`);
  for (const [name, b] of on) {
    if (!name.endsWith('.d2s')) continue;
    const c = Buffer.from(b); c.writeUInt32LE(0, 12);
    let sum = 0; for (const x of c) sum = (((sum << 1) | (sum >>> 31)) + x) >>> 0;
    if (b.readUInt32LE(12) !== sum) fail(`${label}: ${name} checksum`);
    if (((b[20] & 0x04) !== 0) !== !!v.hardcore) fail(`${label}: ${name} hardcore bit`);
    const inside = b.toString('latin1', 299, 315).split(String.fromCharCode(0))[0];
    if (!name.endsWith(`/${inside}.d2s`)) fail(`${label}: ${name} holds the name ${inside}`);
    for (let dd = 0; dd < 3; dd++) {
      const w = word => b.readUInt16LE(403 + 10 + dd * 96 + word * 2);
      for (const [act, word] of [[2, 7], [3, 15], [4, 23], [5, 26], [5, 28]]) if ((w(word) === 0x2001) !== v.acts.includes(act)) fail(`${label}: ${name} Act ${act} flag in difficulty ${dd}`);
    }
  }
  ok(`${label}: ${added.length} added files, ${wrappers.length} TC wrappers, savepath ${modinfo.savepath}`);
}

// Race Mode: the spoiler is off unless asked for, and links say so only when it differs.
for (const [label, spoilerField, params, want] of [
  ['race default', {}, '&shuffleQuests=1', false],
  ['race with spoiler', { spoiler: true }, '&shuffleQuests=1&questSpoiler=1', true],
]) {
  const res = await retry(() => fetch(`${base}/api/randomize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed, raceMode: true, openActs: { shuffle: true, ...spoilerField } }),
  }));
  if (!res.ok) { fail(`${label}: randomize ${res.status}`); continue; }
  const dl = await retry(() => fetch(`${base}/api/download?seed=${seed}${params}`));
  if (!dl.ok) { fail(`${label}: download ${dl.status} (cache key mismatch?)`); continue; }
  const has = entryMap(new AdmZip(Buffer.from(await dl.arrayBuffer()))).has(`${m}/quest-shuffle.json`);
  if (has !== want) fail(`${label}: spoiler file ${has ? 'present' : 'missing'}`);
  else ok(`${label}: spoiler file ${has ? 'present' : 'absent'}, link "${params}" downloads it`);
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
