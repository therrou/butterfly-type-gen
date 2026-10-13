// Downloads the species SVG library from Iconify and writes public/species/manifest.json.
//   fluent-emoji-flat — Microsoft Fluent Emoji, MIT  (flat colour illustrations)
//   game-icons        — game-icons.net, CC BY 3.0    (single-colour silhouettes; credit required)
//   drawn             — sea species neither library has, drawn in code by scripts/draw-sea.mjs (run first)
import { writeFileSync, mkdirSync } from 'node:fs';

const LIB = {
  'fluent-emoji-flat': {
    bloom: ['rose', 'cherry-blossom', 'hibiscus', 'tulip', 'blossom', 'hyacinth', 'lotus', 'sunflower', 'white-flower'],
    leaf: ['herb', 'leaf-fluttering-in-wind', 'shamrock', 'four-leaf-clover', 'seedling', 'fallen-leaf', 'maple-leaf', 'mushroom'],
    critter: ['butterfly', 'lady-beetle', 'snail', 'bug', 'honeybee', 'beetle', 'cricket'],
    // sea (Ocean recipe)
    'bloom ': ['coral', 'spiral-shell'],
    'critter ': ['tropical-fish', 'fish', 'blowfish', 'jellyfish'],
  },
  'game-icons': {
    bloom: ['daisy', 'rose', 'lotus-flower', 'sunflower', 'flower-twirl', 'vine-flower', 'flowers'],
    leaf: ['fern', 'vine-leaf', 'oak-leaf', 'linden-leaf', 'leaf-swirl', 'sprout', 'curling-vines', 'mushrooms'],
    critter: ['dragonfly', 'caterpillar', 'ladybug', 'bee', 'snail'],
    'bloom ': ['coral', 'scallop', 'spiral-shell', 'nautilus-shell'],
    'critter ': ['seahorse', 'sea-star', 'sea-urchin', 'jellyfish', 'tropical-fish', 'clownfish'],
  },
};
// local files in public/species/drawn/ (flat unless the name ends in -silhouette)
const DRAWN = { bloom: ['anemone', 'scallop', 'anemone-silhouette'], leaf: ['kelp', 'sea-grass', 'kelp-silhouette', 'sea-grass-silhouette'], critter: ['seahorse', 'seastar', 'sea-urchin'] };
const LICENSE = { 'fluent-emoji-flat': 'MIT · Microsoft Fluent Emoji', 'game-icons': 'CC BY 3.0 · game-icons.net (Lorc, Delapouite et al.)', drawn: 'Butterfly Type · in-house, swappable' };

const out = new URL('../public/species/', import.meta.url);
const manifest = [];
for (const [set, kinds] of Object.entries(LIB)) {
  mkdirSync(new URL(`${set}/`, out), { recursive: true });
  for (const [k, names] of Object.entries(kinds)) {
    const kind = k.trim(), sea = k !== kind; // the trailing-space groups are the sea species
    for (const name of names) {
      const res = await fetch(`https://api.iconify.design/${set}/${name}.svg`);
      if (!res.ok) { console.warn('skip', set, name, res.status); continue; }
      writeFileSync(new URL(`${set}/${name}.svg`, out), await res.text());
      manifest.push({ id: `${set === 'game-icons' ? 'g' : 'f'}:${name}`, set, name, kind, style: set === 'game-icons' ? 'silhouette' : 'flat', license: LICENSE[set], ...(sea && { sea: true }) });
      console.log(set, kind, name);
    }
  }
}
for (const [kind, names] of Object.entries(DRAWN)) for (const name of names)
  manifest.push({ id: `d:${name}`, set: 'drawn', name, kind, style: name.endsWith('-silhouette') ? 'silhouette' : 'flat', license: LICENSE.drawn, sea: true });
writeFileSync(new URL('manifest.json', out), JSON.stringify(manifest, null, 1));
writeFileSync(new URL('LICENSES.md', out), `# Species art licences\n\n- fluent-emoji-flat/: Microsoft Fluent Emoji, MIT — https://github.com/microsoft/fluentui-emoji\n- game-icons/: game-icons.net, CC BY 3.0 — https://game-icons.net (credit Lorc, Delapouite and contributors)\n- drawn/: sea species drawn in code for Butterfly Type (scripts/draw-sea.mjs), swappable for illustrations\n`);
