/**
 * build-ap-release.mjs — assemble what a player downloads for Archipelago.
 *
 * Writes dist/archipelago-release/ with the three files that have to come from the same
 * build, plus a checksum list:
 *
 *   d2rr.apworld            the world, for Archipelago
 *   d2rr-ap.exe             the companion client (Windows, like the game)
 *   D2R Randomizer.yaml     an options template with every option and what it does
 *   SHA256SUMS.txt
 *
 * The apworld and the client must match: they share id tables and a slot contract, and a
 * mismatched pair is refused at connect. Releasing them together is how that stays true.
 *
 *   node scripts/build-ap-release.mjs            # build everything
 *   node scripts/build-ap-release.mjs --no-exe   # where Go for Windows is unavailable
 */
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const repoRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(repoRoot, 'dist', 'archipelago-release');

function loadTs(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', code)(mod, mod.exports);
  return mod.exports;
}

/** The options template: every option at its default, each explained in a comment. */
function templateYaml(page) {
  const lines = [
    `# ${page.AP_GAME_NAME} options for Archipelago ${page.AP_MINIMUM_ARCHIPELAGO}+ (world ${page.AP_WORLD_VERSION}).`,
    '# Change what you like, set your name, and give the file to whoever generates the multiworld.',
    '# The same options, as a form: https://d2rrandomizer.com/archipelago',
    '',
    'name: Player',
    `game: ${page.AP_GAME_NAME}`,
    `${page.AP_GAME_NAME}:`,
  ];
  let group = '';
  for (const option of page.AP_OPTIONS) {
    if (option.group !== group) {
      group = option.group;
      lines.push('', `  # --- ${group} ${'-'.repeat(Math.max(3, 60 - group.length))}`);
      if (group === 'Experimental') lines.push('  # Not yet confirmed in the game. Leave these off for a run that has to finish.');
    }
    const allowed = option.type === 'choice' ? option.choices.map(c => c.value).join(', ')
      : option.type === 'range' ? `${option.min} to ${option.max}` : 'true, false';
    lines.push(`  # ${option.help}`, `  # (${allowed})`, `  ${option.key}: ${option.default}`);
  }
  return lines.join('\n') + '\n';
}

function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'build-apworld.mjs')], { stdio: 'inherit' });
  fs.copyFileSync(path.join(repoRoot, 'dist', 'd2rr.apworld'), path.join(outDir, 'd2rr.apworld'));

  if (!process.argv.includes('--no-exe')) {
    execFileSync('go', ['build', '-trimpath', '-o', path.join(outDir, 'd2rr-ap.exe'), './cmd/d2rr-ap'], {
      cwd: path.join(repoRoot, 'tools', 'ap-client'),
      env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
      stdio: 'inherit',
    });
  }

  const page = loadTs(path.join(repoRoot, 'src', 'lib', 'archipelago', 'options.ts'));
  const yaml = templateYaml(page);
  fs.writeFileSync(path.join(outDir, `${page.AP_GAME_NAME}.yaml`), yaml);

  // The template is what players edit, so it has to say what the builder would say.
  const stripped = yaml.split('\n').filter(l => l && !l.trim().startsWith('#')).join('\n') + '\n';
  if (stripped !== page.buildApYaml('Player', page.defaultApOptions())) {
    throw new Error('the options template and the page builder disagree');
  }

  const sums = fs.readdirSync(outDir).sort().map(name => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(outDir, name))).digest('hex');
    return `${hash}  ${name}`;
  });
  fs.writeFileSync(path.join(outDir, 'SHA256SUMS.txt'), sums.join('\n') + '\n');

  console.log(`\nRelease files in ${path.relative(repoRoot, outDir)}:`);
  for (const name of fs.readdirSync(outDir).sort()) {
    console.log(`  ${name.padEnd(24)} ${(fs.statSync(path.join(outDir, name)).size / 1024).toFixed(1)} KB`);
  }
}

main();
