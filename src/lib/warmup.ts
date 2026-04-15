// Boot-time warmup for the D2R Randomizer process. Runs once when the Node
// server imports this module (from src/app/layout.tsx) and populates the
// caches the hot path depends on:
//   - parsed JSON / CSV (tree grid, skills, skilldescs, skill strings)
//   - TXT row caches for every file /api/randomize ever opens
//   - raw .sprite buffers for all 8 classes (full-res + lowend + panel bg)
//
// Without this, the first user after a deploy pays ~1-2 s of cold parsing +
// ~126 MB of disk reads before their first byte. With this, they hit warm
// memory. Idempotent — safe to call repeatedly.
//
// Failures are swallowed intentionally: missing optional files should never
// crash the web server at boot.

import fs from 'fs';
import path from 'path';

// State lives on globalThis so status is consistent across the multiple module
// instances Next.js can create when the same file is imported from different
// resolution paths (instrumentation.ts vs. API route). Without this, the
// health endpoint would always report warmup: false even after it completed.
const WARMUP_KEY = '__d2r_warmup_state__';
type WarmupState = { started: boolean; done: boolean };
function getWarmupState(): WarmupState {
  const g = globalThis as Record<string, unknown>;
  if (!g[WARMUP_KEY]) g[WARMUP_KEY] = { started: false, done: false } as WarmupState;
  return g[WARMUP_KEY] as WarmupState;
}

export function isWarmupDone(): boolean {
  return getWarmupState().done;
}

export function warmStatic(): void {
  const state = getWarmupState();
  if (state.started) return;
  state.started = true;

  // Run async — don't block the module import / HTTP server startup. A request
  // arriving before warmup finishes will still populate caches on its own path;
  // warmup just shifts that cost off the user.
  void (async () => {
    const startedAt = Date.now();
    try {
      // Parsed data files — all memoized at module scope.
      const {
        loadTreeGrid,
        loadSkills,
        loadSkillDescs,
        loadSkillStrings,
        loadTxtFile,
      } = await import('./data-loader');

      loadTreeGrid();
      loadSkills();
      loadSkillDescs();
      loadSkillStrings();

      const TXT_FILES = [
        'skills.txt',
        'skilldesc.txt',
        'hireling.txt',
        'monstats.txt',
        'charstats.txt',
        'uniqueitems.txt',
        'superuniques.txt',
        'treasureclassex.txt',
        'magicprefix.txt',
        'magicsuffix.txt',
        'armor.txt',
        'weapons.txt',
        'misc.txt',
        'experience.txt',
        'itemtypes.txt',
      ];
      for (const f of TXT_FILES) {
        try { loadTxtFile(f); } catch { /* missing optional files are fine */ }
      }

      // Sprite buffers — static D2R assets, ~126 MB total across 8 classes.
      const { loadSprite } = await import('./sprites/tree-stitcher');
      const CLASS_PREFIXES = ['am', 'so', 'ne', 'pa', 'ba', 'dr', 'as', 'wa'];
      const SPRITES_DIR = path.join(process.cwd(), 'data', 'sprites', 'skill_trees');
      for (const prefix of CLASS_PREFIXES) {
        for (const variant of ['.sprite', '.lowend.sprite']) {
          const name = `${prefix}skilltree${variant}`;
          if (fs.existsSync(path.join(SPRITES_DIR, name))) {
            try { loadSprite(name); } catch { /* ignore */ }
          }
        }
      }
      for (const bg of ['panel_skilltreebg.sprite', 'panel_skilltreebg.lowend.sprite']) {
        if (fs.existsSync(path.join(SPRITES_DIR, bg))) {
          try { loadSprite(bg); } catch { /* ignore */ }
        }
      }

      state.done = true;
      const elapsed = Date.now() - startedAt;
      console.log(`[warmup] static data + sprites warmed in ${elapsed}ms`);

      // Fire-and-forget: pre-generate the current week's challenge ZIP with
      // default options. This is the single hottest cache key on the site
      // (everyone clicking "Try this week's challenge" from the homepage hits
      // it), so warming it makes the first real user's download instant.
      void warmWeeklyChallenge();
    } catch (err) {
      console.warn('[warmup] failed to complete:', err);
    }
  })();
}

async function warmWeeklyChallenge(): Promise<void> {
  try {
    const { getCurrentWeekNumber } = await import('./challenge/week');
    const weekNumber = getCurrentWeekNumber();
    const weeklySeed = weekNumber * 31337;

    // Call the public randomize endpoint via fetch against our own server.
    // This reuses all the production code paths (rate limit, queue, cache
    // insertion) without duplicating logic. Fire-and-forget — it's OK if it
    // races with a real request.
    const port = Number(process.env.PORT) || 3000;
    const url = `http://127.0.0.1:${port}/api/randomize`;

    // Wait briefly for the server to finish binding its port before hitting it.
    await new Promise(r => setTimeout(r, 1500));

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1-warmup' },
      body: JSON.stringify({
        seed: weeklySeed,
        weeklyChallenge: { enabled: true, weekOverride: weekNumber },
      }),
    });
    if (res.ok) {
      console.log(`[warmup] pre-generated weekly challenge (week=${weekNumber}, seed=${weeklySeed})`);
    } else {
      console.log(`[warmup] weekly pre-gen skipped: status=${res.status}`);
    }
  } catch (err) {
    console.log('[warmup] weekly pre-gen skipped:', err instanceof Error ? err.message : err);
  }
}
