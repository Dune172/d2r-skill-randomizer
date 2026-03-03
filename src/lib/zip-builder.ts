import archiver from 'archiver';
import { ClassCode } from './randomizer/types';
import { CLASS_BY_CODE, CLASS_DEFS } from './randomizer/config';

export interface ZipContents {
  modName: string;
  skillsTxt: string;
  skillDescTxt: string;
  treeSprites: Map<string, Buffer>; // filename → sprite buffer
  iconSprites: Map<string, Buffer>; // filename → sprite buffer
  skillStringsJson?: string;        // skills string table (always included)
  charstatsTxt?: string;            // charstats with randomised StartSkill per class
  itemModifiersJson?: string;       // skill tab label strings (StrSklTabItem1–24)
  monstatsTxt?: string;             // monstats with HP/Exp scaled for players simulation
  uniqueitemsTxt?: string;          // uniqueitems with Teleport Staff added
  itemNamesJson?: string;           // item-names strings (display name for unique staff)
  hirelingTxt?: string;             // hireling.txt with randomized auras
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
 * Structure matches D2R mod format — modinfo.json at the mod root, all data
 * files under the required {modName}.mpq subfolder:
 *   {modName}/{modName}.mpq/modinfo.json
 *   {modName}/{modName}.mpq/data/global/excel/skills.txt
 *   {modName}/{modName}.mpq/data/global/excel/skilldesc.txt
 *   {modName}/{modName}.mpq/data/hd/global/ui/spells/skill_trees/{prefix}skilltree.sprite
 *   {modName}/{modName}.mpq/data/hd/global/ui/spells/skill_trees/{prefix}skilltree.lowend.sprite
 *   {modName}/{modName}.mpq/data/global/ui/spells/{classname}/{prefix}skillicon.sprite
 */
export async function buildZip(contents: ZipContents): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    const m = contents.modName;
    const d = `${m}/${m}.mpq`; // data root — D2R requires this subfolder name

    // Add modinfo.json
    const modinfo = JSON.stringify({
      name: m,
      version: "1.0",
      description: "Randomized skill trees across all classes",
      author: "Stephen",
      d2rmmVersion: "1.5.0",
    }, null, 2);
    archive.append(modinfo, { name: `${d}/modinfo.json` });

    // Add text files
    archive.append(contents.skillsTxt, { name: `${d}/data/global/excel/skills.txt` });
    archive.append(contents.skillDescTxt, { name: `${d}/data/global/excel/skilldesc.txt` });

    // Skill string table (always included — ensures all skills have description text)
    if (contents.skillStringsJson) {
      archive.append(contents.skillStringsJson, { name: `${d}/data/local/lng/strings/skills.json` });
    }

    // Charstats with randomised StartSkill per class
    if (contents.charstatsTxt) {
      archive.append(contents.charstatsTxt, { name: `${d}/data/global/excel/charstats.txt` });
    }

    // Skill tab label strings (StrSklTabItem1–24 for all 8 classes)
    if (contents.itemModifiersJson) {
      archive.append(contents.itemModifiersJson, { name: `${d}/data/local/lng/strings/item-modifiers.json` });
    }

    // Hireling auras
    if (contents.hirelingTxt) {
      archive.append(contents.hirelingTxt, { name: `${d}/data/global/excel/hireling.txt` });
    }

    // Monster stats scaled for players simulation
    if (contents.monstatsTxt) {
      archive.append(contents.monstatsTxt, { name: `${d}/data/global/excel/monstats.txt` });
    }

    // Unique items with Teleport Staff added
    if (contents.uniqueitemsTxt) {
      archive.append(contents.uniqueitemsTxt, { name: `${d}/data/global/excel/uniqueitems.txt` });
    }

    // Item name strings (display name for unique staff)
    if (contents.itemNamesJson) {
      archive.append(contents.itemNamesJson, { name: `${d}/data/local/lng/strings/item-names.json` });
    }

    // Add tree sprites (hd path)
    for (const [filename, buf] of contents.treeSprites.entries()) {
      archive.append(buf, { name: `${d}/data/hd/global/ui/spells/skill_trees/${filename}` });
    }

    // Add icon sprites to both non-hd and hd paths
    for (const [filename, buf] of contents.iconSprites.entries()) {
      const prefix = filename.replace('skillicon.sprite', '');
      const folderName = PREFIX_TO_FOLDER[prefix];
      if (folderName) {
        archive.append(buf, {
          name: `${d}/data/global/ui/spells/${folderName}/${filename}`,
        });
        archive.append(buf, {
          name: `${d}/data/hd/global/ui/spells/${folderName}/${filename}`,
        });
      }
    }

    archive.finalize();
  });
}
