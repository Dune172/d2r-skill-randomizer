import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
import fs from 'fs';
import path from 'path';
import { createRNG, seedFromString } from '@/lib/randomizer/seed';
import { loadTreeGrid, loadSkills, loadSkillDescs, loadTxtFile, serializeTxtFile, loadSkillStrings, clearSkillStringsCache } from '@/lib/data-loader';
import { randomizeTrees } from '@/lib/randomizer/tree-randomizer';
import { placeSkills, groupByClass } from '@/lib/randomizer/skill-placer';
import { updateSkillsSynergies, updateSkillDescSynergies } from '@/lib/randomizer/synergy-updater';
import { writeSkillsRows } from '@/lib/randomizer/skills-writer';
import { writeSkillDescRows } from '@/lib/randomizer/skilldesc-writer';
import { writeSkillStrings } from '@/lib/randomizer/strings-writer';
import { assignPrerequisites } from '@/lib/randomizer/prereq-assigner';
import { buildAllTreeSprites, clearSpriteCache } from '@/lib/sprites/tree-stitcher';
import { buildAllIconSprites } from '@/lib/sprites/icon-assembler';
import { buildZip } from '@/lib/zip-builder';
import { getZipCache, makeCacheKey } from '@/lib/zip-cache';
import { scaleMonstats } from '@/lib/randomizer/players-scaler';
import { applyTeleportStaff, applyTeleportStaffUnique } from '@/lib/randomizer/starting-items';
import { CLASS_DEFS } from '@/lib/randomizer/config';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function POST(request: NextRequest) {
  try {
    // Clear skill strings cache so any on-disk update to skills.json is picked up.
    clearSkillStringsCache();

    const body = await request.json();
    const seedInput = body.seed;
    const enablePrereqs = body.enablePrereqs !== false; // default true
    const logic: 'minimal' | 'normal' = body.logic === 'normal' ? 'normal' : 'minimal';
    const playersEnabled = body.playersEnabled === true;
    const playersCount = Math.min(8, Math.max(1, Number(body.playersCount) || 1));
    const playersActs: number[] = Array.isArray(body.playersActs)
      ? (body.playersActs as unknown[]).map(Number).filter(n => n >= 1 && n <= 5)
      : [1, 2, 3, 4, 5];
    const startingTeleportStaff = body.startingItems?.teleportStaff === true;
    const teleportStaffLevel = startingTeleportStaff
      ? (Number(body.startingItems?.teleportStaffLevel) || 1)
      : 0;

    if (!seedInput && seedInput !== 0) {
      return NextResponse.json({ error: 'Seed is required' }, { status: 400 });
    }

    const numericSeed = Number(seedInput);
    const seed = (typeof seedInput === 'number' || (typeof seedInput === 'string' && !isNaN(numericSeed) && Number.isInteger(numericSeed)))
      ? Math.trunc(numericSeed)
      : seedFromString(String(seedInput));
    const effectivePlayers = playersEnabled ? playersCount : 1;
    const effectiveActs = effectivePlayers > 1 ? playersActs : [1, 2, 3, 4, 5];
    const cacheKey = makeCacheKey(seed, effectivePlayers, teleportStaffLevel, effectiveActs);
    const zipCache = getZipCache();

    // Check cache
    if (zipCache.has(cacheKey)) {
      return NextResponse.json({ seed, status: 'ready' });
    }

    const rng = createRNG(seed);

    // Load all data
    const treePages = loadTreeGrid();
    const skills = loadSkills();
    const skillDescs = loadSkillDescs();
    const skillsTxt = loadTxtFile('skills.txt');
    const skillDescTxt = loadTxtFile('skilldesc.txt');

    // Step 5-6: Randomize trees and place skills
    const treeAssignments = randomizeTrees(rng, treePages);
    const placements = placeSkills(rng, skills, treeAssignments);
    const placementsByClass = groupByClass(placements);

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
    writeSkillsRows(skillsTxt.headers, skillsTxt.rows, placements, skillsSynergyUpdates, prereqAssignments, logic);
    writeSkillDescRows(skillDescTxt.headers, skillDescTxt.rows, placements, descSynergyUpdates);

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

    const skillsTxtContent = serializeTxtFile(skillsTxt.headers, skillsTxt.rows);
    const skillDescTxtContent = serializeTxtFile(skillDescTxt.headers, skillDescTxt.rows);

    // Always load skill strings so all skills (including Warlock) have description text.
    // Under Normal Logic, additionally rewrite weapon-type references in the strings.
    const skillStrings = loadSkillStrings();
    if (logic === 'normal') {
      writeSkillStrings(skillStrings, skillDescStrNames, placements);
    }

    // Override SkillCategoryXxN tab titles to "Random 1/2/3" for all 8 classes.
    // These keys in skills.json drive the in-tree tab label display in D2R.
    // Suffix 1/2/3 maps directly to SkillPage (left/middle/right tab).
    const SKILL_CATEGORY_OVERRIDES: Record<string, string> = {
      SkillCategoryAm1: 'Random 1', SkillCategoryAm2: 'Random 2', SkillCategoryAm3: 'Random 3',
      SkillCategorySo1: 'Random 1', SkillCategorySo2: 'Random 2', SkillCategorySo3: 'Random 3',
      SkillCategoryNe1: 'Random 1', SkillCategoryNe2: 'Random 2', SkillCategoryNe3: 'Random 3',
      SkillCategoryPa1: 'Random 1', SkillCategoryPa2: 'Random 2', SkillCategoryPa3: 'Random 3',
      SkillCategoryBa1: 'Random 1', SkillCategoryBa2: 'Random 2', SkillCategoryBa3: 'Random 3',
      SkillCategoryDr1: 'Random 1', SkillCategoryDr2: 'Random 2', SkillCategoryDr3: 'Random 3',
      SkillCategoryAs1: 'Random 1', SkillCategoryAs2: 'Random 2', SkillCategoryAs3: 'Random 3',
      SkillCategoryWa1: 'Random 3', SkillCategoryWa2: 'Random 2', SkillCategoryWa3: 'Random 1',
    };
    for (const [key, text] of Object.entries(SKILL_CATEGORY_OVERRIDES)) {
      const entry = skillStrings.find(e => e.Key === key);
      if (entry) entry.enUS = text;
    }

    // Serialize with BOM + CRLF to match D2R's expected JSON string file format.
    const skillStringsJson = '\uFEFF' + JSON.stringify(skillStrings, null, 2).replace(/\n/g, '\r\n');

    // Load item-modifiers.json as-is (static pass-through — StrSklTabItemN values are for
    // item affix display only, not tab titles; no modification needed).
    let itemModifiersJson: string | undefined;
    const itemModifiersPath = path.join(DATA_DIR, 'local', 'strings', 'item-modifiers.json');
    if (fs.existsSync(itemModifiersPath)) {
      itemModifiersJson = fs.readFileSync(itemModifiersPath, 'utf-8');
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
    const charstatsPath = path.join(DATA_DIR, 'txt', 'charstats.txt');
    if (fs.existsSync(charstatsPath)) {
      const charstats = loadTxtFile('charstats.txt');
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

      // Starting items: add Teleport Staff to inventory for all classes
      if (startingTeleportStaff) {
        applyTeleportStaff(charstats.headers, charstats.rows);

        const uiPath = path.join(DATA_DIR, 'txt', 'uniqueitems.txt');
        if (fs.existsSync(uiPath)) {
          const ui = loadTxtFile('uniqueitems.txt');
          const uiRows = applyTeleportStaffUnique(ui.headers, ui.rows, teleportStaffLevel);
          uniqueitemsTxt = serializeTxtFile(ui.headers, uiRows);
        }
      }

      charstatsTxt = serializeTxtFile(charstats.headers, charstats.rows);
    }

    // Step 10: Build tree sprites
    const treeSprites = buildAllTreeSprites(treeAssignments);
    clearSpriteCache();

    // Step 11: Build icon sprites
    // Build original IconCel lookup from skilldesc data
    const skillDescIconCels = new Map<string, number>();
    for (const [name, desc] of skillDescs.entries()) {
      skillDescIconCels.set(name, desc.IconCel);
    }

    const iconSprites = await buildAllIconSprites(placementsByClass, skillDescIconCels);

    // Step 11b: Scale monstats for players simulation (if enabled and count > 1)
    let monstatsTxt: string | undefined;
    if (playersEnabled && playersCount > 1) {
      const monstatsTxtPath = path.join(DATA_DIR, 'txt', 'monstats.txt');
      if (fs.existsSync(monstatsTxtPath)) {
        const monstats = loadTxtFile('monstats.txt');
        const scaledRows = scaleMonstats(monstats.headers, monstats.rows, playersCount, playersActs);
        monstatsTxt = serializeTxtFile(monstats.headers, scaledRows);
      }
    }

    // Step 12: Build zip
    const zipBuffer = await buildZip({
      skillsTxt: skillsTxtContent,
      skillDescTxt: skillDescTxtContent,
      treeSprites,
      iconSprites,
      skillStringsJson,
      charstatsTxt,
      itemModifiersJson,
      monstatsTxt,
      uniqueitemsTxt,
      itemNamesJson,
    });

    // Limit cache size before inserting (evict oldest entry if at capacity)
    if (zipCache.size >= 10) {
      const firstKey = zipCache.keys().next().value;
      if (firstKey !== undefined) zipCache.delete(firstKey);
    }

    // Cache the result
    zipCache.set(cacheKey, zipBuffer);

    return NextResponse.json({ seed, status: 'ready' });
  } catch (error) {
    console.error('Randomize error:', error);
    return NextResponse.json(
      { error: 'Failed to generate mod', details: String(error) },
      { status: 500 },
    );
  }
}
