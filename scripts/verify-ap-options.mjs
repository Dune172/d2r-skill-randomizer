/**
 * verify-ap-options.mjs — the options builder on /archipelago must offer exactly what
 * the apworld accepts.
 *
 * The page's option list (src/lib/archipelago/options.ts) is a hand-written mirror of
 * apworld/d2rr/options.py. If they drift, the builder hands players a YAML that
 * Archipelago rejects, or silently omits a new option. This reads the Python with its
 * own parser and compares every key, choice, range and default, and the versions the
 * page states against archipelago.json.
 *
 *   node scripts/verify-ap-options.mjs
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const repoRoot = path.resolve(import.meta.dirname, '..');
const pyOptions = path.join(repoRoot, 'apworld', 'd2rr', 'options.py');

// Read options.py structurally. Importing it would need Archipelago installed.
const PY = String.raw`
import ast, json, sys
tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())
classes, order = {}, []
for node in tree.body:
    if not isinstance(node, ast.ClassDef):
        continue
    attrs = {}
    for stmt in node.body:
        if isinstance(stmt, ast.Assign) and isinstance(stmt.value, ast.Constant):
            attrs[stmt.targets[0].id] = stmt.value.value
    classes[node.name] = {"base": node.bases[0].id if node.bases else "", "attrs": attrs}
    if node.name == "D2RROptions":
        order = [(s.target.id, s.annotation.id) for s in node.body if isinstance(s, ast.AnnAssign)]
out = []
for key, cls in order:
    info = classes[cls]
    a = info["attrs"]
    if info["base"] == "Choice":
        choices = sorted((v, k[len("option_"):]) for k, v in a.items() if k.startswith("option_"))
        names = [name for _, name in choices]
        out.append({"key": key, "type": "choice", "choices": names, "default": dict(choices)[a["default"]]})
    elif info["base"] == "Range":
        out.append({"key": key, "type": "range", "min": a["range_start"], "max": a["range_end"], "default": a["default"]})
    else:  # Toggle, DeathLink
        out.append({"key": key, "type": "toggle", "default": bool(a.get("default", 0))})
print(json.dumps(out))
`;

function python() {
  for (const c of ['python', 'py', 'python3']) {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c; } catch { /* next */ }
  }
  throw new Error('no python interpreter found on PATH');
}

function loadTs(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', code)(mod, mod.exports);
  return mod.exports;
}

const fromPython = JSON.parse(execFileSync(python(), ['-c', PY, pyOptions], { encoding: 'utf8' }));
const page = loadTs(path.join(repoRoot, 'src', 'lib', 'archipelago', 'options.ts'));
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apworld', 'd2rr', 'archipelago.json'), 'utf8'));

const problems = [];
const pageByKey = new Map(page.AP_OPTIONS.map(o => [o.key, o]));
for (const py of fromPython) {
  const mine = pageByKey.get(py.key);
  if (!mine) { problems.push(`${py.key}: in the apworld, missing from the page`); continue; }
  pageByKey.delete(py.key);
  if (mine.type !== py.type) { problems.push(`${py.key}: ${py.type} in the apworld, ${mine.type} on the page`); continue; }
  if (py.type === 'choice') {
    const choices = mine.choices.map(c => c.value);
    if (choices.join() !== py.choices.join()) problems.push(`${py.key}: choices [${py.choices}] vs [${choices}]`);
  }
  if (py.type === 'range' && (mine.min !== py.min || mine.max !== py.max)) {
    problems.push(`${py.key}: range ${py.min}-${py.max} vs ${mine.min}-${mine.max}`);
  }
  if (mine.default !== py.default) problems.push(`${py.key}: default ${py.default} vs ${mine.default}`);
}
for (const key of pageByKey.keys()) problems.push(`${key}: on the page, not in the apworld`);

if (page.AP_GAME_NAME !== manifest.game) problems.push(`game name "${manifest.game}" vs "${page.AP_GAME_NAME}"`);
if (page.AP_WORLD_VERSION !== manifest.world_version) problems.push(`world version ${manifest.world_version} vs ${page.AP_WORLD_VERSION}`);
if (page.AP_MINIMUM_ARCHIPELAGO !== manifest.minimum_ap_version) {
  problems.push(`minimum Archipelago ${manifest.minimum_ap_version} vs ${page.AP_MINIMUM_ARCHIPELAGO}`);
}

// The builder's output must be what Archipelago's generator reads.
const yaml = page.buildApYaml('  A name that is far too long!!  ', page.defaultApOptions());
const lines = yaml.trimEnd().split('\n');
if (lines[0] !== 'name: "A name that is f"' || lines[1] !== `game: ${manifest.game}` || lines[2] !== `${manifest.game}:`) {
  problems.push(`YAML header is wrong: ${JSON.stringify(lines.slice(0, 3))}`);
}
if (lines.length !== 3 + fromPython.length) problems.push(`YAML has ${lines.length - 3} options, the apworld ${fromPython.length}`);

if (problems.length) {
  console.error(`The page and the apworld disagree (${problems.length}):\n`);
  problems.forEach(p => console.error(`  - ${p}`));
  process.exit(1);
}
console.log(`The options builder matches the apworld: ${fromPython.length} options, world ${manifest.world_version}, Archipelago ${manifest.minimum_ap_version}+.`);
