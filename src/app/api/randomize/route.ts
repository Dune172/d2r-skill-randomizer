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
import { shuffleActs, actShuffleSeed } from '@/lib/randomizer/act-shuffler';
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
    const actShuffle = body.actShuffle === true;
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
    const cacheKey = makeCacheKey(seed, effectivePlayers, teleportStaffLevel, effectiveActs, logic, actShuffle);
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

    // Step 11b: Modify monstats (players scaling and/or act shuffle)
    let monstatsTxt: string | undefined;
    let actOrder: number[] | undefined;
    if ((playersEnabled && playersCount > 1) || actShuffle) {
      const monstatsTxtPath = path.join(DATA_DIR, 'txt', 'monstats.txt');
      if (fs.existsSync(monstatsTxtPath)) {
        const monstats = loadTxtFile('monstats.txt');
        let rows = monstats.rows;

        // 1. Players scaling (runs first)
        if (playersEnabled && playersCount > 1) {
          rows = scaleMonstats(monstats.headers, rows, playersCount, playersActs);
        }

        // 2. Act shuffle (runs after players scaling so effects compound)
        if (actShuffle) {
          const actRng = createRNG(actShuffleSeed(seed));
          const result = shuffleActs(actRng, monstats.headers, rows);
          rows = result.rows;
          actOrder = result.actOrder;
        }

        monstatsTxt = serializeTxtFile(monstats.headers, rows);
      }
    }

    // Step 11c: Reorder actinfo.txt to match act shuffle permutation
    // This changes where new characters spawn and which waypoints each act offers.
    let actinfoTxt: string | undefined;
    if (actShuffle && actOrder) {
      const actinfoPath = path.join(DATA_DIR, 'txt', 'actinfo.txt');
      if (fs.existsSync(actinfoPath)) {
        const actinfo = loadTxtFile('actinfo.txt');
        const actColIdx = actinfo.headers.indexOf('act');
        // Reorder rows: engine act slot i gets the content of original act actOrder[i]
        const newRows = actOrder.map((originalAct, i) => {
          const srcRow = [...actinfo.rows[originalAct - 1]];
          if (actColIdx !== -1) srcRow[actColIdx] = String(i + 1); // preserve 1-based act id

          // Act 4 has only 3 waypoints (waypoint1–3); slots 4–9 are empty.
          // When Act 4 lands in position 1, the engine may read all 9 waypoint slots
          // unconditionally and null-dereference on empty entries → crash after moving.
          // Fill any empty waypoint slots with the town waypoint as a safe placeholder.
          if (i === 0) {
            const wp1ColIdx = actinfo.headers.indexOf('waypoint1');
            const townWaypoint = wp1ColIdx !== -1 ? srcRow[wp1ColIdx] : '';
            if (townWaypoint) {
              for (let wpNum = 2; wpNum <= 9; wpNum++) {
                const wpColIdx = actinfo.headers.indexOf(`waypoint${wpNum}`);
                if (wpColIdx !== -1 && !srcRow[wpColIdx]) {
                  srcRow[wpColIdx] = townWaypoint;
                }
              }
            }
          }

          return srcRow;
        });
        actinfoTxt = serializeTxtFile(actinfo.headers, newRows);
      }
    }

    // Step 11d: Remap Act columns in all act-keyed data files to match the shuffle permutation.
    // actinfo.txt and every file with an Act column must be consistent or the engine crashes.
    let levelsTxt: string | undefined;
    let lvltypesTxt: string | undefined;
    let hirelingTxt: string | undefined;
    let monpresetTxt: string | undefined;
    let objpresetTxt: string | undefined;

    if (actShuffle && actOrder) {
      // 0-indexed map: original act value (0–4) → new position (0–4)  [for levels.txt]
      const actMap0: Record<number, number> = {};
      // 1-indexed map: original act value (1–5) → new position (1–5)  [for lvltypes/hireling/etc.]
      const actMap1: Record<number, number> = {};
      for (let i = 0; i < actOrder.length; i++) {
        actMap0[actOrder[i] - 1] = i;       // actOrder is 1-based; positions are 0-based
        actMap1[actOrder[i]] = i + 1;        // both sides 1-based
      }

      const remapActFile = (filename: string, actMap: Record<number, number>): string | undefined => {
        const filePath = path.join(DATA_DIR, 'txt', filename);
        if (!fs.existsSync(filePath)) return undefined;
        const data = loadTxtFile(filename);
        const actColIdx = data.headers.indexOf('Act');
        if (actColIdx === -1) return undefined;
        const newRows = data.rows.map(row => {
          const actVal = parseInt(row[actColIdx], 10);
          if (isNaN(actVal) || actMap[actVal] === undefined) return row;
          const newRow = [...row];
          newRow[actColIdx] = String(actMap[actVal]);
          return newRow;
        });
        return serializeTxtFile(data.headers, newRows);
      };

      // Remap levels.txt: both the Act column (0-indexed) and the Waypoint column.
      // When acts are shuffled, waypoint indices must shift so that bit 0 always
      // corresponds to the starting town (position 1), preventing a save-file crash.
      {
        const ACT_WP_COUNT: Record<number, number> = {1: 9, 2: 9, 3: 9, 4: 3, 5: 9};
        const ACT_WP_BASE_ORIG: Record<number, number> = {1: 0, 2: 9, 3: 18, 4: 27, 5: 30};

        // Compute new waypoint base for each act based on its shuffled position
        let wpCum = 0;
        const newWpBase: Record<number, number> = {};
        for (const act of actOrder) {
          newWpBase[act] = wpCum;
          wpCum += ACT_WP_COUNT[act];
        }

        const data = loadTxtFile('levels.txt');
        const actColIdx = data.headers.indexOf('Act');
        const wpColIdx  = data.headers.indexOf('Waypoint');
        const newRows = data.rows.map(row => {
          const newRow = [...row];

          // Remap Act (0-indexed)
          if (actColIdx !== -1) {
            const actVal = parseInt(row[actColIdx], 10);
            if (!isNaN(actVal) && actMap0[actVal] !== undefined) {
              newRow[actColIdx] = String(actMap0[actVal]);
            }
          }

          // Remap Waypoint (skip empty or 255 = "no waypoint" sentinel)
          if (wpColIdx !== -1) {
            const wpStr = row[wpColIdx];
            if (wpStr !== '' && wpStr !== '255') {
              const wpIdx = parseInt(wpStr, 10);
              if (!isNaN(wpIdx)) {
                // Determine which original act owns this waypoint index
                let origAct: number | null = null;
                for (const [aStr, base] of Object.entries(ACT_WP_BASE_ORIG)) {
                  const a = parseInt(aStr);
                  if (wpIdx >= base && wpIdx < base + ACT_WP_COUNT[a]) {
                    origAct = a; break;
                  }
                }
                if (origAct !== null) {
                  const offset = wpIdx - ACT_WP_BASE_ORIG[origAct];
                  newRow[wpColIdx] = String(newWpBase[origAct] + offset);
                }
              }
            }
          }

          return newRow;
        });
        levelsTxt = serializeTxtFile(data.headers, newRows);
      }
      lvltypesTxt  = remapActFile('lvltypes.txt',  actMap1);
      hirelingTxt  = remapActFile('hireling.txt',  actMap1);
      monpresetTxt = remapActFile('monpreset.txt', actMap1);
      objpresetTxt = remapActFile('objpreset.txt', actMap1);
    }

    // Step 11e: Remap TC act numbers in superuniques.txt.
    // Superuniques have TC columns like "Act 4 Super A" that must reflect the new
    // difficulty position, not the original act number. Uses same actMap1 as Step 11d.
    let superuniquesTxt: string | undefined;
    if (actShuffle && actOrder) {
      const suPath = path.join(DATA_DIR, 'txt', 'superuniques.txt');
      if (fs.existsSync(suPath)) {
        const su = loadTxtFile('superuniques.txt');
        const SU_TC_COLS = ['TC', 'TC Desecrated', 'TC(N)', 'TC(N) Desecrated', 'TC(H)', 'TC(H) Desecrated'];
        const ACT_TC_RE = /^(Act )(\d)/;
        // Rebuild actMap1 (same formula as Step 11d; actOrder is still in scope)
        const suActMap1: Record<number, number> = {};
        for (let i = 0; i < actOrder.length; i++) {
          suActMap1[actOrder[i]] = i + 1;
        }
        const suRows = su.rows.map(row => {
          const newRow = [...row];
          for (const colName of SU_TC_COLS) {
            const idx = su.headers.indexOf(colName);
            if (idx === -1) continue;
            const tc = newRow[idx];
            if (!tc) continue;
            newRow[idx] = tc.replace(ACT_TC_RE, (_, prefix, digit) => {
              const origAct = parseInt(digit, 10);
              return suActMap1[origAct] !== undefined
                ? `${prefix}${suActMap1[origAct]}`
                : _;
            });
          }
          return newRow;
        });
        superuniquesTxt = serializeTxtFile(su.headers, suRows);
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
      actinfoTxt,
      levelsTxt,
      lvltypesTxt,
      hirelingTxt,
      monpresetTxt,
      objpresetTxt,
      superuniquesTxt,
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

    return NextResponse.json({ seed, status: 'ready', ...(actOrder ? { actOrder } : {}) });
  } catch (error) {
    console.error('Randomize error:', error);
    return NextResponse.json(
      { error: 'Failed to generate mod', details: String(error) },
      { status: 500 },
    );
  }
}
