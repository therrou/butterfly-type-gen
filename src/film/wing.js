// Procedural wing texture (deterministic). UV: u = span from hinge (0..1), v = body axis (0 = tail, 1 = head).
import { rng } from './rand.js';

const FORE = [ // leading edge → apex → outer margin → tornus → inner margin (normalized u,v)
  [0.02, 0.62], [0.30, 0.82, 0.70, 1.00, 0.97, 0.95],
  [1.02, 0.82, 0.90, 0.56, 0.72, 0.47],
  [0.45, 0.41, 0.16, 0.46, 0.02, 0.50],
];
const HIND_TOP = [[0.02, 0.53], [0.28, 0.60, 0.50, 0.58, 0.64, 0.50]];

function hindOuter(s) { // outer margin param s∈[0,1] from (0.64,0.50) to (0.20,0.03), scalloped
  const a = s * Math.PI * 0.95;
  const cx = 0.22, cy = 0.33, rx = 0.46, ry = 0.36;
  const base = [cx + rx * Math.cos(a - 0.62), cy - ry * Math.sin(a - 0.62) * 0.9 + 0.02];
  const sc = 0.009 * Math.sin(s * Math.PI * 11) + 0.004 * Math.sin(s * Math.PI * 23);  // soft wavy margin, no cusps
  return [base[0] - sc * Math.cos(a - 0.62), base[1] + sc * Math.sin(a - 0.62)];
}

const lerp2 = (a, b, t) => a + (b - a) * t;
export function drawWing(size, seed = 1) {
  const R = rng(seed * 7919);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const P = ([u, v]) => [u * size, (1 - v) * size];
  const k = size / 1024;

  const fore = new Path2D();
  fore.moveTo(...P(FORE[0]));
  for (let i = 1; i < FORE.length; i++) { const s = FORE[i]; fore.bezierCurveTo(...P([s[0], s[1]]), ...P([s[2], s[3]]), ...P([s[4], s[5]])); }
  fore.closePath();

  const hind = new Path2D();
  hind.moveTo(...P(HIND_TOP[0]));
  const h1 = HIND_TOP[1]; hind.bezierCurveTo(...P([h1[0], h1[1]]), ...P([h1[2], h1[3]]), ...P([h1[4], h1[5]]));
  const outer = [];
  for (let i = 0; i <= 80; i++) outer.push(hindOuter(i / 80));
  for (const p of outer) hind.lineTo(...P(p));
  hind.bezierCurveTo(...P([0.10, 0.10]), ...P([0.03, 0.22]), ...P([0.02, 0.32]));
  hind.closePath();

  const both = new Path2D(); both.addPath(hind); both.addPath(fore);

  // membrane gradient: warm pearl core → pink → lilac → turquoise-blue edges
  g.save(); g.clip(both);
  const grad = g.createRadialGradient(...P([0.0, 0.5]), 0, ...P([0.0, 0.5]), size * 0.98);
  grad.addColorStop(0.00, '#FFF4EA');
  grad.addColorStop(0.16, '#FDE4DF');
  grad.addColorStop(0.34, '#F3BEDD');
  grad.addColorStop(0.52, '#C8B4F2');
  grad.addColorStop(0.72, '#8FAEF2');
  grad.addColorStop(1.00, '#4F7BE8');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  // pearlescent streaks along the veins' direction
  for (let i = 0; i < 26; i++) {
    const a = -0.9 + R() * 1.9, len = 0.5 + R() * 0.5;
    const [x0, y0] = P([0.03, 0.5]);
    const x1 = x0 + Math.cos(a) * len * size, y1 = y0 - Math.sin(a) * len * size;
    const lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.6, `rgba(255,255,255,${0.10 + R() * 0.12})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = lg; g.lineWidth = (6 + R() * 18) * k;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  // veins (dark indigo), radiating from the hinge with gentle curvature
  const vein = (u0, v0, u1, v1, bow, w, alpha) => {
    const [x0, y0] = P([u0, v0]), [x1, y1] = P([u1, v1]);
    const mx = (x0 + x1) / 2 - (y1 - y0) * bow, my = (y0 + y1) / 2 + (x1 - x0) * bow;
    g.lineCap = 'round';
    g.strokeStyle = `rgba(52,64,150,${alpha * 0.45})`; g.lineWidth = w * 1.9 * k;
    g.beginPath(); g.moveTo(x0, y0 + 1.2 * k); g.quadraticCurveTo(mx, my + 1.2 * k, x1, y1 + 1.2 * k); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${Math.min(1, alpha * 2.1)})`; g.lineWidth = w * 0.75 * k;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
  };
  const foreEnds = [[0.55, 0.97], [0.75, 0.99], [0.92, 0.95], [1.0, 0.86], [0.98, 0.74], [0.93, 0.64], [0.85, 0.55], [0.74, 0.48], [0.55, 0.43]];
  foreEnds.forEach(([u, v], i) => vein(0.04 + i * 0.012, 0.57 + i * 0.004, u, v, 0.07 - i * 0.014, 2.2 - i * 0.1, 0.42));
  // petal-shaped cells near the base (as in the reference)
  const loop = (u0, v0, u1, v1, wdt, a) => {
    const [x0, y0] = P([u0, v0]), [x1, y1] = P([u1, v1]);
    const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny), ox = nx / l * wdt * size, oy = ny / l * wdt * size;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 1.6 * k;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx + ox, my + oy, x1, y1); g.quadraticCurveTo(mx - ox, my - oy, x0, y0); g.stroke();
  };
  [[0.56, 0.78, 0.03], [0.5, 0.7, 0.035], [0.44, 0.62, 0.03], [0.36, 0.56, 0.025]].forEach(([u, v, w]) => loop(0.06, 0.57, u, v, w, 0.55));
  [[0.42, 0.32, 0.03], [0.36, 0.22, 0.03], [0.26, 0.15, 0.025]].forEach(([u, v, w]) => loop(0.06, 0.46, u, v, w, 0.5));
  // discal cell
  vein(0.12, 0.62, 0.42, 0.72, 0.1, 1.8, 0.35); vein(0.42, 0.72, 0.40, 0.55, -0.05, 1.6, 0.35);
  const hindEnds = [];
  for (let i = 0; i <= 8; i++) hindEnds.push(hindOuter(0.04 + i * 0.115));
  hindEnds.forEach(([u, v], i) => vein(0.04 + i * 0.008, 0.46 - i * 0.012, u, v, -0.06 + i * 0.012, 2.0 - i * 0.1, 0.40));
  // submarginal line
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.6 * k;
  g.beginPath(); outer.forEach((p, i) => { const q = [p[0] * 0.9 + 0.01, p[1] * 0.9 + 0.05]; const s = P(q); i ? g.lineTo(...s) : g.moveTo(...s); }); g.stroke();
  // scale speckles
  for (let i = 0; i < 5200; i++) {
    const [x, y] = P([R(), R()]);
    g.fillStyle = `rgba(255,255,255,${0.12 + R() * 0.45})`;
    g.beginPath(); g.arc(x, y, (0.5 + R() * 1.7) * k, 0, 6.283); g.fill();
  }
  for (let i = 0; i < 40; i++) {
    const [x, y] = P([0.3 + R() * 0.7, R()]), r = (3 + R() * 6) * k;
    const rg = g.createRadialGradient(x, y, 0, x, y, r * 3);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.25, 'rgba(255,245,250,0.4)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r * 3, 0, 6.283); g.fill();
  }
  g.restore();
  // margins
  g.strokeStyle = 'rgba(62,92,210,0.75)'; g.lineWidth = 3.5 * k; g.stroke(fore); g.stroke(hind);
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.6 * k; g.stroke(fore); g.stroke(hind);
  return c;
}
