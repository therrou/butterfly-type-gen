// Novo, two ways: FontFace for canvas/DOM text, opentype.js for outlines (3D glyphs + SVG export).
import opentype from 'opentype.js';

export const WEIGHTS = { Light: 300, Regular: 400, Medium: 500, Bold: 700 };
const faces = {};

export async function loadFonts() {
  await Promise.all(Object.entries(WEIGHTS).map(async ([name, w]) => {
    const buf = await (await fetch(`/fonts/Novo-${name}.ttf`)).arrayBuffer();
    faces[w] = opentype.parse(buf);
    const ff = new FontFace('Novo', `url(/fonts/Novo-${name}.woff2) format("woff2")`, { weight: String(w) });
    document.fonts.add(await ff.load());
  }));
}
export const font = w => faces[w] || faces[400];

// advance width in em
export function advance(ch, w) {
  const f = font(w), g = f.charToGlyph(ch);
  return (g.advanceWidth || f.unitsPerEm * 0.3) / f.unitsPerEm;
}
// outline path data for `ch` centred on x like canvas textAlign=center, baseline at y, size S px
export function glyphPathData(ch, x, y, S, w) {
  const f = font(w), adv = advance(ch, w) * S;
  return f.getPath(ch, x - adv / 2, y, S).toPathData(2);
}
// a run of text, left-aligned at x, baseline y
export function textPathData(str, x, y, S, w) { return font(w).getPath(str, x, y, S).toPathData(2); }
export function textWidth(str, S, w) { return font(w).getAdvanceWidth(str, S); }
