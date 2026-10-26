// Copy a tested Open-Acts save, rename it, open Acts II/III in Nightmare and Hell too,
// and unlock Nightmare (progression byte 21 = 5). Usage: node make-nm-save.mjs <src.d2s> <dstDir> <Name>
import fs from 'fs'; import path from 'path';
const [src, dstDir, name] = process.argv.slice(2);
if (!/^[A-Za-z]{2,15}$/.test(name)) throw new Error('bad name');
const b = Buffer.from(fs.readFileSync(src));
if (b.readUInt32LE(0) !== 0xaa55aa55 || b.readUInt32LE(4) !== 105) throw new Error('not a v105 save');
const woo = 403, ws = 701;
if (b.toString('latin1', woo, woo + 4) !== 'Woo!' || b.toString('latin1', ws, ws + 2) !== 'WS') throw new Error('markers moved');
// name
b.fill(0, 299, 299 + 16); b.write(name, 299, 'latin1');
// progression: Normal finished -> Nightmare selectable
b[21] = 5;
for (let d = 0; d < 3; d++) {
  const q = woo + 10 + d * 96;
  for (const w of [7, 15]) if (b.readUInt16LE(q + w * 2) === 0) b.writeUInt16LE(0x2001, q + w * 2);
  const wp = ws + 8 + d * 24;
  if (b[wp] !== 2 || b[wp + 1] !== 1) throw new Error(`waypoint block ${d} header`);
  for (const bit of [0, 9, 18]) b[wp + 2 + (bit >> 3)] |= 1 << (bit & 7);
}
// file size + checksum
b.writeUInt32LE(b.length, 8);
b.writeUInt32LE(0, 12);
let sum = 0;
for (const byte of b) sum = (((sum << 1) | (sum >>> 31)) + byte) >>> 0;
b.writeUInt32LE(sum, 12);
const out = path.join(dstDir, `${name}.d2s`);
if (fs.existsSync(out)) throw new Error(`${out} exists`);
fs.writeFileSync(out, b);
console.log(`wrote ${out} checksum=${sum.toString(16)}`);
