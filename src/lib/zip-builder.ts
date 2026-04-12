import AdmZip from 'adm-zip';
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
  treasureClassExTxt?: string;      // treasureclassex with Blood Raven quest drop TC
  superuniquesTxt?: string;         // superuniques with Blood Raven entry pointing to TC
  itemNamesJson?: string;           // item-names strings (display name for unique staff)
  hirelingTxt?: string;             // hireling.txt with randomized auras
  hireableSprite?: Buffer;          // hireable sprite for mercenary hiring panel icons
  chatPanelJson?: string;           // chatpanel.json with input disabled (optional)
  chatPanelHdJson?: string;         // chatpanelhd.json with input disabled (optional)
  magicPrefixTxt?: string;          // magicprefix.txt with remapped class-skill affixes
  magicSuffixTxt?: string;          // magicsuffix.txt with remapped class-skill affixes
  itemtypesTxt?: string;            // itemtypes.txt with StaffMods set for all class item types
  dataVersionBuild?: string;        // DataVersionBuild.txt — prevents version mismatch prompt
  armorTxt?: string;                // armor.txt modified by weekly mutations
  weaponsTxt?: string;              // weapons.txt modified by weekly mutations
  experienceTxt?: string;           // experience.txt modified by weekly mutations
  miscTxt?: string;                 // misc.txt modified by weekly mutations (e.g. antidote potion cost)
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
 * Build the mod zip file as a Buffer using pure-JS adm-zip (no native threads).
 * Structure matches D2R mod format — modinfo.json at the mod root, all data
 * files under the required {modName}.mpq subfolder:
 *   {modName}/{modName}.mpq/modinfo.json
 *   {modName}/{modName}.mpq/data/global/excel/skills.txt
 *   {modName}/{modName}.mpq/data/global/excel/skilldesc.txt
 *   {modName}/{modName}.mpq/data/hd/global/ui/spells/skill_trees/{prefix}skilltree.sprite
 *   {modName}/{modName}.mpq/data/hd/global/ui/spells/skill_trees/{prefix}skilltree.lowend.sprite
 *   {modName}/{modName}.mpq/data/global/ui/spells/{classname}/{prefix}skillicon.sprite
 */
export function buildZip(contents: ZipContents): Buffer {
  const zip = new AdmZip();
  const m = contents.modName;
  const d = `${m}/${m}.mpq`; // data root — D2R requires this subfolder name

  const str = (s: string) => Buffer.from(s, 'utf-8');

  // Add modinfo.json
  const modinfo = JSON.stringify({ name: m, savepath: 'D2RRandomizer' });
  zip.addFile(`${d}/modinfo.json`, str(modinfo));

  // Add text files
  zip.addFile(`${d}/data/global/excel/skills.txt`, str(contents.skillsTxt));
  zip.addFile(`${d}/data/global/excel/skilldesc.txt`, str(contents.skillDescTxt));

  // Skill string table — include in both current and legacy paths so D2R
  // resolves skill names for proc items regardless of which path it uses.
  if (contents.skillStringsJson) {
    zip.addFile(`${d}/data/local/lng/strings/skills.json`, str(contents.skillStringsJson));
    zip.addFile(`${d}/data/local/lng/strings-legacy/skills.json`, str(contents.skillStringsJson));
  }

  // Charstats with randomised StartSkill per class
  if (contents.charstatsTxt) {
    zip.addFile(`${d}/data/global/excel/charstats.txt`, str(contents.charstatsTxt));
  }

  // Skill tab label strings (StrSklTabItem1–24 for all 8 classes)
  if (contents.itemModifiersJson) {
    zip.addFile(`${d}/data/local/lng/strings/item-modifiers.json`, str(contents.itemModifiersJson));
  }

  // Hireling auras
  if (contents.hirelingTxt) {
    zip.addFile(`${d}/data/global/excel/hireling.txt`, str(contents.hirelingTxt));
  }

  // Monster stats scaled for players simulation
  if (contents.monstatsTxt) {
    zip.addFile(`${d}/data/global/excel/monstats.txt`, str(contents.monstatsTxt));
  }

  // Unique items with Teleport Staff added
  if (contents.uniqueitemsTxt) {
    zip.addFile(`${d}/data/global/excel/uniqueitems.txt`, str(contents.uniqueitemsTxt));
  }

  // Treasure class for Blood Raven quest drop
  if (contents.treasureClassExTxt) {
    zip.addFile(`${d}/data/global/excel/treasureclassex.txt`, str(contents.treasureClassExTxt));
  }

  // Super uniques with Blood Raven entry
  if (contents.superuniquesTxt) {
    zip.addFile(`${d}/data/global/excel/superuniques.txt`, str(contents.superuniquesTxt));
  }

  // Item name strings (display name for unique staff)
  if (contents.itemNamesJson) {
    zip.addFile(`${d}/data/local/lng/strings/item-names.json`, str(contents.itemNamesJson));
  }

  // Magic affix files with remapped class-skill references
  if (contents.magicPrefixTxt) {
    zip.addFile(`${d}/data/global/excel/magicprefix.txt`, str(contents.magicPrefixTxt));
  }
  if (contents.magicSuffixTxt) {
    zip.addFile(`${d}/data/global/excel/magicsuffix.txt`, str(contents.magicSuffixTxt));
  }
  if (contents.itemtypesTxt) {
    zip.addFile(`${d}/data/global/excel/itemtypes.txt`, str(contents.itemtypesTxt));
  }

  // Data version file — prevents "out of date data" prompt on startup
  if (contents.dataVersionBuild) {
    zip.addFile(`${d}/data/global/DataVersionBuild.txt`, str(contents.dataVersionBuild));
  }

  // Weekly mutation files
  if (contents.armorTxt) {
    zip.addFile(`${d}/data/global/excel/armor.txt`, str(contents.armorTxt));
  }
  if (contents.weaponsTxt) {
    zip.addFile(`${d}/data/global/excel/weapons.txt`, str(contents.weaponsTxt));
  }
  if (contents.experienceTxt) {
    zip.addFile(`${d}/data/global/excel/experience.txt`, str(contents.experienceTxt));
  }
  if (contents.miscTxt) {
    zip.addFile(`${d}/data/global/excel/misc.txt`, str(contents.miscTxt));
  }

  // Disable chat input to prevent /players x commands (optional)
  if (contents.chatPanelJson) {
    zip.addFile(`${d}/data/global/ui/layouts/chatpanel.json`, str(contents.chatPanelJson));
  }
  if (contents.chatPanelHdJson) {
    zip.addFile(`${d}/data/global/ui/layouts/chatpanelhd.json`, str(contents.chatPanelHdJson));
  }

  // Add tree sprites (hd path)
  for (const [filename, buf] of contents.treeSprites.entries()) {
    zip.addFile(`${d}/data/hd/global/ui/spells/skill_trees/${filename}`, buf);
  }

  // Add hireable sprite to both non-hd and hd paths
  if (contents.hireableSprite) {
    const HIREABLE_FILENAME = 'hrskillicon.sprite';
    zip.addFile(`${d}/data/global/ui/spells/hireables/${HIREABLE_FILENAME}`, contents.hireableSprite);
    zip.addFile(`${d}/data/hd/global/ui/spells/hireables/${HIREABLE_FILENAME}`, contents.hireableSprite);
  }

  // Add icon sprites to both non-hd and hd paths
  for (const [filename, buf] of contents.iconSprites.entries()) {
    const prefix = filename.replace('skillicon.sprite', '');
    const folderName = PREFIX_TO_FOLDER[prefix];
    if (folderName) {
      zip.addFile(`${d}/data/global/ui/spells/${folderName}/${filename}`, buf);
      zip.addFile(`${d}/data/hd/global/ui/spells/${folderName}/${filename}`, buf);
    }
  }

  return zip.toBuffer();
}
