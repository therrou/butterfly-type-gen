// Draws the sea species the downloaded libraries don't have (Claude's first pass, PLAN §3: swappable —
// an illustrator can replace any file in public/species/drawn/ as long as it stays plain filled <path>s
// in a 32×32 viewBox). Flat ones follow the Fluent Emoji look (a few flat fills, a highlight, a dark eye);
// the -silhouette ones follow game-icons (one currentColor fill).
//   node scripts/draw-sea.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const out = new URL('../public/species/drawn/', import.meta.url);
mkdirSync(out, { recursive: true });
const f = v => Math.round(v * 100) / 100;
const poly = pts => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
const circle = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
// Catmull–Rom through [x, y, r] control points → n samples
function spline(P, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n * (P.length - 1), k = Math.min(Math.floor(u), P.length - 2), t = u - k;
    const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(P.length - 1, k + 2)];
    out.push([0, 1, 2].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t)));
  }
  return out;
}
// a tapered stroke along [x, y, r] samples → outline polygon (round-ish ends from the taper)
function stroke(S) {
  const L = [], R = [];
  S.forEach(([x, y, r], i) => {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    L.push([x - dy / l * r, y + dx / l * r]); R.push([x + dy / l * r, y - dx / l * r]);
  });
  return poly([...L, ...R.reverse()]);
}
const svg = paths => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${paths.map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('')}</svg>\n`;
const save = (name, paths) => { writeFileSync(new URL(`${name}.svg`, out), svg(paths)); console.log('drawn', name); };

// ---- seahorse: side-on, snout right; centreline from the 3D model (sea.js horseGeometry) ----
const HORSE = [[0.34, 0.47, 0.022], [0.22, 0.47, 0.03], [0.12, 0.48, 0.07], [0.03, 0.52, 0.085], [-0.04, 0.46, 0.075], [-0.04, 0.34, 0.07], [0.0, 0.22, 0.09],
  [0.06, 0.08, 0.115], [0.06, -0.06, 0.11], [0.01, -0.18, 0.08], [-0.06, -0.28, 0.055], [-0.08, -0.38, 0.04], [-0.03, -0.46, 0.032], [0.04, -0.45, 0.026], [0.06, -0.38, 0.022], [0.02, -0.34, 0.018]]
  .map(([z, y, r]) => [13 + z * 26, 16.5 - y * 26, r * 26]);
const horse = spline(HORSE, 80);
const belly = spline(HORSE.slice(5, 11).map(([x, y, r]) => [x + r * 0.45, y, r * 0.5]), 30);
const rings = HORSE.slice(6, 13).map(([x, y, r], i, A) => { const b = A[Math.min(i + 1, A.length - 1)], dx = b[0] - x, dy = b[1] - y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  return stroke([[x + nx * r * 0.9, y + ny * r * 0.9, 0.28], [x - nx * r * 0.9, y - ny * r * 0.9, 0.28]]); });
save('seahorse', [['#E8892E', poly([[11.4, 9.6], [8.2, 11.6], [9.6, 14.2], [11.6, 13.2]])], ['#F2A93B', stroke(horse)], ['#FFD27A', stroke(belly)], ...rings.map(d => ['#D27A26', d]),
  ['#FFF4D6', circle(14.6, 4.6, 1.25)], ['#212121', circle(14.8, 4.6, 0.7)], ['#E8892E', poly([[13.2, 2.2], [14.4, 0.9], [15.2, 2.6]])]]);

// ---- seastar: five plump arms, a paler centre, tubercle dots along each arm ----
const star = (R, r0, k = 1.8) => { const pts = []; for (let i = 0; i < 120; i++) { const th = i / 120 * Math.PI * 2 - Math.PI / 2, arm = Math.pow(0.5 + 0.5 * Math.cos(th * 5 + Math.PI / 2 * 5 + Math.PI), k), r = r0 + (R - r0) * arm; pts.push([16 + Math.cos(th) * r, 16.6 + Math.sin(th) * r]); } return poly(pts); };
const dots = []; for (let a = 0; a < 5; a++) for (let s = 1; s <= 3; s++) { const th = a / 5 * Math.PI * 2 - Math.PI / 2, r = 3 + s * 3; dots.push(['#FFE2C4', circle(16 + Math.cos(th) * r, 16.6 + Math.sin(th) * r, 1.1 - s * 0.18)]); }
save('seastar', [['#E2622E', star(15, 5.2)], ['#F28A4A', star(10.5, 3.6, 2.2)], ...dots, ['#FFD0A8', circle(16, 16.6, 1.6)]]);

// ---- sea urchin: a round test bristling with long and short spines ----
const spines = [];
for (let i = 0; i < 28; i++) { const th = i / 28 * Math.PI * 2, L = i % 2 ? 9.5 : 14, w = 0.75, c = [16 + Math.cos(th) * 5.5, 17 + Math.sin(th) * 5.5], t = [16 + Math.cos(th) * L, 17 + Math.sin(th) * L * 0.92], nx = -Math.sin(th) * w, ny = Math.cos(th) * w;
  spines.push(poly([[c[0] + nx, c[1] + ny], t, [c[0] - nx, c[1] - ny]])); }
save('sea-urchin', [...spines.map(d => ['#3E1A52', d]), ['#5B2A6E', circle(16, 17, 7)], ['#7E4596', circle(14.4, 15.2, 3.6)], ['#B07AC4', circle(13.2, 13.9, 1.2)]]);

// ---- anemone: a short column, a crown of curling tentacles with pale tips ----
const tentacles = [], tips = [];
for (let i = 0; i < 13; i++) {
  const u = i / 12 - 0.5, base = [16 + u * 8, 18.5], reach = 9 + (1 - Math.abs(u) * 1.6) * 4.5, ang = -Math.PI / 2 + u * 2.6;
  const S = spline([[base[0], base[1], 1.25], [base[0] + Math.cos(ang) * reach * 0.5, base[1] + Math.sin(ang) * reach * 0.5, 0.95], [base[0] + Math.cos(ang + u * 0.9) * reach, base[1] + Math.sin(ang + u * 0.9) * reach, 0.6]], 16);
  tentacles.push(stroke(S)); const e = S[S.length - 1]; tips.push(circle(e[0], e[1], 0.85));
}
const column = 'M10.5 30.5C10 26 11 21.5 12 18.5L20 18.5C21 21.5 22 26 21.5 30.5Z';
save('anemone', [...tentacles.map(d => ['#F07AA6', d]), ...tips.map(d => ['#FFE0EC', d]), ['#B83A6A', column], ['#D45A86', 'M13 29.5C12.8 26 13.4 22.5 14 19.5L15.6 19.5C15.2 22.5 14.9 26 15 29.5Z']]);
save('anemone-silhouette', [...tentacles.map(d => ['currentColor', d]), ...tips.map(d => ['currentColor', d]), ['currentColor', column]]);

// ---- kelp: a wavy stipe with ruffled blades alternating up it ----
const stipe = spline([[16, 31, 0.8], [14.6, 24, 0.7], [16.8, 16, 0.6], [15.2, 8, 0.5], [16.4, 1.5, 0.35]], 40);
const blade = (x, y, ang, len, w) => { // a long leaf with a wavy edge
  const L = [], R = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24, ww = w * Math.sin(Math.PI * Math.pow(t, 0.6)) * (1 + 0.18 * Math.sin(t * 34)), cx = x + Math.cos(ang) * len * t, cy = y + Math.sin(ang) * len * t + Math.sin(t * 3) * 0.6, nx = -Math.sin(ang), ny = Math.cos(ang);
    L.push([cx + nx * ww, cy + ny * ww]); R.push([cx - nx * ww, cy - ny * ww]); }
  return poly([...L, ...R.reverse()]);
};
const blades = [[15.2, 26, -2.4, 11, 2.2], [15.6, 21, -0.75, 11, 2.1], [16.4, 15, -2.3, 10, 1.9], [16, 10, -0.9, 9, 1.7], [15.8, 5, -2.2, 7, 1.4]].map(b => blade(...b));
save('kelp', [['#4E6A22', stroke(stipe)], ...blades.map((d, i) => [i % 2 ? '#6E8A2E' : '#7E9A38', d]), ['#A4B85A', stroke(spline([[16.6, 15.5, 0.25], [20, 11.4, 0.2], [22.6, 9.8, 0.1]], 10))]]);
save('kelp-silhouette', [['currentColor', stroke(stipe)], ...blades.map(d => ['currentColor', d])]);

// ---- sea grass: a tuft of long ribbon blades leaning apart ----
const grass = [[-0.5, 26, 1.1], [-0.25, 29, 1.2], [0, 30, 1.25], [0.2, 27, 1.15], [0.45, 24, 1.05], [-0.1, 22, 1.0]].map(([lean, len, w]) =>
  stroke(spline([[16 + lean * 3, 31, w], [16 + lean * 7, 31 - len * 0.5, w * 0.85], [16 + lean * 14, 31 - len, 0.15]], 20)));
save('sea-grass', grass.map((d, i) => [['#2E7A5A', '#3E8E66', '#5FAF6E'][i % 3], d]));
save('sea-grass-silhouette', grass.map(d => ['currentColor', d]));

// ---- scallop: a ribbed fan on a hinge with two little ears ----
const fanEdge = []; for (let i = 0; i <= 90; i++) { const a = -Math.PI * 0.86 + i / 90 * Math.PI * 0.72, sc = 1 + 0.045 * Math.abs(Math.sin(i / 90 * Math.PI * 9)); fanEdge.push([16 + Math.cos(a) * 14 * sc, 26 + Math.sin(a) * 14 * sc * 0.95]); }
const ribs = []; for (let k = 0; k < 9; k++) { const a = -Math.PI * 0.86 + (k + 0.5) / 9 * Math.PI * 0.72; ribs.push(stroke([[16 + Math.cos(a) * 3, 26 + Math.sin(a) * 3, 0.25], [16 + Math.cos(a) * 13, 26 + Math.sin(a) * 12.4, 0.75]])); }
save('scallop', [['#E0807A', poly([[11, 29.5], [16, 25], [21, 29.5], [16, 31]])], ['#F4A6A0', poly([[16, 27], ...fanEdge])], ...ribs.map(d => ['#FCD3CC', d]), ['#E8908A', poly([[13.4, 27.6], [16, 24.6], [18.6, 27.6], [16, 28.8]])]]);
