// Copy original icon sources from a local CASC extraction. Never edits the game.
// node scripts/copy-global-skill-icons.mjs --dir D:/D2RModding/data
import fs from 'node:fs';
import path from 'node:path';
const index = process.argv.indexOf('--dir');
if (index < 0 || !process.argv[index + 1]) throw new Error('Expected --dir <CASC extraction root>');
let root = path.resolve(process.argv[index + 1]);
if (fs.existsSync(path.join(root, 'data', 'hd'))) root = path.join(root, 'data');
const out = path.resolve('data/sprites/global-skills');
const files = [
  ['hd/global/ui/spells/submenu/skillicon.sprite', 'skillicon.sprite'],
  ['hd/global/ui/spells/submenu/skillicon.lowend.sprite', 'skillicon.lowend.sprite'],
  ...['', 'so', 'ne', 'pa', 'wa'].map(prefix => [`global/ui/spells/${prefix}skillicon.dc6`, `${prefix}skillicon.dc6`]),
];
for (const [source] of files) {
  if (!fs.existsSync(path.join(root, source))) throw new Error(`Missing ${source}`);
}
fs.mkdirSync(out, { recursive: true });
for (const [source, target] of files) fs.copyFileSync(path.join(root, source), path.join(out, target));
console.log(`Copied ${files.length} original icon assets to ${out}`);
