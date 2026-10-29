import fs from 'fs'; import path from 'path';
const root = process.argv[2];
const out = [];
function walk(d){ for (const f of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.d2s')) out.push(p);} }
walk(root);
for (const p of out) {
  const b = fs.readFileSync(p);
  if (b.readUInt32LE(0)!==0xaa55aa55) continue;
  const ver=b.readUInt32LE(4);
  const name=b.slice(299,315).toString('latin1').replace(/\0.*$/,'');
  const hex=(s,e)=>[...b.slice(s,e)].map(x=>x.toString(16).padStart(2,'0')).join(' ');
  console.log(`${path.relative(root,p)} v${ver} name=${name} cls=${b[24]} lvl=${b[27]} | 16..24: ${hex(16,24)} | diff152: ${hex(152,155)}`);
}
