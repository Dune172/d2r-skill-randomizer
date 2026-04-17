import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
import fs from 'fs';
import path from 'path';
import { createRNG, seedFromString } from '@/lib/randomizer/seed';
import { loadTreeGrid, loadSkills, loadSkillDescs, loadTxtFile, serializeTxtFile, loadSkillStrings } from '@/lib/data-loader';
import { randomizeTrees } from '@/lib/randomizer/tree-randomizer';
import { placeSkills, groupByClass } from '@/lib/randomizer/skill-placer';
import { updateSkillsSynergies, updateSkillDescSynergies } from '@/lib/randomizer/synergy-updater';
import { writeSkillsRows, reorderSkillsRows } from '@/lib/randomizer/skills-writer';
import { writeSkillDescRows } from '@/lib/randomizer/skilldesc-writer';
import { assignPrerequisites } from '@/lib/randomizer/prereq-assigner';
import { buildAllTreeSprites } from '@/lib/sprites/tree-stitcher';
import { buildAllIconSprites, buildHireableSprite } from '@/lib/sprites/icon-assembler';
import { getCurrentWeekNumber } from '@/lib/challenge/week';
import { buildZip } from '@/lib/zip-builder';
import { getZipCache, getZipCacheStats, hasCached, setCached, makeCacheKey } from '@/lib/zip-cache';
import { incrementCount } from '@/lib/counter';
import { enqueueGeneration, getQueueDepth } from '@/lib/generation-queue';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { scaleMonstats } from '@/lib/randomizer/players-scaler';
import { remapMonstatsSkillIds } from '@/lib/randomizer/monstats-skill-remapper';
import { applyTeleportStaffUnique, applyBloodRavenQuestDrop, applyHoradricCube } from '@/lib/randomizer/starting-items';
import { writeHirelingRows } from '@/lib/randomizer/hireling-writer';
import { remapClassItemSkills, remapUniqueItemSkills } from '@/lib/randomizer/item-skills-writer';
import { CLASS_DEFS } from '@/lib/randomizer/config';
import { scaleExperienceRows } from '@/lib/randomizer/experience-scaler';
import { applyWeeklyMutations } from '@/lib/randomizer/mutations';
import chatPanelRaw from '@/lib/randomizer/ui/chatpanel.json';
import chatPanelHdRaw from '@/lib/randomizer/ui/chatpanelhd.json';

const DATA_DIR = path.join(process.cwd(), 'data');

// Rate-limited 503 telemetry: log at most once per 10s so a sustained overload
// doesn't spam stdout. Shows enough context (depth, RSS, cache) to post-mortem
// a spike without attaching a profiler.
let lastBusyLog = 0;
function logBusy(ip: string): void {
  const now = Date.now();
  if (now - lastBusyLog < 10_000) return;
  lastBusyLog = now;
  const mem = process.memoryUsage();
  const cache = getZipCacheStats();
  console.warn(
    `[randomize:busy] ts=${new Date(now).toISOString()} ip=${ip} ` +
    `queueDepth=${getQueueDepth()} rssMB=${(mem.rss / 1024 / 1024).toFixed(0)} ` +
    `heapUsedMB=${(mem.heapUsed / 1024 / 1024).toFixed(0)} ` +
    `zipCache=${cache.entries}/${cache.maxEntries} ` +
    `zipBytesMB=${(cache.bytes / 1024 / 1024).toFixed(0)}`,
  );
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const seedInput = body.seed;
    const enablePrereqs = body.enablePrereqs !== false; // default true
    const playersEnabled = body.playersEnabled === true;
    const playersCount = Math.min(8, Math.max(1, Number(body.playersCount) || 1));
    const playersActs: number[] = Array.isArray(body.playersActs)
      ? (body.playersActs as unknown[]).map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5];
    const startingTeleportStaff = body.startingItems?.teleportStaff === true;
    const teleportStaffLevel = startingTeleportStaff
      ? (Number(body.startingItems?.teleportStaffLevel) || 1)
      : 0;
    const teleportStaffDropSource: string = body.startingItems?.teleportStaffDropSource || 'Corpsefire';
    const teleportStaffSpeed = body.startingItems?.teleportStaffSpeed !== false;
    const hirelingAura       = body.hirelingAura       !== false;  // default true
    const disableChat        = body.disableChat        === true;   // default false
    const startingHoradricCube = body.startingItems?.horadricCube === true;
    const xpMultiplier = Math.min(3, Math.max(1, Number(body.xpMultiplier) || 1));
    const xpActs: number[] = Array.isArray(body.xpActs)
      ? (body.xpActs as unknown[]).map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5];
    const excludeTeleport   = body.excludeTeleport     === true;   // default false
    const weeklyEnabled = body.weeklyChallenge?.enabled === true;
    const weeklyOverride: number | undefined =
      typeof body.weeklyChallenge?.weekOverride === 'number'
        ? Math.max(1, Math.trunc(body.weeklyChallenge.weekOverride))
        : undefined;

    if (!seedInput && seedInput !== 0) {
      return NextResponse.json({ error: 'Seed is required' }, { status: 400 });
    }

    const numericSeed = Number(seedInput);
    const seed = (typeof seedInput === 'number' || (typeof seedInput === 'string' && !isNaN(numericSeed) && Number.isInteger(numericSeed)))
      ? Math.trunc(numericSeed)
      : seedFromString(String(seedInput));
    const effectivePlayers = playersEnabled ? playersCount : 1;
    const effectiveActs = effectivePlayers > 1 ? playersActs : [1, 2, 3, 4, 5];
    const effectiveXpActs = xpMultiplier > 1 ? xpActs : [1, 2, 3, 4, 5];
    const cacheKey = makeCacheKey(seed, effectivePlayers, teleportStaffLevel, effectiveActs, hirelingAura, teleportStaffDropSource, disableChat, startingHoradricCube, enablePrereqs, xpMultiplier, effectiveXpActs, weeklyEnabled ? (weeklyOverride ?? -1) : 0, startingTeleportStaff && teleportStaffSpeed, excludeTeleport);

    // Check cache (fast path — bypasses queue AND rate limit so users can
    // re-download a seed they already generated without being throttled)
    if (hasCached(cacheKey)) {
      return NextResponse.json({ seed, status: 'ready' });
    }

    // Per-IP rate limit: 3 fresh generations per 60s. Users retrying different
    // seeds stay under; scripted abuse hits the ceiling quickly.
    const ip = getClientIp(request);
    const rl = checkRateLimit(`randomize:${ip}`, 3, 60_000);
    if (!rl.ok) {
      return rateLimitResponse(
        rl.retryAfter,
        `You're generating mods too quickly. Try again in ${rl.retryAfter}s.`,
      );
    }

    // Reject early if queue is already backed up to prevent cascade timeouts.
    // 8 deep: with ~3-5s per gen, worst-case wait is ~30-40s — better UX than
    // hard-rejecting a legitimate burst. The rate limiter (3/60s/IP) upstream
    // still blocks scripted abuse from piling on.
    if (getQueueDepth() >= 8) {
      logBusy(ip);
      return NextResponse.json(
        { error: 'Server is busy — too many mods generating at once. Try again in a moment!' },
        { status: 503 },
      );
    }

    // Serialize generation so only one mod builds at a time
    await enqueueGeneration(async () => {

    // Re-check cache inside the queue in case another request built it while we waited
    if (hasCached(cacheKey)) return;

    const rng = createRNG(seed);

    // Load all data
    const treePages = loadTreeGrid();
    const skills = loadSkills();
    const skillDescs = loadSkillDescs();
    const skillsTxt = loadTxtFile('skills.txt');
    const skillDescTxt = loadTxtFile('skilldesc.txt');

    // Step 5-6: Randomize trees and place skills
    const treeAssignments = randomizeTrees(rng, treePages);
    const { placements, droppedSkillNames } = placeSkills(rng, skills, treeAssignments, {
      excludeSkills: excludeTeleport ? new Set(['Teleport']) : undefined,
    });
    const placementsByClass = groupByClass(placements);

    // Strip charclass from rows for skills that were dropped this seed (HARDCODED_CLASS_SKILLS
    // probabilistic pins that rolled tails). Otherwise skills.txt still advertises them as
    // belonging to their native class even though they don't appear in the class's tree UI.
    if (droppedSkillNames.size > 0) {
      const ccIdx = skillsTxt.headers.indexOf('charclass');
      if (ccIdx !== -1) {
        for (const row of skillsTxt.rows) {
          if (droppedSkillNames.has(row[0])) row[ccIdx] = '';
        }
      }
    }

    // Step 7: Update synergies
    const skillsSynergyUpdates = updateSkillsSynergies(placements, placementsByClass, rng);

    // Build str name lookup from skilldesc data
    const skillDescStrNames = new Map<string, string>();
    for (const [name, desc] of skillDescs.entries()) {
      skillDescStrNames.set(name, desc.strName);
    }

    const descSynergyUpdates = updateSkillDescSynergies(
      placements,
      placementsByClass,
      skillDescStrNames,
      skillDescs,
      rng,
    );

    // Assign prerequisites based on grid position (or empty map if disabled)
    const prereqAssignments = enablePrereqs
      ? assignPrerequisites(placements, placementsByClass)
      : new Map();

    // Step 8: Write modified txt files
    writeSkillsRows(skillsTxt.headers, skillsTxt.rows, placements, skillsSynergyUpdates, prereqAssignments);

    // Reorder skills.txt rows into contiguous class blocks (fixes StaffMod pool lookup).
    // Must run after writeSkillsRows has updated all column values (charclass, reqlevel, etc.).
    const { reorderedRows, idMapping } = reorderSkillsRows(skillsTxt.rows, placements);
    skillsTxt.rows = reorderedRows;

    writeSkillDescRows(skillDescTxt.headers, skillDescTxt.rows, placements, descSynergyUpdates);

    // Hireling randomization (aura and/or attack skills, per user options)
    let hirelingTxtContent: string | undefined;
    let assignedHirelingSkills = new Set<string>();
    if (hirelingAura) {
      const hirelingTxtFile = loadTxtFile('hireling.txt');
      assignedHirelingSkills = writeHirelingRows(hirelingTxtFile.headers, hirelingTxtFile.rows,
        placements, rng, { aura: hirelingAura, skills: false });
      hirelingTxtContent = serializeTxtFile(hirelingTxtFile.headers, hirelingTxtFile.rows);

      // Also collect vanilla attack skills (Mode ∈ {4,7,14}) so they get correct
      // HireableIconCel values in the hireable sprite. Without this, all attack
      // skills default to HireableIconCel=0 and show the wrong icon.
      const HIRELING_ATTACK_MODES = new Set(['4', '7', '14']);
      for (let i = 1; i <= 6; i++) {
        const sCol = hirelingTxtFile.headers.indexOf(`Skill${i}`);
        const mCol = hirelingTxtFile.headers.indexOf(`Mode${i}`);
        if (sCol === -1 || mCol === -1) continue;
        for (const row of hirelingTxtFile.rows) {
          if (row[sCol] && HIRELING_ATTACK_MODES.has(row[mCol])) {
            assignedHirelingSkills.add(row[sCol]);
          }
        }
      }
    }

    // Remap class-restricted item skill affixes (magicprefix / magicsuffix)
    const magicPrefixTxt = loadTxtFile('magicprefix.txt');
    const magicSuffixTxt = loadTxtFile('magicsuffix.txt');
    const remappedPrefixRows = remapClassItemSkills(magicPrefixTxt.headers, magicPrefixTxt.rows, placements, idMapping);
    const remappedSuffixRows = remapClassItemSkills(magicSuffixTxt.headers, magicSuffixTxt.rows, placements, idMapping);
    const magicPrefixContent = serializeTxtFile(magicPrefixTxt.headers, remappedPrefixRows);
    const magicSuffixContent = serializeTxtFile(magicSuffixTxt.headers, remappedSuffixRows);

    // itemtypes.txt — include as-is to ensure StaffMods is correct for all class item types
    // (e.g. grim=war so white warlock grimoires get warlock staff mods, not Sorceress mods)
    let itemtypesTxt: string | undefined;
    const itemtypesPath = path.join(DATA_DIR, 'txt', 'itemtypes.txt');
    if (fs.existsSync(itemtypesPath)) {
      itemtypesTxt = fs.readFileSync(itemtypesPath, 'utf-8');
    }

    // Build StartSkill candidates from the verified, already-updated skillsTxt rows.
    // Reading directly from the txt we just wrote guarantees the skill name matches
    // exactly what D2R will read, and that charclass was successfully updated.
    const charclassColIdx = skillsTxt.headers.indexOf('charclass') !== -1
      ? skillsTxt.headers.indexOf('charclass') : 2;

    const reqlevelColIdx = skillsTxt.headers.indexOf('reqlevel') !== -1
      ? skillsTxt.headers.indexOf('reqlevel') : 174;
    const row1SkillsByClass = new Map<string, string[]>();
    for (const row of skillsTxt.rows) {
      const cc = row[charclassColIdx];
      const rl = row[reqlevelColIdx];
      if (cc && rl === '1') {
        if (!row1SkillsByClass.has(cc)) row1SkillsByClass.set(cc, []);
        row1SkillsByClass.get(cc)!.push(row[0]);
      }
    }

    let skillsTxtContent = serializeTxtFile(skillsTxt.headers, skillsTxt.rows);

    // Tab-label overrides for all 7 class skill trees (3 tabs each) + Warcraft.
    // Applied on top of the official skills.json so all skill name keys remain intact.
    const SKILL_CATEGORY_OVERRIDES: { id: number; Key: string; enUS: string }[] = [
      { id: 11193, Key: 'SkillCategoryAm1', enUS: 'Random 1' },
      { id: 11194, Key: 'SkillCategoryAm2', enUS: 'Random 2' },
      { id: 11195, Key: 'SkillCategoryAm3', enUS: 'Random 3' },
      { id: 11196, Key: 'SkillCategorySo1', enUS: 'Random 1' },
      { id: 11197, Key: 'SkillCategorySo2', enUS: 'Random 2' },
      { id: 11198, Key: 'SkillCategorySo3', enUS: 'Random 3' },
      { id: 11199, Key: 'SkillCategoryNe1', enUS: 'Random 1' },
      { id: 11200, Key: 'SkillCategoryNe2', enUS: 'Random 2' },
      { id: 11201, Key: 'SkillCategoryNe3', enUS: 'Random 3' },
      { id: 11202, Key: 'SkillCategoryPa1', enUS: 'Random 1' },
      { id: 11203, Key: 'SkillCategoryPa2', enUS: 'Random 2' },
      { id: 11204, Key: 'SkillCategoryPa3', enUS: 'Random 3' },
      { id: 11205, Key: 'SkillCategoryBa1', enUS: 'Random 1' },
      { id: 11206, Key: 'SkillCategoryBa2', enUS: 'Random 2' },
      { id: 11207, Key: 'SkillCategoryBa3', enUS: 'Random 3' },
      { id: 11208, Key: 'SkillCategoryDr1', enUS: 'Random 1' },
      { id: 11209, Key: 'SkillCategoryDr2', enUS: 'Random 2' },
      { id: 11210, Key: 'SkillCategoryDr3', enUS: 'Random 3' },
      { id: 11211, Key: 'SkillCategoryAs1', enUS: 'Random 1' },
      { id: 11212, Key: 'SkillCategoryAs2', enUS: 'Random 2' },
      { id: 11213, Key: 'SkillCategoryAs3', enUS: 'Random 3' },
      { id: 27563, Key: 'SkillCategoryWa1', enUS: 'Random 3' },
      { id: 27564, Key: 'SkillCategoryWa2', enUS: 'Random 2' },
      { id: 27565, Key: 'SkillCategoryWa3', enUS: 'Random 1' },
    ];

    // Load the full official skills.json, patch the 24 tab-label overrides, and re-serialize.
    // Using the complete file ensures proc item skill names (and all other keys) resolve
    // correctly — D2R already ships this exact file so it will not reject it.
    // Use the module-level cache (loadSkillStrings) and clone so mutations don't corrupt it.
    const skillStringsEntries = loadSkillStrings().map(e => ({ ...e })) as { Key: string; enUS: string }[];
    for (const override of SKILL_CATEGORY_OVERRIDES) {
      const entry = skillStringsEntries.find(e => e.Key === override.Key);
      if (entry) entry.enUS = override.enUS;
    }
    const skillStringsJson = '\uFEFF' + JSON.stringify(skillStringsEntries, null, 2).replace(/\n/g, '\r\n');

    // Load item-modifiers.json; normalize BOM + CRLF like other D2R string files.
    // If the source file has LF-only endings, D2R may fail to parse it and silently
    // fall back to base-game strings (producing e.g. the tristram dialogue on item modifiers).
    let itemModifiersJson: string | undefined;
    const itemModifiersPath = path.join(DATA_DIR, 'local', 'strings', 'item-modifiers.json');
    if (fs.existsSync(itemModifiersPath)) {
      const raw = fs.readFileSync(itemModifiersPath, 'utf-8').replace(/^\uFEFF/, '');
      itemModifiersJson = '\uFEFF' + raw.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    }

    // Item name string entry for the unique staff (D2R looks up index value as a string key).
    // Load the full official item-names.json first so all other item names remain intact,
    // then append the Astral Wayfarer entry. Without the full file, D2R replaces its base
    // item-names.json with the mod version and all other item names break.
    let itemNamesJson: string | undefined;
    if (startingTeleportStaff) {
      const itemNamesPath = path.join(DATA_DIR, 'local', 'strings', 'item-names.json');
      let nameEntries: object[] = [];
      if (fs.existsSync(itemNamesPath)) {
        const raw = fs.readFileSync(itemNamesPath, 'utf-8').replace(/^\uFEFF/, '');
        nameEntries = JSON.parse(raw);
      }
      nameEntries.push({ id: 99999, Key: 'Astral Wayfarer', enUS: 'Astral Wayfarer', zhTW: 'Astral Wayfarer', deDE: 'Astral Wayfarer', esES: 'Astral Wayfarer', frFR: 'Astral Wayfarer', itIT: 'Astral Wayfarer', koKR: 'Astral Wayfarer', plPL: 'Astral Wayfarer', esMX: 'Astral Wayfarer', jaJP: 'Astral Wayfarer', ptBR: 'Astral Wayfarer', ruRU: 'Astral Wayfarer', zhCN: 'Astral Wayfarer' });
      itemNamesJson = '\uFEFF' + JSON.stringify(nameEntries, null, 2).replace(/\n/g, '\r\n');
    }

    // Update charstats.txt: set StartSkill and starting items for each class
    let charstatsTxt: string | undefined;
    let uniqueitemsTxt: string | undefined;
    let tcTxt: string | undefined;
    let superuniquesTxt: string | undefined;
    // Hoist charstats and ui so the weekly mutations block can reference them
    const charstats = loadTxtFile('charstats.txt');
    const charstatsPath = path.join(DATA_DIR, 'txt', 'charstats.txt');
    let ui: ReturnType<typeof loadTxtFile> | null = null;
    if (fs.existsSync(charstatsPath)) {
      const classCol = charstats.headers.indexOf('class');
      const startSkillCol = charstats.headers.indexOf('StartSkill');
      if (classCol !== -1 && startSkillCol !== -1) {
        for (const row of charstats.rows) {
          const classDef = CLASS_DEFS.find(d => d.name === row[classCol]);
          if (classDef) {
            const candidates = row1SkillsByClass.get(classDef.code) ?? [];
            const startSkill = candidates.length > 0
              ? candidates[rng.randInt(0, candidates.length - 1)]
              : undefined;
            row[startSkillCol] = startSkill ?? '';
          }
        }
      }

      const uiPath = path.join(DATA_DIR, 'txt', 'uniqueitems.txt');
      ui = fs.existsSync(uiPath) ? loadTxtFile('uniqueitems.txt') : null;
      if (ui) {
        ui.rows = remapUniqueItemSkills(ui.headers, ui.rows, placements, idMapping);
        if (startingTeleportStaff) {
          ui.rows = applyTeleportStaffUnique(ui.headers, ui.rows, teleportStaffLevel, idMapping, teleportStaffSpeed);
        }
        uniqueitemsTxt = serializeTxtFile(ui.headers, ui.rows);
      }

      if (startingHoradricCube) {
        applyHoradricCube(charstats.headers, charstats.rows);
      }

      charstatsTxt = serializeTxtFile(charstats.headers, charstats.rows);
    }

    // Step 10: Build tree sprites
    // (Source .sprite buffers are kept in a process-global cache — they're
    // static D2R assets, so re-reading them on every generation was wasted I/O.)
    const treeSprites = buildAllTreeSprites(treeAssignments);

    // Step 11: Build icon sprites
    // Build original IconCel lookup from skilldesc data
    const skillDescIconCels = new Map<string, number>();
    for (const [name, desc] of skillDescs.entries()) {
      skillDescIconCels.set(name, desc.IconCel);
    }

    const iconSprites = await buildAllIconSprites(placementsByClass, skillDescIconCels);

    // Build skill-name → placement lookup for hireable sprite
    const skillToPlacement = new Map(placements.map(p => [p.skill.skill, p]));

    // Build hireable sprite and collect HireableIconCel values
    let hireableSprite: Buffer | undefined;
    let hireableIconCelMap = new Map<string, number>();
    if (assignedHirelingSkills.size > 0) {
      const result = await buildHireableSprite(assignedHirelingSkills, skillToPlacement, skillDescIconCels);
      hireableSprite = result.sprite;
      hireableIconCelMap = result.hireableIconCels;
    }

    // Add HireableIconCel column to skilldesc.txt and write values
    const hirIconCelCol = (() => {
      let idx = skillDescTxt.headers.indexOf('HireableIconCel');
      if (idx === -1) {
        idx = skillDescTxt.headers.length;
        skillDescTxt.headers.push('HireableIconCel');
        for (const row of skillDescTxt.rows) row.push('0');
      }
      return idx;
    })();

    for (const [skillName, cel] of hireableIconCelMap) {
      const placement = skillToPlacement.get(skillName);
      if (!placement?.skill.skilldesc) continue;
      const row = skillDescTxt.rows.find(r => r[0] === placement.skill.skilldesc);
      if (row) row[hirIconCelCol] = String(cel);
    }

    const skillDescTxtContent = serializeTxtFile(skillDescTxt.headers, skillDescTxt.rows);

    // Step 11b: monstats — always included to remap skill IDs after row reordering,
    // plus optional players scaling and/or xp boost.
    let monstatsTxt: string | undefined;
    const monstatsSrc = loadTxtFile('monstats.txt');
    const summonIds = new Set(skills.flatMap(s => s.summon ? [s.summon] : []));
    // Remap Skill1–8 numeric IDs to match the new row positions in skills.txt
    let scaledMonRows = remapMonstatsSkillIds(monstatsSrc.headers, monstatsSrc.rows, idMapping);
    if (playersEnabled && playersCount > 1)
      scaledMonRows = scaleMonstats(monstatsSrc.headers, scaledMonRows, playersCount, playersActs, summonIds);
    if (xpMultiplier > 1)
      scaledMonRows = scaleExperienceRows(monstatsSrc.headers, scaledMonRows, xpMultiplier, xpActs, summonIds);
    monstatsSrc.rows = scaledMonRows;

    // Step 11c: superuniques — Corpsefire TC drop (always included in zip)
    const suSrc = loadTxtFile('superuniques.txt');
    const tcSrc = loadTxtFile('treasureclassex.txt');
    if (startingTeleportStaff) {
      applyBloodRavenQuestDrop(suSrc.headers, suSrc.rows, tcSrc.headers, tcSrc.rows, teleportStaffDropSource);
    }

    // Step 11d: weekly challenge mutations
    let armorTxt: string | undefined;
    let weaponsTxt: string | undefined;
    let experienceTxt: string | undefined;
    let miscTxt: string | undefined;

    if (weeklyEnabled) {
      const expSrc = loadTxtFile('experience.txt');
      const armorSrc = loadTxtFile('armor.txt');
      const weaponsSrc = loadTxtFile('weapons.txt');
      const miscSrc = loadTxtFile('misc.txt');

      // Determine week number using the shared LA-timezone calendar
      const computedWeek = getCurrentWeekNumber();
      const weekNumber = weeklyOverride ?? computedWeek;

      applyWeeklyMutations(weekNumber, {
        monstats:      monstatsSrc,
        charstats:     charstats,
        skills:        skillsTxt,
        superuniques:  suSrc,
        treasureclass: tcSrc,
        experience:    expSrc,
        armor:         armorSrc,
        weapons:       weaponsSrc,
        misc:          miscSrc,
        uniqueitems:   ui ?? { headers: [], rows: [] },
      });

      // Re-serialize charstats (may have been modified by Hyperdrive/Hollow Shell)
      charstatsTxt = serializeTxtFile(charstats.headers, charstats.rows);
      // Re-serialize skills (may have been modified by Arcane Surge)
      skillsTxtContent = serializeTxtFile(skillsTxt.headers, skillsTxt.rows);
      // Re-serialize uniqueitems (may have been modified by Hollow Shell)
      if (ui) uniqueitemsTxt = serializeTxtFile(ui.headers, ui.rows);
      // Re-serialize tc (may have been modified by Pestilence/Scavenger's World/Dead Reckoning)
      tcTxt = serializeTxtFile(tcSrc.headers, tcSrc.rows);

      armorTxt      = serializeTxtFile(armorSrc.headers, armorSrc.rows);
      weaponsTxt    = serializeTxtFile(weaponsSrc.headers, weaponsSrc.rows);
      experienceTxt = serializeTxtFile(expSrc.headers, expSrc.rows);
      miscTxt       = serializeTxtFile(miscSrc.headers, miscSrc.rows);
    }

    monstatsTxt     = serializeTxtFile(monstatsSrc.headers, monstatsSrc.rows);
    superuniquesTxt = serializeTxtFile(suSrc.headers, suSrc.rows);
    // Serialize tcTxt if any feature modified tcSrc (teleport staff or weekly mutations)
    if (startingTeleportStaff || weeklyEnabled) {
      tcTxt = serializeTxtFile(tcSrc.headers, tcSrc.rows);
    }

    // Step 12: Build zip
    const modName = `seed${seed}`;
    const formatUiJson = (obj: unknown) =>
      '\uFEFF' + JSON.stringify(obj, null, 4).replace(/\n/g, '\r\n');
    const dataVersionBuild = fs.readFileSync(path.join(DATA_DIR, 'dataversionbuild.txt'), 'utf-8').trim();
    const zipBuffer = buildZip({
      modName,
      skillsTxt: skillsTxtContent,
      skillDescTxt: skillDescTxtContent,
      treeSprites,
      iconSprites,
      skillStringsJson,
      charstatsTxt,
      itemModifiersJson,
      monstatsTxt,
      uniqueitemsTxt,
      treasureClassExTxt: tcTxt,
      superuniquesTxt,
      itemNamesJson,
      hirelingTxt: hirelingTxtContent,
      hireableSprite,
      chatPanelJson: disableChat ? formatUiJson(chatPanelRaw) : undefined,
      chatPanelHdJson: disableChat ? formatUiJson(chatPanelHdRaw) : undefined,
      magicPrefixTxt: magicPrefixContent,
      magicSuffixTxt: magicSuffixContent,
      itemtypesTxt,
      dataVersionBuild,
      armorTxt,
      weaponsTxt,
      experienceTxt,
      miscTxt,
    });

    // Cache the result (byte-bounded LRU handles eviction internally)
    setCached(cacheKey, zipBuffer);
    incrementCount();

    }); // end enqueueGeneration

    return NextResponse.json({ seed, status: 'ready' });
  } catch (error) {
    // Log the full error server-side for debugging; return a generic message
    // to the client so stack traces and internal paths don't leak.
    console.error('Randomize error:', error);
    return NextResponse.json(
      { error: 'Something went wrong generating your mod. Please try again.' },
      { status: 500 },
    );
  }
}
