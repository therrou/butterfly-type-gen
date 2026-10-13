// Species library: downloaded SVG illustrations (see scripts/fetch-species.mjs), parsed once into
// paths + fills, then recoloured into the active colourway. One drawing serves every colourway.
//   bloom   → flower heads (stem tips in 2D, cards on the letters in 3D)
//   leaf    → foliage, sprouts, mushrooms, kelp, sea grass
//   critter → insects that perch on stems / walk the letters; sea creatures
// (bloom also covers corals, shells and anemones)
import { hsl, mix, T } from './brand.js';

let LIB = [];
const byId = new Map();

export async function loadSpecies() {
  const manifest = await (await fetch('/species/manifest.json')).json();
  await Promise.all(manifest.map(async m => {
    const txt = await (await fetch(`/species/${m.set}/${m.name}.svg`)).text();
    const sp = { ...m, ...parse(txt) };
    byId.set(sp.id, sp);
  }));
  LIB = manifest.map(m => byId.get(m.id)).filter(Boolean);
}
export const species = () => LIB;
export const getSpecies = id => byId.get(id);
export const ofKind = (kind, ids) => LIB.filter(s => s.kind === kind && (!ids || ids.includes(s.id)));

function parse(txt) {
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  const svg = doc.documentElement;
  const vb = (svg.getAttribute('viewBox') || '0 0 32 32').split(/[\s,]+/).map(Number);
  const parts = [];
  const walk = (el, inherited) => {
    for (const c of el.children) {
      const tag = c.tagName;
      if (tag === 'defs') continue;
      if (tag === 'g') { walk(c, c.getAttribute('fill') ?? inherited); continue; }
      let src = c;
      if (tag === 'use') { const id = (c.getAttribute('href') || c.getAttribute('xlink:href') || '').slice(1); src = doc.getElementById(id); if (!src) continue; }
      if (src.tagName !== 'path') continue;
      const own = src.getAttribute('fill');
      const fill = own ? (own === 'none' ? null : own) : inherited ? (inherited === 'none' ? null : inherited) : '#000';
      if (!fill) continue;
      parts.push({ d: src.getAttribute('d'), fill: fill === 'currentColor' ? 'currentColor' : fill, rule: src.getAttribute('fill-rule') || 'nonzero', p2d: new Path2D(src.getAttribute('d')) });
    }
  };
  walk(svg, svg.getAttribute('fill'));
  return { vb, parts };
}

// ---- recolouring ----
const ROLE_SLOT = { bloom: cw => cw.flower, leaf: cw => cw.foliage[1], critter: cw => cw.type };
const recache = new Map();
export function fills(sp, cw, tint = 0.85) {
  const key = `${sp.id}|${cw.id}|${tint}`;
  let f = recache.get(key);
  if (f) return f;
  f = sp.parts.map(p => {
    if (p.fill === 'currentColor') return (ROLE_SLOT[sp.kind] || ROLE_SLOT.bloom)(cw);
    const src = /^#[0-9a-f]{3}$/i.test(p.fill) ? '#' + [...p.fill.slice(1)].map(c => c + c).join('') : p.fill;
    if (!/^#[0-9a-f]{6}$/i.test(src)) return src;
    const [h, s, l] = hsl(src);
    let target;
    if (s > 0.2 && h >= 65 && h <= 170) target = cw.foliage[l < 0.35 ? 0 : l < 0.6 ? 1 : 2];      // natural accent greens
    else if (s < 0.12 && l > 0.8 && sp.kind === 'bloom') target = mix(T.white, cw.flower, 0.55);     // white petals take a pastel of the bloom colour
    else if (s < 0.12) target = l > 0.8 ? T.white : l < 0.3 ? T.deep : mix(T.deep, T.white, l);        // neutrals stay neutral
    else if (h >= 25 && h < 65 && sp.kind !== 'bloom') target = cw.flower2;                           // warm insect/leaf details
    else target = l < 0.42 ? cw.flowerDeep : l < 0.72 ? cw.flower : cw.flower2;                       // everything else → bloom ramp
    return mix(src, target, tint);
  });
  recache.set(key, f);
  return f;
}

// Draw centred at (x, y), `size` = width in px.
export function drawSpecies(ctx, sp, x, y, size, rot, cw, opts = {}) {
  if (!sp || size <= 0.5) return;
  const [vx, vy, vw, vh] = sp.vb, k = size / vw, F = fills(sp, cw, opts.tint ?? 0.85);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot || 0);
  if (opts.flip) ctx.scale(-1, 1);
  ctx.scale(k, k); ctx.translate(-vx - vw / 2, -vy - vh / 2);
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  sp.parts.forEach((p, i) => { ctx.fillStyle = opts.mono || F[i]; ctx.fill(p.p2d, p.rule); });
  ctx.restore();
}
export function speciesSVG(sp, x, y, size, rot, cw, opts = {}) {
  if (!sp || size <= 0.5) return '';
  const [vx, vy, vw, vh] = sp.vb, k = size / vw, F = fills(sp, cw, opts.tint ?? 0.85), n = v => Math.round(v * 1000) / 1000;
  const tr = `translate(${n(x)} ${n(y)}) rotate(${n((rot || 0) * 180 / Math.PI)})${opts.flip ? ' scale(-1 1)' : ''} scale(${n(k)}) translate(${n(-vx - vw / 2)} ${n(-vy - vh / 2)})`;
  const op = opts.alpha != null && opts.alpha < 1 ? ` opacity="${n(opts.alpha)}"` : '';
  return `<g transform="${tr}"${op}>${sp.parts.map((p, i) => `<path d="${p.d}" fill="${opts.mono || F[i]}"${p.rule !== 'nonzero' ? ` fill-rule="${p.rule}"` : ''}/>`).join('')}</g>`;
}

// Texture atlas for the 3D cards: a square grid sized to the library in a 2048px canvas, rebuilt per colourway.
export function buildAtlas(cw, tint) {
  const N = Math.max(8, Math.ceil(Math.sqrt(LIB.length))), C = Math.floor(2048 / N), c = document.createElement('canvas');
  c.width = c.height = N * C;
  const g = c.getContext('2d'), uv = new Map();
  LIB.forEach((sp, i) => {
    if (i >= N * N) return;
    const cx = (i % N) * C, cy = Math.floor(i / N) * C;
    drawSpecies(g, sp, cx + C / 2, cy + C / 2, C * 0.92, 0, cw, { tint });
    uv.set(sp.id, [cx / c.width, 1 - (cy + C) / c.height, C / c.width, C / c.height]);
  });
  return { canvas: c, uv };
}

export function thumb(sp, cw, px = 44) {
  const c = document.createElement('canvas'); c.width = c.height = px * 2;
  drawSpecies(c.getContext('2d'), sp, px, px, px * 1.7, 0, cw);
  return c.toDataURL();
}
