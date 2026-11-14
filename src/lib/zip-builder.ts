import AdmZip from 'adm-zip';
import { createD2RShortcut } from './lnk-builder';

export interface ZipContents {
  modName: string;
  seed: number;
  raceMode: boolean;
  savepath?: string;                // save folder in modinfo.json; defaults to the shared 'D2RRandomizer'
  baseGame?: boolean;               // tables go to data/global/excel/base/ (games without Reign of the Warlock)
  readmeNote?: readonly string[];   // extra README.txt lines (base-game mods say which characters to play)
  skillsTxt: string;
  skillDescTxt: string;
  treeSprites: Map<string, Buffer>; // filename → sprite buffer
  controllerTreeSprites?: Map<string, Buffer>; // controller-mode tree sprites (different dimensions, different output path)
  controllerSkillSettingsJson?: string; // gamepad per-skill behavior, remapped to the shuffled skills.txt rows
  iconSprites: Map<string, Buffer>; // filename → sprite buffer
  skillStringsJson?: string;        // skills string table (always included)
  charstatsTxt?: string;            // charstats with randomised StartSkill per class
  itemModifiersJson?: string;       // skill tab label strings (StrSklTabItem1–24)
  monstatsTxt?: string;             // monstats with HP/Exp scaled for players simulation
  monsterGraphicsJson?: string;     // HD asset aliases for generated enemy IDs
  enemyManifestJson?: string;       // inspectable roster and balance report (outside game data)
  inventorySpellsJson?: string;     // experimental inventory spell catalogue and playtest notes
  globalSkillIcons?: Map<string, Buffer>; // paths under data/, shared oskill sheets in HD/lowend/legacy
  inventorySpellAssets?: Map<string, Buffer>; // spell-only art aliases and native inventory tint rules
  itemGraphicsJson?: string;       // HD base item aliases for mutation shop stock
  uniqueGraphicsJson?: string;     // HD scroll/book aliases for mutation uniques
  cubemainTxt?: string;            // original recipes plus mutation consolidation
  objectsTxt?: string;             // bookcase loot behavior for Forgotten Arts
  itemStatCostTxt?: string;        // signed level-requirement offsets for spell charms
  propertiesTxt?: string;         // cosmetic spell synergy tooltip properties
  missilesTxt?: string;            // private, owner-scaled projectiles for relocated enemies
  uniqueitemsTxt?: string;          // uniqueitems with Teleport Staff added
  setItemsTxt?: string;             // setitems.txt, rerolled and skill-remapped (item randomization only)
  setsTxt?: string;                 // sets.txt, rerolled and skill-remapped (item randomization only)
  runesTxt?: string;                // runes.txt (runewords), rerolled and skill-remapped (item randomization only)
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
  levelsTxt?: string;               // levels.txt modified by weekly mutations (monster density / special pack counts)
  gambleTxt?: string;               // gamble.txt — comprehensive gamble pool (House Always Wins only)
  animDataD2?: Buffer;              // animdata.d2 with Warlock A1/A2 records synced to their COFs
  charCofs?: Map<string, Buffer>;   // zip path under data/ → COF with injected trigger frame (must match animDataD2)
  seasonFiles?: Map<string, Buffer>; // seasonal HD overlay, paths under data/ (src/lib/seasons)
  questsJson?: string;              // quests.json with Open Acts quest-log hints
  openActsSpoilerJson?: string;     // quest-shuffle.json: where every Open Acts item is
  starterSaves?: Map<string, Buffer>; // Open Acts starter characters, file name → .d2s
  starterReadme?: string;           // how to install the starter characters
  mutationsJson?: string;           // mutations.json: the mutations the player picked
  apManifestJson?: string;          // Archipelago mode: what the companion client reads about this mod
  apLayoutFiles?: Map<string, Buffer>; // Archipelago mode: chat-panel layouts with the message box, paths under data/
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
 * files under the required {modName}.mpq subfolder.
 *
 * A mod players install by hand is FLAT: the zip's root is the mod folder itself
 * ({modName}.mpq/, the launch shortcut, README.txt and any spoiler files), and
 * /api/download names it {modName}.zip. Windows' Extract All then produces a
 * {modName} folder that goes straight into mods. The old nested layout made
 * Extract All produce d2rr_export_N\seedN\seedN.mpq, and moving the outer folder was
 * the most common install mistake on Discord.
 *
 * An Archipelago mod keeps the nested layout below ({modName}/ prefix): its
 * companion client installs it and only accepts entries under that folder.
 *
 * Nested layout:
 *   {modName}/{modName}.mpq/modinfo.json
 *   {modName}/{modName}.mpq/data/global/excel/skills.txt
 *   {modName}/{modName}.mpq/data/global/excel/skilldesc.txt
 *   {modName}/{modName}.mpq/data/hd/global/ui/spells/skill_trees/{prefix}skilltree.sprite
 *   {modName}/{modName}.mpq/data/hd/global/ui/spells/skill_trees/{prefix}skilltree.lowend.sprite
 *   {modName}/{modName}.mpq/data/hd/global/ui/controller/panel/spells/v2/{prefix}skilltree.sprite
 *   {modName}/{modName}.mpq/data/hd/global/excel/controllerskillsettings.json
 *   {modName}/{modName}.mpq/data/global/ui/spells/{classname}/{prefix}skillicon.sprite
 */
export function buildZip(contents: ZipContents): Buffer {
  const zip = new AdmZip();
  const m = contents.modName;
  // Flat unless the companion client installs it (see above).
  const root = contents.apManifestJson ? `${m}/` : '';
  const d = `${root}${m}.mpq`; // data root — D2R requires this subfolder name
  // Game tables (under data/). Reign of the Warlock games read global/excel/; Classic and
  // Lord of Destruction games, the only ones players without the DLC have, read
  // global/excel/base/. Everything else in the mod (art, strings) is shared by both.
  const xl = contents.baseGame ? 'global/excel/base' : 'global/excel';

  const str = (s: string) => Buffer.from(s, 'utf-8');

  if (contents.monsterGraphicsJson) {
    zip.addFile(`${d}/data/hd/character/monsters.json`, str(contents.monsterGraphicsJson));
  }
  if (contents.enemyManifestJson) {
    zip.addFile(`${root}enemy-shuffle.json`, str(contents.enemyManifestJson));
  }
  if (contents.inventorySpellsJson) {
    zip.addFile(`${root}forgotten-arts.json`, str(contents.inventorySpellsJson));
  }
  if (contents.questsJson) {
    zip.addFile(`${d}/data/local/lng/strings/quests.json`, str(contents.questsJson));
  }
  if (contents.mutationsJson) {
    zip.addFile(`${root}mutations.json`, str(contents.mutationsJson));
  }
  if (contents.openActsSpoilerJson) {
    zip.addFile(`${root}quest-shuffle.json`, str(contents.openActsSpoilerJson));
  }
  if (contents.starterSaves) {
    for (const [name, save] of contents.starterSaves) zip.addFile(`${root}starter-saves/${name}`, save);
    if (contents.starterReadme) zip.addFile(`${root}starter-saves/README.txt`, str(contents.starterReadme));
  }
  if (contents.globalSkillIcons) {
    for (const [relativePath, buffer] of contents.globalSkillIcons) {
      zip.addFile(`${d}/data/${relativePath}`, buffer);
    }
  }
  if (contents.apLayoutFiles) {
    for (const [relativePath, buffer] of contents.apLayoutFiles) {
      zip.addFile(`${d}/data/${relativePath}`, buffer);
    }
  }
  if (contents.inventorySpellAssets) {
    for (const [relativePath, buffer] of contents.inventorySpellAssets) {
      zip.addFile(`${d}/data/${relativePath}`, buffer);
    }
  }
  for (const [relativePath, value] of [
    ['hd/items/items.json', contents.itemGraphicsJson],
    ['hd/items/uniques.json', contents.uniqueGraphicsJson],
    [`${xl}/cubemain.txt`, contents.cubemainTxt],
    [`${xl}/objects.txt`, contents.objectsTxt],
    [`${xl}/itemstatcost.txt`, contents.itemStatCostTxt],
    [`${xl}/properties.txt`, contents.propertiesTxt],
  ]) {
    if (value) zip.addFile(`${d}/data/${relativePath}`, str(value));
  }
  if (contents.missilesTxt) {
    zip.addFile(`${d}/data/${xl}/missiles.txt`, str(contents.missilesTxt));
  }
  if (contents.seasonFiles) {
    for (const [relativePath, buffer] of contents.seasonFiles) {
      zip.addFile(`${d}/data/${relativePath}`, buffer);
    }
  }

  // Cache the complete download, including its seed/mode-specific launcher. An
  // Archipelago mod has none: its companion client installs the mod folder and starts
  // the game itself, and only accepts what belongs in that folder.
  if (!contents.apManifestJson) {
    zip.addFile(`D2R Randomizer ${contents.seed}.lnk`,
      createD2RShortcut(m, contents.seed >>> 0, contents.raceMode));
    zip.addFile('README.txt', str(installReadme(m, contents.readmeNote)));
  }

  // Beside the .mpq folder, not inside it: it is for the companion client, not the game.
  if (contents.apManifestJson) {
    zip.addFile(`${root}d2rr-ap-manifest.json`, str(contents.apManifestJson));
  }

  // Add modinfo.json
  const modinfo = JSON.stringify({ name: m, savepath: contents.savepath ?? 'D2RRandomizer' });
  zip.addFile(`${d}/modinfo.json`, str(modinfo));

  // Add text files
  zip.addFile(`${d}/data/${xl}/skills.txt`, str(contents.skillsTxt));
  zip.addFile(`${d}/data/${xl}/skilldesc.txt`, str(contents.skillDescTxt));

  // Skill string table — include in both current and legacy paths so D2R
  // resolves skill names for proc items regardless of which path it uses.
  if (contents.skillStringsJson) {
    zip.addFile(`${d}/data/local/lng/strings/skills.json`, str(contents.skillStringsJson));
    zip.addFile(`${d}/data/local/lng/strings-legacy/skills.json`, str(contents.skillStringsJson));
  }

  // Charstats with randomised StartSkill per class
  if (contents.charstatsTxt) {
    zip.addFile(`${d}/data/${xl}/charstats.txt`, str(contents.charstatsTxt));
  }

  // Skill tab label strings (StrSklTabItem1–24 for all 8 classes)
  if (contents.itemModifiersJson) {
    zip.addFile(`${d}/data/local/lng/strings/item-modifiers.json`, str(contents.itemModifiersJson));
  }

  // Hireling auras
  if (contents.hirelingTxt) {
    zip.addFile(`${d}/data/${xl}/hireling.txt`, str(contents.hirelingTxt));
  }

  // Monster stats scaled for players simulation
  if (contents.monstatsTxt) {
    zip.addFile(`${d}/data/${xl}/monstats.txt`, str(contents.monstatsTxt));
  }

  // Unique items with Teleport Staff added
  if (contents.setItemsTxt) zip.addFile(`${d}/data/${xl}/setitems.txt`, str(contents.setItemsTxt));
  if (contents.setsTxt) zip.addFile(`${d}/data/${xl}/sets.txt`, str(contents.setsTxt));
  if (contents.runesTxt) zip.addFile(`${d}/data/${xl}/runes.txt`, str(contents.runesTxt));
  if (contents.uniqueitemsTxt) {
    zip.addFile(`${d}/data/${xl}/uniqueitems.txt`, str(contents.uniqueitemsTxt));
  }

  // Treasure class for Blood Raven quest drop
  if (contents.treasureClassExTxt) {
    zip.addFile(`${d}/data/${xl}/treasureclassex.txt`, str(contents.treasureClassExTxt));
  }

  // Super uniques with Blood Raven entry
  if (contents.superuniquesTxt) {
    zip.addFile(`${d}/data/${xl}/superuniques.txt`, str(contents.superuniquesTxt));
  }

  // Item name strings (display name for unique staff)
  if (contents.itemNamesJson) {
    zip.addFile(`${d}/data/local/lng/strings/item-names.json`, str(contents.itemNamesJson));
  }

  // Magic affix files with remapped class-skill references
  if (contents.magicPrefixTxt) {
    zip.addFile(`${d}/data/${xl}/magicprefix.txt`, str(contents.magicPrefixTxt));
  }
  if (contents.magicSuffixTxt) {
    zip.addFile(`${d}/data/${xl}/magicsuffix.txt`, str(contents.magicSuffixTxt));
  }
  if (contents.itemtypesTxt) {
    zip.addFile(`${d}/data/${xl}/itemtypes.txt`, str(contents.itemtypesTxt));
  }

  // Data version file — prevents "out of date data" prompt on startup
  if (contents.dataVersionBuild) {
    zip.addFile(`${d}/data/global/DataVersionBuild.txt`, str(contents.dataVersionBuild));
  }

  // Animation frame data with the desynced Warlock A1/A2 records repaired —
  // required for melee skills on Warlock to land their hits (see src/lib/anim/).
  if (contents.animDataD2) {
    zip.addFile(`${d}/data/global/animdata.d2`, contents.animDataD2);
  }

  // COFs with injected trigger frames (kept byte-consistent with animDataD2;
  // shipping only one side would desync the engine's two frame-data sources).
  if (contents.charCofs) {
    for (const [zipPath, buf] of contents.charCofs.entries()) {
      zip.addFile(`${d}/${zipPath}`, buf);
    }
  }

  // Weekly mutation files
  if (contents.armorTxt) {
    zip.addFile(`${d}/data/${xl}/armor.txt`, str(contents.armorTxt));
  }
  if (contents.weaponsTxt) {
    zip.addFile(`${d}/data/${xl}/weapons.txt`, str(contents.weaponsTxt));
  }
  if (contents.experienceTxt) {
    zip.addFile(`${d}/data/${xl}/experience.txt`, str(contents.experienceTxt));
  }
  if (contents.miscTxt) {
    zip.addFile(`${d}/data/${xl}/misc.txt`, str(contents.miscTxt));
  }
  if (contents.levelsTxt) {
    zip.addFile(`${d}/data/${xl}/levels.txt`, str(contents.levelsTxt));
  }
  if (contents.gambleTxt) {
    zip.addFile(`${d}/data/${xl}/gamble.txt`, str(contents.gambleTxt));
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

  // Add controller-mode tree sprites — same per-class layout but different dimensions,
  // baked into a separate path D2R reads when a gamepad is active.
  if (contents.controllerTreeSprites) {
    for (const [filename, buf] of contents.controllerTreeSprites.entries()) {
      zip.addFile(`${d}/data/hd/global/ui/controller/panel/spells/v2/${filename}`, buf);
    }
  }

  // Gamepad skill behavior is keyed by skills.txt row, so it ships remapped to the shuffle.
  if (contents.controllerSkillSettingsJson) {
    zip.addFile(`${d}/data/hd/global/excel/controllerskillsettings.json`, str(contents.controllerSkillSettingsJson));
  }

  // Add hireable sprite to both non-hd and hd paths
  if (contents.hireableSprite) {
    const HIREABLE_FILENAME = 'hrskillicon.sprite';
    zip.addFile(`${d}/data/global/ui/spells/hireables/${HIREABLE_FILENAME}`, contents.hireableSprite);
    zip.addFile(`${d}/data/hd/global/ui/spells/hireables/${HIREABLE_FILENAME}`, contents.hireableSprite);
  }

  // Add icon sprites to both non-hd and hd paths.
  // iconSprites contains both .sprite (132×130) and .lowend.sprite (66×65) entries
  // for each class — D2R selects the lowend variant on low graphics quality settings.
  for (const [filename, buf] of contents.iconSprites.entries()) {
    const prefix = filename.replace(/skillicon(\.lowend)?\.sprite$/, '');
    const folderName = PREFIX_TO_FOLDER[prefix];
    if (folderName) {
      zip.addFile(`${d}/data/global/ui/spells/${folderName}/${filename}`, buf);
      zip.addFile(`${d}/data/hd/global/ui/spells/${folderName}/${filename}`, buf);
    }
  }

  return zip.toBuffer();
}

/**
 * README.txt at the root of a hand-installed mod zip. Plain words, CRLF (Notepad),
 * the folder names spelled out, because the zip root is the mod folder itself.
 */
export function installReadme(modName: string, note: readonly string[] = []): string {
  const bs = '\\';
  const path = (...parts: string[]) => parts.join(bs);
  return [
    `D2R Randomizer mod: ${modName}`,
    '',
    `This folder is the mod. Install it like this:`,
    '',
    `1. Extract this zip (right-click it, Extract All). You get a folder named ${modName}.`,
    `   If it is named "${modName} (1)" or similar, rename it to ${modName}.`,
    `2. Move that whole ${modName} folder into the game's mods folder, for example`,
    `   ${path('C:', 'Program Files (x86)', 'Diablo II Resurrected', 'mods')}`,
    `   (create the mods folder if it does not exist yet).`,
    `3. Check the result. It must look exactly like this:`,
    `   ${path('...', 'Diablo II Resurrected', 'mods', modName, `${modName}.mpq`)}`,
    `   Not ${path('mods', `${modName}.mpq`)}, and not ${path('mods', modName, modName, `${modName}.mpq`)}.`,
    `4. Start the game with the "D2R Randomizer" shortcut in this folder.`,
    '',
    'If the skill trees look like the normal game, the folders are at the wrong level (step 3).',
    ...note,
    'More help: https://d2rrandomizer.com/guide/install',
    '',
  ].join('\r\n');
}
