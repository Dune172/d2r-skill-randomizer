// Build scripts/open-acts-spike/bin/observe.exe (Windows, needs Go 1.22+).
//
// observe compiles inside a temp copy of the Archipelago client module (tools/ap-client),
// so it reuses that module's vendored, patched d2go. The module comes from, in order:
//   1. the directory given as the first argument
//   2. a local checkout of the Archipelago worktree next to this one
//   3. git archive of origin/claude/archipelago-branch-cleanup-34def9 (any PC with the repo)
// Usage: node scripts/open-acts-spike/build-observe.mjs [apClientDir]
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const AP_REF = 'origin/claude/archipelago-branch-cleanup-34def9';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'observe-'));

const local = process.argv[2] ?? path.resolve(repo, '..', 'archipelago-branch-cleanup-34def9', 'tools', 'ap-client');
let module;
if (fs.existsSync(path.join(local, 'vendor'))) {
  module = path.join(tmp, 'ap-client');
  fs.cpSync(local, module, { recursive: true });
  console.log(`using ${local}`);
} else {
  const tar = path.join(tmp, 'ap-client.tar');
  execFileSync('git', ['-C', repo, 'fetch', '-q', 'origin', AP_REF.replace('origin/', '')], { stdio: 'inherit' });
  execFileSync('git', ['-C', repo, 'archive', '--format=tar', '-o', tar, AP_REF, 'tools/ap-client']);
  execFileSync('tar', ['-xf', 'ap-client.tar'], { cwd: tmp }); // relative: GNU tar reads 'C:' as a host
  module = path.join(tmp, 'tools', 'ap-client');
  console.log(`using ${AP_REF}:tools/ap-client`);
}
if (!fs.existsSync(path.join(module, 'vendor', 'modules.txt'))) throw new Error('ap-client module has no vendor directory');

fs.mkdirSync(path.join(module, 'cmd', 'observe'), { recursive: true });
for (const f of fs.readdirSync(path.join(here, 'observe'))) {
  fs.copyFileSync(path.join(here, 'observe', f), path.join(module, 'cmd', 'observe', f));
}
const out = path.join(here, 'bin', 'observe.exe');
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync('go', ['build', '-mod=vendor', '-o', out, './cmd/observe'], { cwd: module, stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`built ${out}`);
