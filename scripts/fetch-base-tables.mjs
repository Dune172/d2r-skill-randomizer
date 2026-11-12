// fetch-base-tables.mjs — download the base-game (non-Reign of the Warlock) data
// tables that match data/txt/ into data/txt/base/.
//
// D2R keeps two sets of tables: data/global/excel/*.txt for Reign of the Warlock
// games and data/global/excel/base/*.txt for Classic/Lord of Destruction games.
// Players without the DLC only load the base set, so base-game mods are built
// from these files.
//
// Source: a raw CascLib dump of a retail install, pinned to the same game build
// as data/txt/ (3.2.92777). The script checks that the dump's top-level tables
// still match data/txt/ before writing anything, so a mismatched build fails loudly.
//
// Usage: node scripts/fetch-base-tables.mjs

import fs from 'node:fs';
import path from 'node:path';

const REPO = 'pinkufairy/D2R-Excel';
const COMMIT = 'cb27a8f';          // "3.2.92777"
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const TXT = path.join(ROOT, 'data', 'txt');
const OUT = path.join(TXT, 'base');

const raw = (p) => `https://raw.githubusercontent.com/${REPO}/${COMMIT}/${p}`;
const norm = (s) => s.replace(/\r/g, '');

async function get(p) {
  const res = await fetch(raw(p));
  if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const names = fs.readdirSync(TXT).filter((f) => f.endsWith('.txt'));
fs.mkdirSync(OUT, { recursive: true });

for (const name of names) {
  const top = await get(name);
  if (norm(top.toString('utf8')) !== norm(fs.readFileSync(path.join(TXT, name), 'utf8'))) {
    throw new Error(`${name}: the dump's RotW table differs from data/txt/${name}; wrong build?`);
  }
  const base = await get(`base/${name}`);
  fs.writeFileSync(path.join(OUT, name), norm(base.toString('utf8')).replace(/\n/g, '\r\n'));
  console.log(`base/${name}  ${base.length} bytes`);
}
console.log(`Wrote ${names.length} tables to data/txt/base/ (${REPO}@${COMMIT}).`);
