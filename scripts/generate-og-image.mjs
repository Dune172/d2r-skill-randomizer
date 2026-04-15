// One-off: generate public/og-image.png (1200x630) for social share previews.
// Re-run whenever branding changes. The SVG is rasterized via sharp to avoid
// shipping a fragile SVG to Discord/Twitter previewers that don't all support it.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'og-image.png');

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#1a0806"/>
      <stop offset="60%" stop-color="#0a0304"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7a5818" stop-opacity="0"/>
      <stop offset="50%" stop-color="#c8942a"/>
      <stop offset="100%" stop-color="#7a5818" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Border frame -->
  <rect x="24" y="24" width="1152" height="582" fill="none" stroke="#3a1510" stroke-width="3"/>
  <rect x="36" y="36" width="1128" height="558" fill="none" stroke="#7a1f0a" stroke-width="1"/>

  <!-- Top accent line -->
  <rect x="300" y="170" width="600" height="2" fill="url(#accent)"/>
  <circle cx="600" cy="171" r="5" fill="#c8942a"/>

  <!-- Title -->
  <text
    x="600" y="320"
    font-family="Cinzel, Georgia, serif"
    font-size="110"
    font-weight="900"
    text-anchor="middle"
    fill="#c8942a"
    letter-spacing="14"
    style="paint-order: stroke; stroke: #2a0e04; stroke-width: 3;"
  >D2R RANDOMIZER</text>

  <!-- Subtitle -->
  <text
    x="600" y="390"
    font-family="Cinzel, Georgia, serif"
    font-size="28"
    font-weight="400"
    text-anchor="middle"
    fill="#a87830"
    letter-spacing="6"
  >A FREE SKILL RANDOMIZER MOD</text>

  <text
    x="600" y="425"
    font-family="Cinzel, Georgia, serif"
    font-size="28"
    font-weight="400"
    text-anchor="middle"
    fill="#a87830"
    letter-spacing="6"
  >FOR DIABLO 2: RESURRECTED</text>

  <!-- Bottom accent line -->
  <rect x="300" y="490" width="600" height="2" fill="url(#accent)"/>
  <circle cx="600" cy="491" r="5" fill="#c8942a"/>

  <!-- Tagline -->
  <text
    x="600" y="545"
    font-family="Cinzel, Georgia, serif"
    font-size="20"
    font-weight="700"
    text-anchor="middle"
    fill="#7a5818"
    letter-spacing="8"
  >OFFLINE ONLY  ·  SAFE FOR BATTLE.NET  ·  FREE</text>
</svg>
`;

const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(OUT, buffer);
console.log(`Wrote ${OUT} (${buffer.length} bytes)`);
