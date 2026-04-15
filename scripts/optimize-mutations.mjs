#!/usr/bin/env node
// One-shot: re-encode public/mutations/*.png to WebP at 512px max edge,
// quality 82. Mutation cards render at 96–160px; the 1.7-1.9MB PNG sources
// are wildly oversized. Expected result: ~60-120KB each, ~1MB total (down
// from ~22MB).
//
// Run: node scripts/optimize-mutations.mjs
// Idempotent — overwrites the .webp alongside each .png.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'mutations');

const MAX_EDGE = 512;
const QUALITY = 82;

async function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.png'));
  let totalIn = 0;
  let totalOut = 0;

  for (const file of files) {
    const inPath = path.join(DIR, file);
    const outPath = path.join(DIR, file.replace(/\.png$/, '.webp'));
    const inSize = fs.statSync(inPath).size;
    totalIn += inSize;

    await sharp(inPath)
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(outPath);

    const outSize = fs.statSync(outPath).size;
    totalOut += outSize;

    console.log(`${file.padEnd(28)} ${(inSize / 1024).toFixed(0).padStart(5)}KB → ${(outSize / 1024).toFixed(0).padStart(4)}KB  ${((1 - outSize / inSize) * 100).toFixed(0)}% smaller`);
  }

  console.log(`\nTotal: ${(totalIn / 1024 / 1024).toFixed(1)}MB → ${(totalOut / 1024 / 1024).toFixed(1)}MB (${((1 - totalOut / totalIn) * 100).toFixed(0)}% smaller)`);
  console.log('\nUpdate <Image src> refs to .webp in:');
  console.log('  src/app/components/HomeMutationCard.tsx');
  console.log('  src/app/challenge/WeekData.tsx');
}

main().catch(err => { console.error(err); process.exit(1); });
