/**
 * HD files for the Krampus Is Coming mutation (built offline by
 * scripts/build-krampus-assets.mjs; see docs/krampus.md).
 *
 * d2rr_krampus.json embeds a copy of the vanilla goatman1.json, so it is shipped only
 * while data/dataversionbuild.txt matches the build it was made from. After a game
 * patch Krampus keeps working with the plain goatman model and the server logs a
 * [krampus] warning until the unit is rebuilt.
 */
import fs from 'fs';
import path from 'path';
import { KRAMPUS_IDS } from '@/lib/randomizer/mutations/krampus';

const DATA_DIR = path.join(process.cwd(), 'data');
const KRAMPUS_TOKEN = 'd2rr_krampus';

let cached: Map<string, Buffer> | null | undefined;

/** Files to add under the mod's data/ folder, or null when the unit is stale. */
export function krampusAssetFiles(): Map<string, Buffer> | null {
  if (cached !== undefined) return cached;
  const dir = path.join(DATA_DIR, 'krampus');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { dataVersionBuild: string };
  const build = fs.readFileSync(path.join(DATA_DIR, 'dataversionbuild.txt'), 'utf8').trim();
  if (manifest.dataVersionBuild !== build) {
    console.warn(`[krampus] unit built for ${manifest.dataVersionBuild}, game data is ${build}: shipping the plain goatman model`);
    cached = null;
    return cached;
  }
  const winter = path.join(DATA_DIR, 'winter', 'assets');
  const unit = fs.readFileSync(path.join(dir, `${KRAMPUS_TOKEN}.json`));
  cached = new Map([
    // The game picks the folder by monster type (seen in game: a town NPC mapped to a
    // token found only under enemy/ was invisible). Krampus is an ordinary monster
    // like the goatman, so enemy/ is the one used; npc/ is a cheap safety copy.
    [`hd/character/enemy/${KRAMPUS_TOKEN}.json`, unit],
    [`hd/character/npc/${KRAMPUS_TOKEN}.json`, unit],
    ['hd/d2rr/krampus/krampus_gifts.json', fs.readFileSync(path.join(dir, 'krampus_gifts.json'))],
    ['hd/bvt/models/skin_sphere_lod0.model', fs.readFileSync(path.join(winter, 'gifts_lod0.model'))],
    ['hd/d2rr/winter/gifts_alb.texture', fs.readFileSync(path.join(winter, 'gifts_alb.texture'))],
  ]);
  return cached;
}

/** Point the Krampus rows at the Krampus unit, when it ships. */
export function useKrampusUnit(graphics: Record<string, string>): boolean {
  if (!krampusAssetFiles()) return false;
  for (const id of KRAMPUS_IDS) graphics[id] = KRAMPUS_TOKEN;
  return true;
}

/** The monster string table with "Krampus" added (UTF-8 BOM and CRLF, like the game's). */
export function monsterStringsWithKrampus(nameKey: string): string {
  const file = path.join(DATA_DIR, 'local', 'strings', 'monsters.json');
  const names = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) as { id: number; Key: string }[];
  const locales = ['enUS', 'zhTW', 'deDE', 'esES', 'frFR', 'itIT', 'koKR', 'plPL', 'esMX', 'jaJP', 'ptBR', 'ruRU', 'zhCN'];
  // String IDs are global across every string file. 40000–41999 belong to Forgotten
  // Arts (item-names.json); the extracted catalogue has nothing between 28102 and 251779.
  names.push({ id: 42000, Key: nameKey, ...Object.fromEntries(locales.map(l => [l, 'Krampus'])) });
  return '﻿' + JSON.stringify(names, null, 2).replace(/\n/g, '\r\n');
}
