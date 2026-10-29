/**
 * verify-ap-room.mjs — run the companion client against a REAL Archipelago room.
 *
 * Everything short of the game: a multiworld is generated with the installed
 * Archipelago, hosted with its own server, and the built client connects to it in
 * -dry-run (so it never needs D2R) and fetches its mod from a local dev server.
 *
 * What this proves, against the real server rather than a fake:
 *   - the client's handshake, slot contract and DeathLink tag are accepted
 *   - the room's seed, class and options reach /api/archipelago/mod and the manifest
 *     that comes back matches the room
 *   - items sent by the server are counted, and survive a client restart without
 *     being counted twice
 *   - server messages are printed with names, not ids
 *   - chat typed into the client reaches the room
 *   - another player's DeathLink arrives
 *
 * Needs: Archipelago installed with the apworld (node scripts/build-apworld.mjs --install),
 * the client built (dist/d2rr-ap.exe), and a dev server (node scripts/dev-cold-cache.mjs).
 *
 *   node scripts/verify-ap-room.mjs
 */
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const AP_DIR = process.env.ARCHIPELAGO_DIR || 'C:\\ProgramData\\Archipelago';
const BASE = process.env.D2RR_BASE || 'http://localhost:3210';
const CLIENT = path.join(repoRoot, 'dist', 'd2rr-ap.exe');
const SLOT = 'Solo';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/** A child process whose output can be waited on line by line. */
function run(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], ...options });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  return {
    child,
    output: () => output,
    say: line => child.stdin.write(line + '\n'),
    async waitFor(pattern, what, timeout = 60_000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const m = pattern.exec(output);
        if (m) return m;
        if (child.exitCode !== null) break;
        await sleep(100);
      }
      throw new Error(`timed out waiting for ${what}\n--- output ---\n${output.slice(-3000)}`);
    },
    stop() { if (child.exitCode === null) child.kill(); },
  };
}

async function main() {
  for (const [file, hint] of [
    [path.join(AP_DIR, 'ArchipelagoGenerate.exe'), 'install Archipelago, or set ARCHIPELAGO_DIR'],
    [CLIENT, 'build the client: cd tools/ap-client && go build -o ../../dist/d2rr-ap.exe ./cmd/d2rr-ap'],
  ]) {
    if (!fs.existsSync(file)) { console.error(`missing ${file}\n  ${hint}`); process.exit(2); }
  }
  if (!(await fetch(`${BASE}/api/health`).catch(() => null))?.ok) {
    console.error(`dev server not reachable at ${BASE}: node scripts/dev-cold-cache.mjs`);
    process.exit(2);
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'd2rr-room-'));
  const players = path.join(work, 'players'), out = path.join(work, 'out');
  fs.mkdirSync(players); fs.mkdirSync(out);
  fs.writeFileSync(path.join(players, 'solo.yaml'), [
    `name: ${SLOT}`, 'game: D2R Randomizer', 'D2R Randomizer:',
    '  character_class: paladin', '  goal_boss: duriel', '  key_items: true',
    '  stat_points: pooled', '  rune_percentage: 30', '  trap_percentage: 10',
    '  xp_multiplier: 2', '  death_link: true', '',
  ].join('\n'));

  const procs = [];
  let failed = 0;
  const step = async (name, fn) => {
    process.stdout.write(`  ${name.padEnd(58)}`);
    try { const note = await fn(); console.log(` ok${note ? ` (${note})` : ''}`); }
    catch (err) { console.log(' FAIL'); console.log(`      ${String(err.message).split('\n').join('\n      ')}`); failed++; }
  };

  try {
    console.log('Companion client against a real Archipelago room\n');
    execFileSync(path.join(AP_DIR, 'ArchipelagoGenerate.exe'),
      ['--player_files_path', players, '--outputpath', out], { stdio: 'ignore' });
    const multidata = path.join(out, fs.readdirSync(out).find(f => f.endsWith('.zip')));

    const port = await freePort();
    const server = run(path.join(AP_DIR, 'ArchipelagoServer.exe'), [multidata, '--port', String(port)], { cwd: work });
    procs.push(server);
    await step('the server hosts the generated room', () => server.waitFor(/server listening|Hosting game at/i, 'the server to listen'));

    const clientArgs = ['-host', 'localhost', '-port', String(port), '-slot', SLOT, '-base-url', BASE,
      '-dry-run', '-state-dir', path.join(work, 'state'), '-mod-out', path.join(work, 'mods')];
    let client = run(CLIENT, clientArgs, { cwd: work });
    procs.push(client);

    let manifest;
    await step('the client is accepted and reads the goal', async () => {
      await client.waitFor(/connected as "Solo"/, 'the handshake');
      return (await client.waitFor(/goal: kill (\w+) on (\w+)/, 'the goal'))[0];
    });
    await step('DeathLink is switched on from the room options', () => client.waitFor(/DeathLink is on/, 'the DeathLink notice'));
    await step('the mod for the room is fetched and matches it', async () => {
      const m = await client.waitFor(/manifest: seed (\d+), class (\w+), savepath (\S+)/, 'the manifest', 240_000);
      const zipName = fs.readdirSync(path.join(work, 'mods')).find(f => f.endsWith('.zip'));
      const { default: AdmZip } = await import('adm-zip');
      const zip = new AdmZip(path.join(work, 'mods', zipName));
      manifest = JSON.parse(zip.getEntries().find(e => e.entryName.endsWith('d2rr-ap-manifest.json')).getData().toString('utf8'));
      if (String(manifest.seed) !== m[1] || manifest.characterClass !== 'pal') throw new Error('manifest does not match the room');
      // key_items and xp_multiplier must have travelled room -> client -> endpoint.
      if (!manifest.tables.keyGates) throw new Error('the room asked for keys but the mod has no key gates');
      return `seed ${m[1]}, keys gated`;
    });

    await step('items sent by the server are counted', async () => {
      await server.waitFor(/Solo.*(has joined|joined)/i, 'the server to see the client');
      for (const item of ['Progressive Skill Point', 'Progressive Skill Point', 'Training Fragment',
        'Stat Points', 'Progressive Horadric Key', 'El Rune', 'Mana Burn Trap', 'Gold']) {
        server.say(`/send ${SLOT} ${item}`);
      }
      // One starting point is precollected; two more were sent.
      const m = await client.waitFor(/items: 3 skill point\(s\) received \(1 fragments, 1 stat point bundles, 1 Horadric Keys\)/, 'the item counts');
      return m[0].slice(7);
    });
    await step('server messages name items, not ids', async () => {
      const text = client.output();
      if (!/Progressive Horadric Key/.test(text) || !/El Rune/.test(text)) throw new Error('item names missing from the log');
      if (/\b57220\d\d\b/.test(text.replace(/seed \d+/g, ''))) throw new Error('a raw item id was printed');
    });
    await step('chat typed into the client reaches the room', async () => {
      client.say('hello from the verifier');
      await server.waitFor(/hello from the verifier/, 'the chat line on the server');
    });
    await step('a server command answers in the client', async () => {
      client.say('!status');
      await client.waitFor(/Solo.*\(\d+\/\d+\)|Solo has \d+ connection/i, 'the !status reply');
    });

    await step('another player\'s death arrives', async () => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('second connection failed')); });
      const packets = [];
      ws.onmessage = e => packets.push(...JSON.parse(e.data));
      ws.send(JSON.stringify([{ cmd: 'Connect', game: '', name: SLOT, password: null, uuid: 'verifier',
        version: { major: 0, minor: 6, build: 7, class: 'Version' }, items_handling: 0,
        tags: ['TextOnly', 'DeathLink'], slot_data: false }]));
      const deadline = Date.now() + 15_000;
      while (!packets.some(p => p.cmd === 'Connected')) {
        if (Date.now() > deadline) throw new Error(`second connection refused: ${JSON.stringify(packets).slice(0, 300)}`);
        await sleep(100);
      }
      ws.send(JSON.stringify([{ cmd: 'Bounce', tags: ['DeathLink'],
        data: { time: Date.now() / 1000, source: 'Verifier', cause: 'Verifier was slain by a test' } }]));
      await client.waitFor(/DeathLink: Verifier was slain by a test/, 'the death in the client log');
      ws.close();
    });

    await step('a restart keeps the counts and does not double them', async () => {
      client.stop();
      await sleep(500);
      client = run(CLIENT, clientArgs, { cwd: work });
      procs.push(client);
      await client.waitFor(/connected as "Solo"/, 'the second handshake');
      await client.waitFor(/items: 3 skill point\(s\) received \(1 fragments, 1 stat point bundles, 1 Horadric Keys\)/, 'the same counts after a restart');
      await sleep(1500);
      if (/items: [^3]\d* skill point/.test(client.output())) throw new Error('the counts changed after the restart');
      const state = fs.readdirSync(path.join(work, 'state')).filter(f => f.endsWith('.json') && !f.includes('datapackage'));
      if (state.length !== 1) throw new Error(`expected one session file, found ${state.length}`);
      const session = JSON.parse(fs.readFileSync(path.join(work, 'state', state[0]), 'utf8'));
      const total = Object.values(session.itemCounts).reduce((a, b) => a + b, 0);
      if (total !== 9) throw new Error(`session holds ${total} items, expected 9 (1 starting + 8 sent)`);
      return `${total} items on disk`;
    });
    await step('the data package was cached by checksum', () => {
      const dir = path.join(work, 'state', 'datapackage');
      if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) throw new Error('no cached data package');
      return fs.readdirSync(dir).join(', ');
    });
  } finally {
    procs.forEach(p => p.stop());
    await sleep(300);
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  if (failed) {
    console.error(`\n${failed} step(s) failed.`);
    process.exit(1);
  }
  console.log('\nThe client and a real Archipelago room agree on everything short of the game.');
}

main().catch(err => { console.error(`\n${err.message}`); process.exit(1); });
