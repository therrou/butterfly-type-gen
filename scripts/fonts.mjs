// Novo ships as woff2; opentype.js (glyph outlines for 3D + SVG export) only reads ttf/otf/woff.
// Decompress once into public/fonts.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { decompress } from 'wawoff2';

const SRC = new URL('../../assets/', import.meta.url);
const OUT = new URL('../public/fonts/', import.meta.url);
for (const w of ['Light', 'Regular', 'Medium', 'Bold']) {
  const buf = readFileSync(new URL(`Novo-${w}.woff2`, SRC));
  writeFileSync(new URL(`Novo-${w}.ttf`, OUT), Buffer.from(await decompress(buf)));
  copyFileSync(new URL(`Novo-${w}.woff2`, SRC), new URL(`Novo-${w}.woff2`, OUT));
  console.log('font', w);
}
copyFileSync(new URL('OFL.txt', SRC), new URL('OFL.txt', OUT));
// [novo] lockup images
// for (const f of ['novo-lockup-tagline-white.png', 'novo-lockup-tagline.png'])
//   copyFileSync(new URL(f, SRC), new URL(`../public/img/${f}`, import.meta.url));
for (const f of ['wings-pair.png', 'glass-butterfly.png'])
  copyFileSync(new URL(`../../app/assets/${f}`, import.meta.url), new URL(`../public/img/${f}`, import.meta.url));
