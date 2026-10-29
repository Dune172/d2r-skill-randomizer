import fs from 'fs';
for (const p of process.argv.slice(2)) {
  const b = fs.readFileSync(p);
  const woo = b.indexOf(Buffer.from('Woo!')), ws = b.indexOf(Buffer.from('WS'), 600);
  console.log(`\n== ${p.split(/[\/]/).pop()} size=${b.length} hdr[file size]=${b.readUInt32LE(8)} woo=${woo} ws=${ws} prog=${b[21]} status=${b[20]}`);
  for (let d=0; d<3; d++) {
    const base = woo+10+d*96;
    const words=[]; for (let i=0;i<48;i++) words.push(b.readUInt16LE(base+i*2).toString(16).padStart(4,'0'));
    console.log(` D${d} quests: ${words.join(' ')}`);
    const wb = ws+8+d*24;
    const bits=[]; for (let i=0;i<39;i++) if (b[wb+2+(i>>3)] & (1<<(i&7))) bits.push(i);
    console.log(` D${d} wp hdr=${b[wb].toString(16)} ${b[wb+1].toString(16)} bits=[${bits}]`);
  }
}
