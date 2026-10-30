/**
 * publish-ap-client.mjs — build the Archipelago companion app into the site.
 *
 * Testers download it from the unlisted /archipelago page, so it is served from
 * public/archipelago/d2rr-ap.exe and committed with the site. That keeps the app and the
 * server it talks to in one commit: they cannot ship apart, and an app built for an older
 * manifest contract cannot be live against a newer site. CI runs the committed copy's
 * `version` and fails if its contracts differ from the source.
 *
 * Run it after changing anything in tools/ap-client, and commit the result:
 *
 *   node scripts/publish-ap-client.mjs
 *
 * Needs Go (the version in tools/ap-client/go.mod).
 */
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const clientDir = path.join(repoRoot, 'tools', 'ap-client');
const out = path.join(repoRoot, 'public', 'archipelago', 'd2rr-ap.exe');

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
// The commit the app comes from, marked when the client has uncommitted changes.
const dirty = git('status', '--porcelain', '--', 'tools/ap-client') !== '';
const buildID = git('rev-parse', '--short', 'HEAD') + (dirty ? '-dirty' : '');

fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync('go', [
  'build', '-trimpath', '-ldflags', `-s -w -X main.buildID=${buildID}`, '-o', out, './cmd/d2rr-ap',
], {
  cwd: clientDir,
  stdio: 'inherit',
  env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
});

const data = fs.readFileSync(out);
const sha256 = crypto.createHash('sha256').update(data).digest('hex');
console.log(`Wrote ${path.relative(repoRoot, out)} (${(data.length / 1048576).toFixed(1)} MB, build ${buildID})`);
console.log(`sha256 ${sha256}`);
if (dirty) console.warn('WARNING: tools/ap-client has uncommitted changes; commit them and publish again.');
