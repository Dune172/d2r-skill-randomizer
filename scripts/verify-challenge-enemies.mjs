// Integration check against an isolated local production server on port 3107.
// Generates challenges 14, 15 and 16; never targets the live site.
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';

const base = 'http://127.0.0.1:3107';
async function generate(week, flag) {
  const response = await fetch(`${base}/api/randomize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed: week * 1337, enemyShuffle: flag, weeklyChallenge: { enabled: true, weekOverride: week } }),
  });
  assert.equal(response.status, 200, await response.text());
  const download = await fetch(`${base}/api/download?seed=${week * 1337}&weekly=1&week=${week}&weekOverride=${week}&enemyShuffle=${flag ? 1 : 0}`);
  assert.equal(download.status, 200);
  return Buffer.from(await download.arrayBuffer());
}
for (const week of [14, 15, 16]) {
  // Try to force the opposite of the prescribed rule. Neither route may allow it.
  const bytes = await generate(week, week < 15);
  const zip = new AdmZip(bytes);
  const manifestEntry = zip.getEntries().find(e => e.entryName.endsWith('/enemy-shuffle.json'));
  const monText = zip.getEntries().find(e => e.entryName.endsWith('/monstats.txt')).getData().toString('utf8');
  if (week === 14) {
    assert.equal(manifestEntry, undefined);
    assert.ok(!monText.includes('d2rr_e'));
    assert.ok(!zip.getEntries().some(e => e.entryName.endsWith('/missiles.txt')));
  } else {
    assert.ok(manifestEntry);
    const manifest = JSON.parse(manifestEntry.getData());
    assert.ok(manifest.replacements.length > 0);
    assert.ok(manifest.projectiles.length > 0);
    for (const p of manifest.profiles) {
      assert.ok(p.final, 'manifest captures post-mutation values');
      if (week === 15) assert.equal(+p.final.AC, 0, 'No Guard affects relocated monsters');
      if (week === 16) {
        assert.equal(+p.final.A2MinD, +p.balanced.A2MinD * 2, 'Molasses scales relocated attacks');
        assert.equal(+p.final.A2MaxD - +p.final.A2MinD, +p.balanced.A2MaxD - +p.balanced.A2MinD, 'Molasses preserves damage spread');
        if (+p.balanced.Velocity > 0) assert.equal(+p.final.Velocity, Math.max(1, Math.round(+p.balanced.Velocity * 0.5)));
      }
    }
    const missileText = zip.getEntries().find(e => e.entryName.endsWith('/missiles.txt')).getData().toString('utf8');
    for (const projectile of manifest.projectiles) assert.ok(missileText.includes(projectile.id));
  }
  assert.deepEqual(await generate(week, week >= 15), bytes, 'client flags cannot create alternative challenge rosters');
  console.log(`PASS: challenge ${week}, monster shuffle ${week >= 15 ? 'on with mutation-adjusted stats' : 'off'}, matching cached downloads`);
}
