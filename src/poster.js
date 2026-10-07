// Poster grammar (from refs/brand + out/poster.png): headline top-left in Novo, the flora type art as
// hero in the middle band, novonordisk.com bottom-left, lockup bottom-right. Design space is
// 1000 × 1414.21 units (A-series ratio); print sizes only change the resolution.
import { drawBg, bgSVG, applyGrain } from './background.js';
import { textPathData } from './fonts.js';
import { encode } from 'fast-png';

export const PW = 1000, PH = 1000 * Math.SQRT2;
export const FORMATS = { A4: [2480, 3508, 210, 297], A3: [3508, 4961, 297, 420], A2: [4961, 7016, 420, 594] }; // px @300dpi, mm
export const BLEED_PX = 35; // 3 mm @ 300 dpi
const M = 64;

const IMG = {};
export async function loadPosterImages() {
  const load = async (k, src, crop) => { const i = new Image(); i.src = src; await i.decode(); IMG[k] = { img: i, crop: crop || [0, 0, i.width, i.height] }; };
  await Promise.all([load('white', '/img/novo-lockup-tagline-white.png'), load('blue', '/img/novo-lockup-tagline.png', [250, 812, 1900, 786])]);
  for (const k of ['white', 'blue']) { const { img, crop } = IMG[k], c = document.createElement('canvas'); c.width = crop[2]; c.height = crop[3]; c.getContext('2d').drawImage(img, -crop[0], -crop[1]); IMG[k].url = c.toDataURL(); IMG[k].canvas = c; }
}

const mctx = document.createElement('canvas').getContext('2d');
function wrap(text, size, weight, maxW) {
  mctx.font = `${weight} ${size}px Novo`;
  const out = [];
  for (const para of (text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) { const t = line ? line + ' ' + w : w; if (line && mctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out.filter((l, i) => l || i < out.length - 1);
}

export function layout(p) {
  const hs = 64, ss = 25, head = wrap(p.headline, hs, 400, PW - 2 * M - 120), sub = wrap(p.subline, ss, 400, PW - 2 * M - 240);
  const headY = M + hs * 0.95, subY = headY + (head.length - 1) * hs * 1.06 + ss * 2.2;
  const textBottom = p.subline ? subY + (sub.length - 1) * ss * 1.3 : headY + (head.length - 1) * hs * 1.06;
  const top = Math.max(300, textBottom + 50), bottom = PH - 210;
  const h = bottom - top, cy = top + h / 2 + p.artY * h * 0.3;
  const lw = 250, lh = lw * (IMG.white ? IMG.white.crop[3] / IMG.white.crop[2] : 0.41);
  return {
    head: { lines: head, x: M, y: headY, size: hs, lh: hs * 1.06 },
    sub: { lines: sub, x: M, y: subY, size: ss, lh: ss * 1.3 },
    url: { text: 'novonordisk.com', x: M, y: PH - M - 4, size: 22 },
    lockup: { x: PW - M - lw, y: PH - M - lh + 6, w: lw, h: lh },
    box: { x: M * 0.5, y: cy - h / 2, w: PW - M, h, scale: p.artScale },
  };
}

// overlay (type + lockup) in design units
export function drawOverlay(ctx, L, cw) {
  ctx.fillStyle = cw.type; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.font = `400 ${L.head.size}px Novo`; L.head.lines.forEach((t, i) => ctx.fillText(t, L.head.x, L.head.y + i * L.head.lh));
  ctx.globalAlpha = 0.88; ctx.font = `400 ${L.sub.size}px Novo`; L.sub.lines.forEach((t, i) => ctx.fillText(t, L.sub.x, L.sub.y + i * L.sub.lh));
  ctx.globalAlpha = 1; ctx.font = `500 ${L.url.size}px Novo`; ctx.fillText(L.url.text, L.url.x, L.url.y);
  const lk = IMG[cw.lockup === 'blue' ? 'blue' : 'white'];
  if (lk) ctx.drawImage(lk.canvas, L.lockup.x, L.lockup.y, L.lockup.w, L.lockup.h);
}
function overlaySVG(L, cw) {
  const p = [];
  L.head.lines.forEach((t, i) => p.push(`<path d="${textPathData(t, L.head.x, L.head.y + i * L.head.lh, L.head.size, 400)}" fill="${cw.type}"/>`));
  L.sub.lines.forEach((t, i) => p.push(`<path d="${textPathData(t, L.sub.x, L.sub.y + i * L.sub.lh, L.sub.size, 400)}" fill="${cw.type}" opacity="0.88"/>`));
  p.push(`<path d="${textPathData(L.url.text, L.url.x, L.url.y, L.url.size, 500)}" fill="${cw.type}"/>`);
  const lk = IMG[cw.lockup === 'blue' ? 'blue' : 'white'];
  if (lk) p.push(`<image href="${lk.url}" x="${L.lockup.x}" y="${L.lockup.y}" width="${L.lockup.w}" height="${L.lockup.h}"/>`);
  return p.join('');
}

// ---------- export ----------
export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Tiled print render. art(ctx, info) draws the flora for one tile: either in design units (2D, via the
// tile's transform) or as pixels (3D renders its own tile with a camera view offset).
export async function exportPNG({ format, bleed, cw, bg, poster, frameT, art, onProgress }) {
  const [tw, th] = FORMATS[format], b = bleed ? BLEED_PX : 0, W = tw + 2 * b, H = th + 2 * b, k = tw / PW;
  const L = layout(poster), TILE = 1024;
  // one big canvas when the browser allows it, otherwise stitch RGBA rows and encode in JS
  let out = document.createElement('canvas'), octx = null, raw = null;
  out.width = W; out.height = H;
  try { octx = out.getContext('2d'); octx.fillRect(W - 1, H - 1, 1, 1); if (octx.getImageData(W - 1, H - 1, 1, 1).data[3] !== 255) throw 0; } catch { octx = null; raw = new Uint8ClampedArray(W * H * 4); }
  const tile = document.createElement('canvas'), tctx = tile.getContext('2d', { willReadFrequently: true });
  const nx = Math.ceil(W / TILE), ny = Math.ceil(H / TILE);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i * TILE, y = j * TILE, w = Math.min(TILE, W - x), h = Math.min(TILE, H - y);
    tile.width = w; tile.height = h;
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.fillStyle = cw.bg; tctx.fillRect(0, 0, w, h);
    tctx.setTransform(k, 0, 0, k, b - x, b - y);
    drawBg(tctx, PW, PH, bg, cw, frameT / 1000);
    await art(tctx, { k, x, y, w, h, b, tw, th });
    tctx.setTransform(k, 0, 0, k, b - x, b - y);
    drawOverlay(tctx, L, cw);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    const img = tctx.getImageData(0, 0, w, h);
    applyGrain(img, x, y, bg.grain);
    if (octx) octx.putImageData(img, x, y);
    else for (let r = 0; r < h; r++) raw.set(img.data.subarray(r * w * 4, (r + 1) * w * 4), ((y + r) * W + x) * 4);
    onProgress?.((j * nx + i + 1) / (nx * ny));
    await new Promise(r => setTimeout(r, 0));
  }
  let blob;
  if (octx) blob = await new Promise(r => out.toBlob(r, 'image/png'));
  else blob = new Blob([encode({ width: W, height: H, data: raw, channels: 4, depth: 8 })], { type: 'image/png' });
  out.width = out.height = 0;
  return blob;
}

export function exportSVG({ format, bleed, cw, bg, poster, frameT, artSVG }) {
  const [, , mw, mh] = FORMATS[format], b = bleed ? 3 * PW / mw : 0, L = layout(poster);
  const { defs, body } = bgSVG(PW, PH, bg, cw, frameT / 1000);
  const vb = `${-b} ${-b} ${PW + 2 * b} ${PH + 2 * b}`, bw = mw + (bleed ? 6 : 0), bh = mh + (bleed ? 6 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}mm" height="${bh}mm" viewBox="${vb}"><defs>${defs}</defs><rect x="${-b}" y="${-b}" width="${PW + 2 * b}" height="${PH + 2 * b}" fill="${cw.bg}"/>${body}<g id="garden">${artSVG}</g><g id="type">${overlaySVG(L, cw)}</g></svg>`;
}
