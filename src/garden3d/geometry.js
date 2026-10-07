// Glyph → extruded letter body + an area/perimeter sampler (front face + rim walls), and the small
// base geometries every instanced layer is built from (moss tuft, stem tube, flower disc, leaf, card, petal).
import * as THREE from 'three';
import { font, advance } from '../fonts.js';

export const DEPTH = 0.07; // letter thickness in em

const glyphCache = new Map();
export function glyphShapes(ch, weight) {
  const key = ch + '|' + weight;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const f = font(weight), adv = advance(ch, weight);
  const cmds = f.getPath(ch, -adv / 2, 0, 1).commands; // y-down, baseline at 0, centred on x
  const sp = new THREE.ShapePath();
  let area = 0, maxA = 0, maxSign = 1, sx = 0, sy = 0, px = 0, py = 0;
  const acc = (x, y) => { area += px * y - x * py; px = x; py = y; };
  const close = () => { acc(sx, sy); if (Math.abs(area) > maxA) { maxA = Math.abs(area); maxSign = Math.sign(area); } area = 0; };
  // Novo draws square corners as zero-radius curves (each corner point repeated ~4×). Earcut chokes on those
  // duplicates and can triangulate a plain stem ('l', 'I', 'i') into a spike, so drop zero-length segments and
  // turn degenerate curves into straight lines before building the shape.
  const same = (ax, ay, bx, by) => Math.abs(ax - bx) < 1e-6 && Math.abs(ay - by) < 1e-6;
  for (const c of cmds) {
    if (c.type === 'M') { sp.moveTo(c.x, -c.y); sx = px = c.x; sy = py = -c.y; area = 0; continue; }
    if (c.type === 'Z') { close(); continue; }
    const x = c.x, y = -c.y;
    if (same(x, y, px, py)) continue;
    if (c.type === 'L' || (c.type === 'Q' && (same(c.x1, -c.y1, px, py) || same(c.x1, -c.y1, x, y)))) sp.lineTo(x, y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, x, y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, x, y);
    acc(x, y);
  }
  // the largest contour is an outer one; its winding tells toShapes which way is solid
  const shapes = cmds.length ? sp.toShapes(maxSign > 0) : []; // three: isCCW=false ⇒ clockwise subpaths are solid
  const out = { shapes, adv };
  glyphCache.set(key, out);
  return out;
}

export function glyphBody(shapes) {
  const g = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: false, curveSegments: 8 });
  return g;
}

// Area-weighted sampler over triangulated faces + length-weighted sampler over contour edges.
export class GlyphSampler {
  constructor(shapes) {
    this.tris = []; this.edges = []; this.area = 0; this.perimeter = 0;
    const box = new THREE.Box2();
    for (const s of shapes) {
      const { shape, holes } = s.extractPoints(8);
      const all = [shape, ...holes];
      const flat = shape.concat(...holes);
      const faces = THREE.ShapeUtils.triangulateShape(shape, holes);
      for (const [a, b, c] of faces) {
        const A = flat[a], B = flat[b], C = flat[c], ar = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
        if (ar <= 0) continue;
        this.area += ar; this.tris.push({ A, B, C, cum: this.area });
      }
      for (const ring of all) for (let i = 0; i < ring.length; i++) {
        const P = ring[i], Q = ring[(i + 1) % ring.length], len = P.distanceTo(Q);
        if (len <= 1e-6) continue;
        box.expandByPoint(P);
        this.edges.push({ P, Q, len, n: null });
      }
    }
    // outward normal per edge: whichever side is not inside the glyph
    for (const e of this.edges) {
      const mx = (e.P.x + e.Q.x) / 2, my = (e.P.y + e.Q.y) / 2, dx = (e.Q.x - e.P.x) / e.len, dy = (e.Q.y - e.P.y) / e.len;
      let nx = dy, ny = -dx;
      if (this.inside(mx + nx * 0.004, my + ny * 0.004)) { nx = -nx; ny = -ny; }
      e.n = [nx, ny];
      this.perimeter += e.len; e.cum = this.perimeter;
    }
    this.box = box;
    this.center = box.isEmpty() ? new THREE.Vector2() : box.getCenter(new THREE.Vector2());
  }
  inside(x, y) {
    for (const { A, B, C } of this.tris) {
      const d1 = (x - B.x) * (A.y - B.y) - (A.x - B.x) * (y - B.y), d2 = (x - C.x) * (B.y - C.y) - (B.x - C.x) * (y - C.y), d3 = (x - A.x) * (C.y - A.y) - (C.x - A.x) * (y - A.y);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
    }
    return false;
  }
  pick(arr, total, r) { const t = r * total; let lo = 0, hi = arr.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].cum < t) lo = m + 1; else hi = m; } return arr[lo]; }
  sampleFace(rng, out) {
    const { A, B, C } = this.pick(this.tris, this.area, rng());
    let u = rng(), v = rng(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    out.pos.set(A.x + (B.x - A.x) * u + (C.x - A.x) * v, A.y + (B.y - A.y) * u + (C.y - A.y) * v, DEPTH);
    out.normal.set(0, 0, 1); out.face = true;
    return out;
  }
  sampleRim(rng, out) {
    const e = this.pick(this.edges, this.perimeter, rng()), t = rng();
    out.pos.set(e.P.x + (e.Q.x - e.P.x) * t, e.P.y + (e.Q.y - e.P.y) * t, DEPTH * (0.15 + rng() * 0.85));
    out.normal.set(e.n[0], e.n[1], 0.25).normalize(); out.face = false;
    return out;
  }
}

// ---- base geometries (positions in a local frame: y = "up" along the surface normal / stem) ----
function geo(pos, idx, extra = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const [k, [arr, n]] of Object.entries(extra)) g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n));
  g.setIndex(idx);
  return g;
}

// moss tuft: 7 tapered blades fanning out of one root; aH = 0 root → 1 tip
export function tuftGeometry() {
  const pos = [], aH = [], idx = [];
  const blades = 7, segs = 3;
  for (let b = 0; b < blades; b++) {
    const a = b / blades * Math.PI * 2 + (b % 2) * 0.4, lean = 0.25 + (b % 3) * 0.18, w = 0.09;
    const dx = Math.cos(a), dz = Math.sin(a), base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const h = s / segs, r = lean * h * h, ww = w * (1 - h * 0.92);
      const cx = dx * r, cz = dz * r, cy = h * (0.75 + (b % 2) * 0.25);
      pos.push(cx - dz * ww, cy, cz + dx * ww, cx + dz * ww, cy, cz - dx * ww);
      aH.push(h, h);
    }
    for (let s = 0; s < segs; s++) { const i = base + s * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  return geo(pos, idx, { aH: [aH, 1] });
}

// stem tube along y ∈ [0,1], unit radius in xz
export function stemGeometry(radial = 4, segs = 8) {
  const pos = [], idx = [];
  for (let s = 0; s <= segs; s++) for (let r = 0; r < radial; r++) {
    const a = r / radial * Math.PI * 2;
    pos.push(Math.cos(a), s / segs, Math.sin(a));
  }
  for (let s = 0; s < segs; s++) for (let r = 0; r < radial; r++) {
    const a = s * radial + r, b = s * radial + (r + 1) % radial, c = a + radial, d = b + radial;
    idx.push(a, c, b, b, c, d);
  }
  return geo(pos, idx);
}

// flower: n rounded petals in the xz plane + a raised pollen disc. aR: 0 centre → 1 tip.
export function flowerGeometry(n = 5) {
  const pos = [], aR = [], aC = [], idx = [];
  const ring = 6;
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, base = pos.length / 3;
    pos.push(0, 0, 0); aR.push(0); aC.push(0);
    for (let i = 0; i <= ring; i++) {
      const t = i / ring, th = a0 + (t - 0.5) * (Math.PI * 2 / n) * 1.25;
      const r = 0.5 * (0.55 + 0.45 * Math.sin(Math.PI * t));
      pos.push(Math.cos(th) * r, 0, Math.sin(th) * r); aR.push(1); aC.push(0);
    }
    for (let i = 0; i < ring; i++) idx.push(base, base + 1 + i, base + 2 + i);
  }
  const c0 = pos.length / 3; pos.push(0, 0.03, 0); aR.push(0); aC.push(1);
  for (let i = 0; i <= 10; i++) { const th = i / 10 * Math.PI * 2; pos.push(Math.cos(th) * 0.11, 0.025, Math.sin(th) * 0.11); aR.push(0.2); aC.push(1); }
  for (let i = 0; i < 10; i++) idx.push(c0, c0 + 1 + i, c0 + 2 + i);
  return geo(pos, idx, { aR: [aR, 1], aCenter: [aC, 1] });
}

// leaf: x across ∈ [-.5,.5]·width(y), y along ∈ [0,1]
export function leafGeometry() {
  const pos = [], idx = [], N = 8;
  for (let i = 0; i <= N; i++) {
    const y = i / N, w = 0.36 * Math.sin(Math.PI * Math.pow(y, 0.8));
    pos.push(-w, y, 0, 0, y, 0, w, y, 0);
  }
  for (let i = 0; i < N; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  return geo(pos, idx);
}

// card: unit quad centred at the origin, facing +z; uv for the species atlas
export function cardGeometry() {
  return geo([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], [0, 1, 2, 0, 2, 3], { uv: [[0, 0, 1, 0, 1, 1, 0, 1], 2] });
}

// falling petal: soft teardrop fan in xy
export function petalGeometry() {
  const pos = [0, 0, 0], idx = [], N = 10;
  for (let i = 0; i <= N; i++) { const t = i / N * Math.PI * 2; pos.push(Math.cos(t) * 0.5 * (1 + 0.25 * Math.cos(t)), Math.sin(t) * 0.32, 0); }
  for (let i = 0; i < N; i++) idx.push(0, i + 1, i + 2);
  return geo(pos, idx);
}
