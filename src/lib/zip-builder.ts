import archiver from 'archiver';
import { ClassCode } from './randomizer/types';
import { CLASS_BY_CODE, CLASS_DEFS } from './randomizer/config';

export interface ZipContents {
  skillsTxt: string;
  skillDescTxt: string;
  treeSprites: Map<string, Buffer>; // filename → sprite buffer
  iconSprites: Map<string, Buffer>; // filename → sprite buffer
}

/**
 * Build the mod zip file as a Buffer.
 * Structure:
 *   data/global/excel/skills.txt
 *   data/global/excel/skilldesc.txt
 *   data/hd/global/ui/spells/skill_trees/{prefix}skilltree.sprite
 *   data/hd/global/ui/spells/skill_trees/{prefix}skilltree.lowend.sprite
 *   data/hd/global/ui/spells/{class}/{prefix}skillicon.sprite
 */
export async function buildZip(contents: ZipContents): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    // Add text files
    archive.append(contents.skillsTxt, { name: 'data/global/excel/skills.txt' });
    archive.append(contents.skillDescTxt, { name: 'data/global/excel/skilldesc.txt' });

    // Add tree sprites
    for (const [filename, buf] of contents.treeSprites.entries()) {
      archive.append(buf, { name: `data/hd/global/ui/spells/skill_trees/${filename}` });
    }

    // Add icon sprites - per class
    for (const [filename, buf] of contents.iconSprites.entries()) {
      // Extract class prefix from filename (e.g. 'amskillicon.sprite' → 'am')
      const prefix = filename.replace('skillicon.sprite', '');
      const classDef = CLASS_DEFS.find(c => c.spritePrefix === prefix);
      if (classDef) {
        const folderName = classDef.spritePrefix;
        archive.append(buf, {
          name: `data/hd/global/ui/spells/${folderName}/${filename}`,
        });
      }
    }

    archive.finalize();
  });
}
