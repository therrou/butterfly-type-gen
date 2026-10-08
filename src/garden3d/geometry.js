// Glyph → extruded letter body + an area/perimeter sampler (front face + rim walls), and the small
// base geometries every instanced layer is built from (moss tuft, stem tube, flower disc, leaf, card, petal).
import * as THREE from 'three';
import { font, advance } from '../fonts.js';
import ClipperLib from 'clipper-lib';

export const DEPTH = 0.07; // letter thickness in em

const glyphCache = new Map();
const SCALE = 1e5; // Clipper works in integers
// Fonts may build a glyph from overlapping or self-touching outlines and rely on the renderer's non-zero
// fill rule (Novo's "B" has one inner outline looping around both counters; its "R" leg overlaps the bowl).
// Triangulation needs clean shapes with separate holes, so every glyph is flattened and merged with
// Clipper using that same non-zero rule; the result is a tree of outer shapes and their holes.
export function glyphShapes(ch, weight) {
  const key = ch + '|' + weight;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const f = font(weight), adv = advance(ch, weight);
  const cmds = f.getPath(ch, -adv / 2, 0, 1).commands; // y-down, baseline at 0, centred on x
  const sp = new THREE.ShapePath();
  // Novo also draws square corners as zero-radius curves (each corner point repeated ~4×): drop zero-length
  // segments and turn degenerate curves into straight lines before flattening.
  const same = (ax, ay, bx, by) => Math.abs(ax - bx) < 1e-6 && Math.abs(ay - by) < 1e-6;
  let px = 0, py = 0;
  for (const c of cmds) {
    if (c.type === 'M') { sp.moveTo(c.x, -c.y); px = c.x; py = -c.y; continue; }
    if (c.type === 'Z') continue;
    const x = c.x, y = -c.y;
    if (same(x, y, px, py)) continue;
    if (c.type === 'L' || (c.type === 'Q' && (same(c.x1, -c.y1, px, py) || same(c.x1, -c.y1, x, y)))) sp.lineTo(x, y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, x, y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, x, y);
    px = x; py = y;
  }
  const paths = sp.subPaths.map(p => p.getPoints(10).map(v => ({ X: Math.round(v.x * SCALE), Y: Math.round(v.y * SCALE) }))).filter(p => p.length > 2);
  const shapes = [];
  if (paths.length) {
    const clip = new ClipperLib.Clipper();
    clip.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
    const tree = new ClipperLib.PolyTree();
    clip.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    const pts = ring => ring.map(p => new THREE.Vector2(p.X / SCALE, p.Y / SCALE));
    const walk = node => {
      for (const outer of node.Childs()) {
        const shape = new THREE.Shape(pts(outer.Contour()));
        for (const hole of outer.Childs()) { shape.holes.push(new THREE.Path(pts(hole.Contour()))); walk(hole); } // islands inside holes
        shapes.push(shape);
      }
    };
    walk(tree);
  }
  const out = { shapes, adv };
  glyphCache.set(key, out);
  return out;
}

// bevel > 0 rounds the edges (wood): the bevel is cut into the outline and the slab, so the front face
// stays at z = DEPTH and the outline the sampler sees is unchanged
export function glyphBody(shapes, bevel = 0) {
  if (!bevel) return new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: false, curveSegments: 8 });
  const g = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, bevel);
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

// mushroom: stalk (aH 0 → 0.55) under a domed cap (underside 0.6 → crown 1), y up
export function mushroomGeometry() {
  const pos = [], aH = [], idx = [], R = 8;
  const ring = (y, r, h) => { const b = pos.length / 3; for (let i = 0; i < R; i++) { const a = i / R * Math.PI * 2; pos.push(Math.cos(a) * r, y, Math.sin(a) * r); aH.push(h); } return b; };
  const band = (a, b) => { for (let i = 0; i < R; i++) { const j = (i + 1) % R; idx.push(a + i, b + i, a + j, a + j, b + i, b + j); } };
  const s0 = ring(0, 0.07, 0), s1 = ring(0.32, 0.06, 0.3), s2 = ring(0.56, 0.055, 0.55);
  band(s0, s1); band(s1, s2);
  const under = ring(0.5, 0.06, 0.58), lip = ring(0.52, 0.32, 0.62);
  band(under, lip);
  let prev = lip;
  for (const [y, r, h] of [[0.63, 0.3, 0.75], [0.72, 0.22, 0.88], [0.77, 0.11, 0.96]]) { const c = ring(y, r, h); band(prev, c); prev = c; }
  const top = pos.length / 3; pos.push(0, 0.79, 0); aH.push(1);
  for (let i = 0; i < R; i++) idx.push(prev + i, top, prev + (i + 1) % R);
  return geo(pos, idx, { aH: [aH, 1] });
}

// bracket fungus: a half-disc shelf in the local x–y plane (y = out of the wood), slightly domed.
// aH 0 at the wood → 1 at the rim; concentric bands are drawn by the colour ramp
export function bracketGeometry() {
  const pos = [], aH = [], idx = [], A = 9, Rn = 4;
  pos.push(0, 0, 0); aH.push(0);
  for (let k = 1; k <= Rn; k++) for (let i = 0; i <= A; i++) {
    const t = k / Rn, a = i / A * Math.PI, w = 0.5 * t, l = 0.38 * t * (0.85 + 0.15 * Math.sin(a * 3));
    pos.push(Math.cos(a) * w, Math.sin(a) * l, 0.08 * (1 - t * t)); aH.push(t);
  }
  for (let i = 0; i < A; i++) idx.push(0, 1 + i, 2 + i);
  for (let k = 1; k < Rn; k++) for (let i = 0; i < A; i++) {
    const a = 1 + (k - 1) * (A + 1) + i, b = a + A + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return geo(pos, idx, { aH: [aH, 1] });
}

// caterpillar: SEGS unit spheres, aSeg = 0 head → SEGS-1 tail; the shader lays them along the crawl path
export const CATER_SEGS = 8;
export function caterpillarGeometry() {
  const pos = [], seg = [], idx = [], LAT = 5, LON = 8;
  for (let k = 0; k < CATER_SEGS; k++) {
    const b = pos.length / 3;
    for (let i = 0; i <= LAT; i++) for (let j = 0; j < LON; j++) {
      const th = i / LAT * Math.PI, ph = j / LON * Math.PI * 2;
      pos.push(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)); seg.push(k);
    }
    for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
      const a = b + i * LON + j, c = b + i * LON + (j + 1) % LON;
      idx.push(a, a + LON, c, c, a + LON, c + LON);
    }
  }
  return geo(pos, idx, { aSeg: [seg, 1] });
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

// ---- bark map: a per-glyph texture so bark furrows run along each stroke like a limb ----
// The stroke direction at a point is the (double-angle averaged) tangent of the nearby outline edges,
// worked out on a coarse grid; the bark itself is blotchy noise smeared along that field (line integral
// convolution), so ridges follow the strokes and bend round bowls. RGBA = bark, distance to the edge
// (for the rounded cross-section), direction (cos 2θ, sin 2θ). Cached per glyph.
const barkCache = new Map();
export function barkMap(key, sampler, N = 208) {
  if (barkCache.has(key)) return barkCache.get(key);
  const b = sampler.box, pad = 0.02, x0 = b.min.x - pad, y0 = b.min.y - pad, size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y) + pad * 2;
  const G = 72, fx = new Float32Array(G * G), fy = new Float32Array(G * G), fd = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const px = x0 + (i + 0.5) / G * size, py = y0 + (j + 0.5) / G * size;
    let sx = 0, sy = 0, dmin = 1e9;
    for (const e of sampler.edges) {
      const ex = e.Q.x - e.P.x, ey = e.Q.y - e.P.y, t = Math.max(0, Math.min(1, ((px - e.P.x) * ex + (py - e.P.y) * ey) / (e.len * e.len)));
      const dx = px - e.P.x - ex * t, dy = py - e.P.y - ey * t, d2 = dx * dx + dy * dy;
      dmin = Math.min(dmin, d2);
      const w = e.len / (d2 + 4e-4), c = ex / e.len, s = ey / e.len;
      sx += (c * c - s * s) * w; sy += 2 * c * s * w;
    }
    const k = j * G + i, l = Math.hypot(sx, sy) || 1;
    fx[k] = sx / l; fy[k] = sy / l; fd[k] = Math.sqrt(dmin);
  }
  const field = (u, v) => { // bilinear, u/v in grid cells
    const i = Math.max(0, Math.min(G - 2, Math.floor(u - 0.5))), j = Math.max(0, Math.min(G - 2, Math.floor(v - 0.5))), a = Math.min(1, Math.max(0, u - 0.5 - i)), c = Math.min(1, Math.max(0, v - 0.5 - j));
    const L = (A) => (A[j * G + i] * (1 - a) + A[j * G + i + 1] * a) * (1 - c) + (A[(j + 1) * G + i] * (1 - a) + A[(j + 1) * G + i + 1] * a) * c;
    return [L(fx), L(fy), L(fd)];
  };
  // blotchy source noise: a few octaves of value noise, stretched later by the convolution
  let h = 2166136261 ^ key.length;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const M = 64, base = new Float32Array(M * M);
  for (let i = 0; i < base.length; i++) { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; base[i] = ((h >>> 0) % 1000) / 1000; }
  const vnoise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), a = x - i, c = y - j, s = t => t * t * (3 - 2 * t), A = s(a), C = s(c), at = (p, q) => base[((q % M + M) % M) * M + ((p % M + M) % M)];
    return (at(i, j) * (1 - A) + at(i + 1, j) * A) * (1 - C) + (at(i, j + 1) * (1 - A) + at(i + 1, j + 1) * A) * C; };
  const src = (x, y) => vnoise(x * 0.3, y * 0.3) * 0.6 + vnoise(x * 0.75 + 17, y * 0.75) * 0.4;
  // per texel: tangent (one of its two signs), edge distance and source noise, so the convolution is lookups
  const g = G / N, TX = new Float32Array(N * N), TY = new Float32Array(N * N), D = new Float32Array(N * N), C2 = new Float32Array(N * N), S2 = new Float32Array(N * N), SRC = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, [c2, s2, d] = field((i + 0.5) * g, (j + 0.5) * g), th = Math.atan2(s2, c2) / 2;
    TX[k] = Math.cos(th); TY[k] = Math.sin(th); D[k] = d; C2[k] = c2; S2[k] = s2; SRC[k] = src(i * 320 / N, j * 320 / N);
  }
  const out = new Uint8Array(N * N * 4), STEPS = 24, H = 1.9 * N / 320;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let acc = SRC[j * N + i], n = 1;
    for (const dir of [1, -1]) {
      let x = i + 0.5, y = j + 0.5, px = TX[j * N + i] * dir, py = TY[j * N + i] * dir;
      for (let s = 1; s <= STEPS; s++) {
        x += px * H; y += py * H;
        const xi = x | 0, yi = y | 0;
        if (xi < 0 || yi < 0 || xi >= N || yi >= N) break;
        const k = yi * N + xi;
        let tx = TX[k], ty = TY[k];
        if (tx * px + ty * py < 0) { tx = -tx; ty = -ty; } // keep heading the same way along the line
        px = tx; py = ty;
        const w = 1 - s / (STEPS + 1); acc += SRC[k] * w; n += w;
      }
    }
    const k = j * N + i, o = k * 4;
    out[o] = Math.round(Math.min(1, Math.max(0, (acc / n - 0.5) * 4.0 + 0.5)) * 255);
    out[o + 1] = Math.round(Math.min(1, D[k] / 0.12) * 255);
    out[o + 2] = Math.round((C2[k] * 0.5 + 0.5) * 255); out[o + 3] = Math.round((S2[k] * 0.5 + 0.5) * 255);
  }
  const res = { data: out, N, box: [x0, y0, size] };
  barkCache.set(key, res);
  return res;
}
