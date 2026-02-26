import archiver from 'archiver';
import { ClassCode } from './randomizer/types';
import { CLASS_BY_CODE, CLASS_DEFS } from './randomizer/config';

export interface ZipContents {
  skillsTxt: string;
  skillDescTxt: string;
  treeSprites: Map<string, Buffer>; // filename → sprite buffer
  iconSprites: Map<string, Buffer>; // filename → sprite buffer
  skillStringsJson?: string;        // skills string table (always included)
  charstatsTxt?: string;            // charstats with randomised StartSkill per class
  itemModifiersJson?: string;       // skill tab label strings (StrSklTabItem1–24)
  monstatsTxt?: string;             // monstats with HP/Exp scaled for players simulation
  actinfoTxt?: string;              // actinfo reordered to match act shuffle permutation
  levelsTxt?: string;               // levels with Act column remapped to match act shuffle
  lvltypesTxt?: string;             // lvltypes with Act column remapped to match act shuffle
  hirelingTxt?: string;             // hireling with Act column remapped to match act shuffle
  monpresetTxt?: string;            // monpreset with Act column remapped to match act shuffle
  objpresetTxt?: string;            // objpreset with Act column remapped to match act shuffle
  uniqueitemsTxt?: string;          // uniqueitems with Teleport Staff added
  itemNamesJson?: string;           // item-names strings (display name for unique staff)
}

// Map sprite prefix to full folder name used in D2R mod paths
const PREFIX_TO_FOLDER: Record<string, string> = {
  am: 'amazon',
  so: 'sorceress',
  ne: 'necromancer',
  pa: 'paladin',
  ba: 'barbarian',
  dr: 'druid',
  as: 'assassin',
  wa: 'warlock',
};

/**
 * Build the mod zip file as a Buffer.
 * Structure matches D2R mod format (rooted under mod/):
 *   mod/modinfo.json
 *   mod/data/global/excel/skills.txt
 *   mod/data/global/excel/skilldesc.txt
 *   mod/data/hd/global/ui/spells/skill_trees/{prefix}skilltree.sprite
 *   mod/data/hd/global/ui/spells/skill_trees/{prefix}skilltree.lowend.sprite
 *   mod/data/global/ui/spells/{classname}/{prefix}skillicon.sprite
 */
export async function buildZip(contents: ZipContents): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    // Add modinfo.json
    const modinfo = JSON.stringify({
      name: "d2r-skill-randomizer",
      version: "1.0",
      description: "Randomized skill trees across all classes",
      author: "Stephen",
      d2rmmVersion: "1.5.0",
    }, null, 2);
    archive.append(modinfo, { name: 'mod/modinfo.json' });

    // Add text files
    archive.append(contents.skillsTxt, { name: 'mod/data/global/excel/skills.txt' });
    archive.append(contents.skillDescTxt, { name: 'mod/data/global/excel/skilldesc.txt' });

    // Skill string table (always included — ensures all skills have description text)
    if (contents.skillStringsJson) {
      archive.append(contents.skillStringsJson, { name: 'mod/data/local/lng/strings/skills.json' });
    }

    // Charstats with randomised StartSkill per class
    if (contents.charstatsTxt) {
      archive.append(contents.charstatsTxt, { name: 'mod/data/global/excel/charstats.txt' });
    }

    // Skill tab label strings (StrSklTabItem1–24 for all 8 classes)
    if (contents.itemModifiersJson) {
      archive.append(contents.itemModifiersJson, { name: 'mod/data/local/lng/strings/item-modifiers.json' });
    }

    // Monster stats scaled for players simulation
    if (contents.monstatsTxt) {
      archive.append(contents.monstatsTxt, { name: 'mod/data/global/excel/monstats.txt' });
    }

    // Act info reordered to match act shuffle permutation (spawn points + waypoints)
    if (contents.actinfoTxt) {
      archive.append(contents.actinfoTxt, { name: 'mod/data/global/excel/actinfo.txt' });
    }

    // Levels with Act column remapped to match act shuffle (must be consistent with actinfo)
    if (contents.levelsTxt) {
      archive.append(contents.levelsTxt, { name: 'mod/data/global/excel/levels.txt' });
    }
    if (contents.lvltypesTxt) {
      archive.append(contents.lvltypesTxt, { name: 'mod/data/global/excel/lvltypes.txt' });
    }
    if (contents.hirelingTxt) {
      archive.append(contents.hirelingTxt, { name: 'mod/data/global/excel/hireling.txt' });
    }
    if (contents.monpresetTxt) {
      archive.append(contents.monpresetTxt, { name: 'mod/data/global/excel/monpreset.txt' });
    }
    if (contents.objpresetTxt) {
      archive.append(contents.objpresetTxt, { name: 'mod/data/global/excel/objpreset.txt' });
    }

    // Unique items with Teleport Staff added
    if (contents.uniqueitemsTxt) {
      archive.append(contents.uniqueitemsTxt, { name: 'mod/data/global/excel/uniqueitems.txt' });
    }

    // Item name strings (display name for unique staff)
    if (contents.itemNamesJson) {
      archive.append(contents.itemNamesJson, { name: 'mod/data/local/lng/strings/item-names.json' });
    }

    // Add tree sprites (hd path)
    for (const [filename, buf] of contents.treeSprites.entries()) {
      archive.append(buf, { name: `mod/data/hd/global/ui/spells/skill_trees/${filename}` });
    }

    // Add icon sprites to both non-hd and hd paths
    for (const [filename, buf] of contents.iconSprites.entries()) {
      const prefix = filename.replace('skillicon.sprite', '');
      const folderName = PREFIX_TO_FOLDER[prefix];
      if (folderName) {
        archive.append(buf, {
          name: `mod/data/global/ui/spells/${folderName}/${filename}`,
        });
        archive.append(buf, {
          name: `mod/data/hd/global/ui/spells/${folderName}/${filename}`,
        });
      }
    }

    archive.finalize();
  });
}
