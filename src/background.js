// Gradient-blob background. Blobs are soft radial gradients (not a blur filter), so they render
// identically at any resolution and across print tiles. Colours come only from the colourway.
import { rng } from './film/rand.js';

export const defaultBg = () => ({ count: 5, soft: 0.7, scale: 1, grain: 0.35, seed: 3, drift: true, moved: {} });

export function blobs(bg, cw) {
  const r = rng(bg.seed * 7919 + 11), out = [];
  for (let i = 0; i < bg.count; i++) {
    const m = bg.moved[i];
    out.push({
      i,
      x: m ? m[0] : 0.08 + r() * 0.84,
      y: m ? m[1] : 0.06 + r() * 0.88,
      r: (0.28 + r() * 0.32) * bg.scale,
      col: cw.blobs[i % cw.blobs.length],
      a: 0.55 + r() * 0.35,
      ph: r() * 6.28, sp: 0.6 + r() * 0.6,
    });
  }
  return out;
}

// position at time t (seconds); drift is a slow Lissajous so loops stay calm
export function blobAt(b, t, drift) {
  if (!drift) return [b.x, b.y];
  return [b.x + 0.035 * Math.sin(t * 0.21 * b.sp + b.ph), b.y + 0.03 * Math.sin(t * 0.17 * b.sp + b.ph * 1.7)];
}

const stops = (soft) => {
  const core = (1 - soft) * 0.55, S = [];
  for (let k = 0; k <= 10; k++) {
    const u = k / 10, v = Math.max(0, (u - core) / (1 - core));
    S.push([u, k === 10 ? 0 : Math.exp(-4.2 * v * v) * (1 - u * u * 0.4)]);
  }
  return S;
};
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(4)})`; };

// W×H in the caller's current coordinate space (poster design units or CSS px)
export function drawBg(ctx, W, H, bg, cw, t = 0, x0 = 0, y0 = 0) {
  ctx.fillStyle = cw.bg; ctx.fillRect(x0, y0, W, H);
  const S = stops(bg.soft);
  for (const b of blobs(bg, cw)) {
    const [bx, by] = blobAt(b, t, bg.drift), R = b.r * Math.max(W, H);
    const cx = x0 + bx * W, cy = y0 + by * H;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    for (const [u, a] of S) g.addColorStop(u, rgba(b.col, a * b.a));
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
}

export function bgSVG(W, H, bg, cw, t, x0 = 0, y0 = 0) {
  const S = stops(bg.soft), n = v => Math.round(v * 100) / 100;
  let defs = '', body = `<rect x="${n(x0)}" y="${n(y0)}" width="${n(W)}" height="${n(H)}" fill="${cw.bg}"/>`;
  for (const b of blobs(bg, cw)) {
    const [bx, by] = blobAt(b, t, bg.drift), R = b.r * Math.max(W, H), cx = x0 + bx * W, cy = y0 + by * H;
    defs += `<radialGradient id="blob${b.i}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}">${S.map(([u, a]) => `<stop offset="${u}" stop-color="${b.col}" stop-opacity="${(a * b.a).toFixed(4)}"/>`).join('')}</radialGradient>`;
    body += `<rect x="${n(cx - R)}" y="${n(cy - R)}" width="${n(R * 2)}" height="${n(R * 2)}" fill="url(#blob${b.i})"/>`;
  }
  if (bg.grain > 0) {
    defs += `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`;
    body += `<rect x="${n(x0)}" y="${n(y0)}" width="${n(W)}" height="${n(H)}" filter="url(#grain)" opacity="${(bg.grain * 0.22).toFixed(3)}" style="mix-blend-mode:overlay"/>`;
  }
  return { defs, body };
}

// ---- grain ----
// Preview: tiled noise pattern. Export: per-pixel hash of the absolute pixel position, so tiles are seamless.
let noiseTile = null;
export function drawGrainPreview(ctx, W, H, amount) {
  if (amount <= 0) return;
  if (!noiseTile) {
    noiseTile = document.createElement('canvas'); noiseTile.width = noiseTile.height = 256;
    const g = noiseTile.getContext('2d'), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = hash(i >> 2, 7) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = amount * 0.22;
  ctx.fillStyle = ctx.createPattern(noiseTile, 'repeat'); ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
function hash(x, y) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function applyGrain(img, ox, oy, amount) {
  if (amount <= 0) return;
  const d = img.data, w = img.width, k = amount * 22;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, v = (hash(ox + x, oy + y) - 0.5) * k;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  }
}
