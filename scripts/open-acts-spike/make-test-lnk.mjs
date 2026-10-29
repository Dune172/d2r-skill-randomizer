// Port of src/lib/lnk-builder.ts with a configurable target, for the launcher spike.
// Usage: node make-test-lnk.mjs <out.lnk> <mod> <savepath> <Name...>
import fs from 'fs';
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
function lnk(targetPath, envPath, args) {
  const clsid = Buffer.from([1, 0x14, 2, 0, 0, 0, 0, 0, 0xC0, 0, 0, 0, 0, 0, 0, 0x46]);
  const header = Buffer.concat([u32(0x4C), clsid, u32(0x2A2), u32(0x20), Buffer.alloc(24), u32(0), u32(0),
    u32(7) /* SW_SHOWMINNOACTIVE: keep the cmd window out of the way */, u16(0), u16(0), u32(0), u32(0)]);
  const label = Buffer.from([0]);
  const volumeID = Buffer.concat([u32(16 + label.length), u32(3), u32(0), u32(16), label]);
  const base = Buffer.from(targetPath + '\0', 'ascii');
  const suffix = Buffer.from([0]);
  const hdr = 0x1C, volOff = hdr, baseOff = volOff + volumeID.length, sufOff = baseOff + base.length;
  const size = hdr + volumeID.length + base.length + suffix.length;
  const linkInfo = Buffer.concat([u32(size), u32(hdr), u32(1), u32(volOff), u32(baseOff), u32(0), u32(sufOff), volumeID, base, suffix]);
  const argsData = Buffer.concat([u16(args.length), Buffer.from(args, 'utf16le')]);
  const ansi = Buffer.alloc(260); ansi.write(envPath, 0, 'ascii');
  const uni = Buffer.alloc(520); uni.write(envPath, 0, 'utf16le');
  const env = Buffer.concat([u32(0x314), u32(0xA0000001), ansi, uni]);
  return Buffer.concat([header, linkInfo, argsData, env, u32(0) /* TerminalBlock */]);
}
const BS = String.fromCharCode(92);
const [out, mod, savepath, ...names] = process.argv.slice(2);
const game = ['C:', 'Program Files (x86)', 'Diablo II Resurrected'].join(BS);
const dst = ['%USERPROFILE%', 'Saved Games', 'Diablo II Resurrected', 'mods', savepath].join(BS);
const src = [game, 'mods', mod, 'starter-saves'].join(BS);
const copies = names
  .map(n => `(if not exist "${dst}${BS}${n}.d2s" copy "${src}${BS}${n}.d2s" "${dst}${BS}" >nul)`)
  .join(' & ');
const args = `/c (if not exist "${dst}" mkdir "${dst}") & ${copies} & start "" /D "${game}" "${game}${BS}D2R.exe" -mod ${mod} -txt`;
if (args.length > 1000) throw new Error(`args too long: ${args.length}`);
const cmd = ['C:', 'Windows', 'System32', 'cmd.exe'].join(BS);
const cmdEnv = ['%windir%', 'System32', 'cmd.exe'].join(BS);
fs.writeFileSync(out, lnk(cmd, cmdEnv, args));
console.log(`wrote ${out} (${args.length} arg chars)`);
console.log(args);
