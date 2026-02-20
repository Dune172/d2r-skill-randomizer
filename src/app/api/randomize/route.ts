import { NextRequest, NextResponse } from 'next/server';
import { createRNG, seedFromString } from '@/lib/randomizer/seed';
import { loadTreeGrid, loadSkills, loadSkillDescs, loadTxtFile, serializeTxtFile, loadSkillStrings } from '@/lib/data-loader';
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
import { getZipCache } from '@/lib/zip-cache';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const seedInput = body.seed;
    const enablePrereqs = body.enablePrereqs !== false; // default true
    const logic: 'minimal' | 'normal' = body.logic === 'normal' ? 'normal' : 'minimal';

    if (!seedInput && seedInput !== 0) {
      return NextResponse.json({ error: 'Seed is required' }, { status: 400 });
    }

    const seed = typeof seedInput === 'number' ? seedInput : seedFromString(String(seedInput));
    const zipCache = getZipCache();

    // Check cache
    if (zipCache.has(seed)) {
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

    const skillsTxtContent = serializeTxtFile(skillsTxt.headers, skillsTxt.rows);
    const skillDescTxtContent = serializeTxtFile(skillDescTxt.headers, skillDescTxt.rows);

    // Normal Logic: update skill names and descriptions in the string table
    let skillStringsJson: string | undefined;
    if (logic === 'normal') {
      const skillStrings = loadSkillStrings();
      writeSkillStrings(skillStrings, skillDescStrNames, placements);
      skillStringsJson = JSON.stringify(skillStrings, null, 2);
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

    // Step 12: Build zip
    const zipBuffer = await buildZip({
      skillsTxt: skillsTxtContent,
      skillDescTxt: skillDescTxtContent,
      treeSprites,
      iconSprites,
      skillStringsJson,
    });

    // Limit cache size before inserting (evict oldest entry if at capacity)
    if (zipCache.size >= 10) {
      const firstKey = zipCache.keys().next().value;
      if (firstKey !== undefined) zipCache.delete(firstKey);
    }

    // Cache the result
    zipCache.set(seed, zipBuffer);

    return NextResponse.json({ seed, status: 'ready' });
  } catch (error) {
    console.error('Randomize error:', error);
    return NextResponse.json(
      { error: 'Failed to generate mod', details: String(error) },
      { status: 500 },
    );
  }
}
