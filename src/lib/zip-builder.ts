import archiver from 'archiver';
import { ClassCode } from './randomizer/types';
import { CLASS_BY_CODE, CLASS_DEFS } from './randomizer/config';

export interface ZipContents {
  skillsTxt: string;
  skillDescTxt: string;
  treeSprites: Map<string, Buffer>; // filename → sprite buffer
  iconSprites: Map<string, Buffer>; // filename → sprite buffer
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
