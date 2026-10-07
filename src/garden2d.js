// 2D engine — a port of Type Garden (Akshat Agarwal) for the butterfly-type brand tool.
// Growth, weaving, roses, wither/cut mechanics and the poster motions follow the original closely;
// changes: Novo, brand colourways, species blooms/leaves/critters from the library, the glass
// butterflies from the film, and a poster box of any size (A-series) instead of a 1080 square.
import { getSpecies, drawSpecies, speciesSVG } from './species.js';
import { glyphPathData } from './fonts.js';

export const VISIT_MS = 7000; // the visitor butterfly's flight (arrive, perch, hop, perch, leave)
export const ROSE = 'v:rose'; // the vector rose, offered as a catalogue item in 2D

export const MOTIONS = [
  { id: 'breathe', label: 'Breathe', sub: 'Slow sway · 3s', T: 3000 },
  { id: 'grow', label: 'Grow & wither', sub: 'Bloom, then back · 6s', T: 6000 },
  { id: 'typed', label: 'Typed', sub: 'Type, then a visitor', T: 5000 },
  { id: 'wind', label: 'Gust', sub: 'Wind sweeps through · 4s', T: 4000 },
  { id: 'reach', label: 'Reach', sub: 'Stems follow a light · 6s', T: 6000 },
  { id: 'scatter', label: 'Scatter', sub: 'Random bloom, fade · 6s', T: 6000 },
  { id: 'visit', label: 'Visitor', sub: 'Butterfly drops by · 7s', T: 7000 },
];

// ---- glass butterfly sprite: wings-pair.png split at the body so each half can flap ----
const SPR = { ok: false };
export async function loadButterflySprite() {
  const img = new Image(); img.src = '/img/wings-pair.png'; await img.decode();
  const half = (sx) => { const c = document.createElement('canvas'); c.width = img.width / 2; c.height = img.height; c.getContext('2d').drawImage(img, -sx, 0); return c; };
  SPR.L = half(0); SPR.R = half(img.width / 2); SPR.ar = img.height / img.width;
  SPR.Lurl = SPR.L.toDataURL(); SPR.Rurl = SPR.R.toDataURL(); SPR.ok = true;
}

export class Garden2D {
  constructor() {
    this.letters = []; this.uid = 1; this.cache = {}; this.Sd = 0; this.St = 0; this.wrapped = false;
    this.t0 = performance.now(); this.lastKey = 0; this.rand = Math.random;
    this.flies = []; this.perch = []; this.fa = {}; this.mx = null; this.my = null; this.lastSpawn = 0;
    this.opts = { weight: 400, density: 1, butterflies: 4, boil: true, recoil: 20, recipe: null, cw: null };
    this.mctx = document.createElement('canvas').getContext('2d');
  }
  font(S) { return `${this.opts.weight} ${S}px Novo, sans-serif`; }
  setOpts(o) {
    const wChanged = o.weight != null && o.weight !== this.opts.weight;
    Object.assign(this.opts, o);
    if (wChanged) { this.cache = {}; this.layout(true); }
  }

  // ---------- math ----------
  h(n) { const x = Math.sin(n) * 43758.5453; return x - Math.floor(x); }
  spr(t, k = 7, w = 16) { if (t <= 0) return 0; return 1 - Math.exp(-t * k) * Math.cos(t * w); }
  eo(t) { if (t <= 0) return 0; if (t >= 1) return 1; return 1 - Math.pow(1 - t, 3); }
  rng(seed) {
    let s = seed | 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  bez(a, b, c, d, n) {
    const P = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t;
      P.push([u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0], u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1]]); }
    return P;
  }
  at(P, u) {
    const n = P.length; const i = Math.min(n - 2, Math.max(1, Math.round(u * (n - 1))));
    return [P[i], Math.atan2(P[i+1][1] - P[i-1][1], P[i+1][0] - P[i-1][0])];
  }
  jit(id, f, amp) {
    if (!amp) return [0, 0, 0];
    return [(this.h(id*1.37 + f*7.13)*2 - 1)*amp, (this.h(id*2.71 + f*3.11)*2 - 1)*amp, (this.h(id*5.3 + f*1.7)*2 - 1)*0.035];
  }
  path(c, p, closed) {
    const n = p.length; if (n < 2) return;
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (closed) {
      const s = m(p[n-1], p[0]); c.moveTo(s[0], s[1]);
      for (let i = 0; i < n; i++) { const q = m(p[i], p[(i+1) % n]); c.quadraticCurveTo(p[i][0], p[i][1], q[0], q[1]); }
      c.closePath();
    } else {
      c.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < n - 1; i++) { const q = m(p[i], p[i+1]); c.quadraticCurveTo(p[i][0], p[i][1], q[0], q[1]); }
      c.lineTo(p[n-1][0], p[n-1][1]);
    }
  }

  // ---------- backends: canvas + SVG share every drawing call ----------
  canvasBackend(g) {
    return {
      g,
      fill: (p, col) => { g.beginPath(); this.path(g, p, true); g.fillStyle = col; g.fill(); },
      stroke: (p, col, w) => { g.beginPath(); this.path(g, p, false); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); },
      rect: (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); },
      text: (ch, x, y, S, col) => { g.font = this.font(S); g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = col; g.fillText(ch, x, y); },
      species: (sp, x, y, size, rot, opts) => drawSpecies(g, sp, x, y, size, rot, this.opts.cw, opts),
      fly: (x, y, w, ang, o, alpha) => {
        if (!SPR.ok) return;
        const h = w * SPR.ar, half = w / 2, k = 0.12 + 0.88 * o;
        g.save(); g.translate(x, y); g.rotate(ang); g.globalAlpha *= alpha ?? 1;
        g.drawImage(SPR.L, -half * k, -h / 2, half * k, h);
        g.drawImage(SPR.R, 0, -h / 2, half * k, h);
        g.restore();
      },
      alpha: a => { g.globalAlpha = a; },
    };
  }
  svgBackend(parts) {
    const n = v => Math.round(v * 100) / 100;
    let alpha = 1;
    const op = () => alpha < 1 ? ` opacity="${n(alpha)}"` : '';
    const pb = () => ({ d: '', moveTo(x, y) { this.d += `M${n(x)} ${n(y)}`; }, lineTo(x, y) { this.d += `L${n(x)} ${n(y)}`; }, quadraticCurveTo(a, b, x, y) { this.d += `Q${n(a)} ${n(b)} ${n(x)} ${n(y)}`; }, closePath() { this.d += 'Z'; } });
    return {
      fill: (p, col) => { const b = pb(); this.path(b, p, true); parts.push(`<path d="${b.d}" fill="${col}"${op()}/>`); },
      stroke: (p, col, w) => { const b = pb(); this.path(b, p, false); parts.push(`<path d="${b.d}" fill="none" stroke="${col}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round"${op()}/>`); },
      rect: (x, y, w, h, col) => parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${col}"/>`),
      text: (ch, x, y, S, col) => parts.push(`<path d="${glyphPathData(ch, x, y, S, this.opts.weight)}" fill="${col}"${op()}/>`),
      species: (sp, x, y, size, rot, opts) => parts.push(speciesSVG(sp, x, y, size, rot, this.opts.cw, { ...opts, alpha: (opts?.alpha ?? 1) * alpha })),
      fly: (x, y, w, ang, o) => {
        if (!SPR.ok) return;
        const h = w * SPR.ar, half = w / 2, k = 0.12 + 0.88 * o;
        parts.push(`<g transform="translate(${n(x)} ${n(y)}) rotate(${n(ang * 180 / Math.PI)})"${op()}><image href="${SPR.Lurl}" x="${n(-half * k)}" y="${n(-h / 2)}" width="${n(half * k)}" height="${n(h)}" preserveAspectRatio="none"/><image href="${SPR.Rurl}" x="0" y="${n(-h / 2)}" width="${n(half * k)}" height="${n(h)}" preserveAspectRatio="none"/></g>`);
      },
      alpha: a => { alpha = a; },
    };
  }
  get C() { const c = this.opts.cw; return { red: c.flower, blue: c.stem, line: c.line, text: c.type, vein: c.bg }; }

  vine(base, dir, len, amp, waves, ph, bend, n) {
    n = n || 40; const P = [[base[0], base[1]]], step = len / n; let x = base[0], y = base[1];
    for (let i = 1; i <= n; i++) {
      const u = i / n, a = dir + bend * u + amp * Math.sin(u * Math.PI * waves + ph) * Math.min(1, u * 3);
      x += Math.cos(a) * step; y += Math.sin(a) * step; P.push([x, y]);
    }
    return P;
  }
  curl(P, sign, rad) {
    const n = P.length, e = P[n - 1], a = Math.atan2(e[1] - P[n - 2][1], e[0] - P[n - 2][0]);
    const c = [e[0] - Math.sin(a) * sign * rad, e[1] + Math.cos(a) * sign * rad];
    const a0 = Math.atan2(e[1] - c[1], e[0] - c[0]);
    for (let i = 1; i <= 14; i++) { const u = i / 14, t = a0 + sign * u * Math.PI * 1.6, rr = rad * (1 - 0.5 * u); P.push([c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr]); }
    return P;
  }
  weave(r, startLayer) {
    const cuts = []; const nc = 1 + Math.floor(r() * 3);
    for (let i = 0; i < nc; i++) cuts.push(0.15 + r() * 0.7);
    cuts.sort((a, b) => a - b);
    const segs = []; let u0 = 0, layer = startLayer;
    for (const c of cuts) {
      if (c <= u0) continue;
      segs.push({ u0, u1: c, layer });
      if (r() < 0.3) { const g = 0.02 + r() * 0.03; u0 = Math.min(0.98, c + g); } else u0 = c;
      layer = 1 - layer;
    }
    segs.push({ u0, u1: 1, layer });
    return segs;
  }
  layerAt(segs, u) { for (const s of segs) if (u >= s.u0 && u <= s.u1) return s.layer; return segs[segs.length - 1].layer; }

  // ---------- layout ----------
  resize(W, H) { this.W = W; this.H = H; this.layout(true); }
  mw(ch) {
    if (this.cache[ch] != null) return this.cache[ch];
    this.mctx.font = this.font(100);
    let w = this.mctx.measureText(ch).width / 100;
    if (ch === ' ') w *= 1.4;
    return (this.cache[ch] = w);
  }
  layoutCore(A, W, H, prevWrapped, force) {
    const maxW = W * 0.8, S0 = H * 0.28, LH = 2.1;
    const ws = A.map(l => this.mw(l.ch));
    const words = []; let cur = null;
    A.forEach((l, i) => {
      if (l.ch === ' ') { if (cur) { words.push(cur); cur = null; } words.push({ sp: true, idx: [i] }); }
      else { if (!cur) cur = { idx: [] }; cur.idx.push(i); }
    });
    if (cur) words.push(cur);
    const lineW = (li, S) => { let e = li.length; while (e > 0 && A[li[e-1]].ch === ' ') e--; let w = 0; for (let k = 0; k < e; k++) w += ws[li[k]]; return w * S; };
    const wrap = S => {
      const lines = [[]]; let lw = 0;
      for (const w of words) {
        const ww = w.idx.reduce((s, i) => s + ws[i], 0) * S;
        if (!w.sp && lw > 0 && lw + ww > maxW) { lines.push([]); lw = 0; }
        lines[lines.length - 1].push(...w.idx); lw += ww;
      }
      return lines;
    };
    let lines = [A.map((_, i) => i)];
    const unit = lineW(lines[0], 1);
    let S = unit > 0 ? Math.min(S0, maxW / unit) : S0;
    const multi = words.filter(w => !w.sp).length > 1;
    let wrapped = multi && (force || S < H * 0.1 || (prevWrapped && S < H * 0.14));
    if (wrapped) {
      let lo = H * 0.03, hi = force ? H * 0.2 : H * 0.15;
      for (let k = 0; k < 22; k++) {
        const mid = (lo + hi) / 2, ls = wrap(mid);
        const ok = ls.every(li => lineW(li, mid) <= maxW) && ls.length * LH * mid <= H * 0.82;
        if (ok) lo = mid; else hi = mid;
      }
      S = lo; lines = wrap(S);
      if (lines.length < 2) wrapped = false;
    }
    const n = lines.length, lh = LH * S;
    lines.forEach((li, k) => {
      let x = W / 2 - lineW(li, S) / 2;
      const y = H / 2 + (k - (n - 1) / 2) * lh + 0.33 * S;
      li.forEach(i => { const l = A[i], w = ws[i] * S; l.tx = x + w / 2; l.ty = y; l.tw = w; l.line = k; x += w; });
    });
    return { S, wrapped, n };
  }
  layout(snap) {
    if (!this.W) return;
    const A = this.letters.filter(l => !l.dead);
    // Line breaks come from the stable full-screen height (layoutH), so opening the on-screen keyboard
    // doesn't re-wrap the words; the block is then scaled to fit the visible height around its centre.
    const LH = this.layoutH && this.layoutH > this.H ? this.layoutH : this.H;
    const res = this.layoutCore(A, this.W, LH, this.wrapped);
    if (LH !== this.H) {
      // keyboard open: fit into the visible height below the toolbar (topPad)
      const pad = this.topPad || 0, avail = Math.max(1, this.H - pad);
      const k = Math.min(1, (avail * 0.8) / Math.max(1, res.n * 2.1 * res.S));
      for (const l of A) { l.tx = this.W / 2 + (l.tx - this.W / 2) * k; l.ty = pad + avail / 2 + (l.ty - LH / 2) * k; l.tw *= k; }
      res.S *= k;
    }
    this.wrapped = res.wrapped;
    A.forEach(l => { if (l.x == null) { l.x = l.tx; l.y = l.ty; } });
    const S = res.S, last = A[A.length - 1];
    this.St = S;
    this.ctx_ = last ? last.tx + last.tw / 2 + 0.07 * S : this.W / 2;
    this.cty = last ? last.ty - 0.33 * S : this.H / 2;
    if (snap || !this.Sd) { this.Sd = S; this.cx = this.ctx_; this.cy = this.cty; A.forEach(l => { l.x = l.tx; l.y = l.ty; }); }
  }

  // ---------- input ----------
  backspace() {
    const now = performance.now(); this.lastKey = now;
    const A = this.letters.filter(l => !l.dead), last = A[A.length - 1];
    if (!last) return;
    last.dead = now;
    const pv = A[A.length - 2];
    if (pv && pv.ch !== ' ') { pv.cut = null; pv.endEls = null; pv.tb = now; }
    this.layout();
  }
  clear() { this.letters = []; this.flies.forEach(f => this.flyOff(f)); this.layout(); }
  setText(str) { this.letters = []; for (const ch of str) this.add(ch, performance.now() - 5000); this.layout(true); }
  add(ch, now = performance.now()) {
    this.lastKey = now;
    const A = this.letters.filter(l => !l.dead), last = A[A.length - 1];
    if (ch === ' ') {
      if (last && last.ch !== ' ') { last.cut = now; this.genEnd(last, now - last.birth); }
      this.letters.push({ ch: ' ', id: this.uid++, birth: now, els: [] });
      this.layout(); return;
    }
    const same = last && last.ch !== ' ';
    const l = { ch, id: this.uid++, birth: now, tb: now, ws: same ? last.ws : Math.floor(this.rand() * 1e9), wi: same ? last.wi + 1 : 0, prev: same ? last : null };
    this.gen(l);
    this.letters.push(l);
    this.layout();
  }
  // re-grow every letter with fresh seeds (keeps the text)
  reseed() { const s = this.letters.filter(l => !l.dead).map(l => l.ch).join(''); this.setText(s); }

  // ---------- growth ----------
  wordParams(ws) {
    const r = this.rng(ws * 7 + 13), dens = this.opts.density ?? 1;
    return { roseP: 0.3 + r() * 0.3, leafy: (0.6 + r() * 0.8) * dens, dens, lean: (r() - 0.5) * 0.6, big: 0.85 + r() * 0.45, curvy: 0.8 + r() * 0.6, bridgeP: Math.min(0.95, (0.45 + r() * 0.35) * dens), w: 0.5 };
  }
  recipe() { return this.opts.recipe || { roses: 1, blooms: [], leaves: [], critters: [] }; }
  // Bloom for a stem tip: null = the hand-drawn rose ('v:rose' in the catalogue). Selected species are
  // used in turn (not at random) so every one picked in the catalogue actually shows up.
  pickBloom(r) {
    const R = this.recipe(), others = R.blooms.filter(id => id !== ROSE);
    if (!others.length) return null;
    if (R.blooms.includes(ROSE) && r() < R.roses) return null;
    return others[(this.bi = (this.bi || 0) + 1) % others.length];
  }
  cycle(list, key) { this[key] = (this[key] || 0) + 1; return list[this[key] % list.length]; }
  grow(r, E, nid, p, o) {
    let tip = o.tip || (r() < p.roseP ? 'rose' : r() < 0.45 ? 'fan' : r() < 0.6 ? 'leaf' : 'curl');
    if (tip === 'rose' && !this.recipe().blooms.length) tip = 'fan'; // catalogue "None": no blooms at all
    let P = o.pts || this.vine(o.base, o.dir, o.len, (0.35 + r() * 0.45) * p.curvy, 1 + r() * 1.6, r() * 6.28, (r() - 0.5) * 1.2, 40);
    if (tip === 'curl') P = this.curl(P, r() < 0.5 ? -1 : 1, 0.05 + r() * 0.05);
    const segs = this.weave(r, o.layer0 != null ? o.layer0 : (r() < 0.5 ? 0 : 1));
    const dur = Math.max(320, (o.len || 0.8) * 620);
    const thorns = []; const nt = Math.floor(r() * 2.5);
    for (let i = 0; i < nt; i++) thorns.push({ u: 0.15 + r() * 0.65, s: r() < 0.5 ? -1 : 1 });
    E.push({ t: 'stem', id: nid(), pts: P, segs, d0: o.d0, dur, w: o.depth ? 0.82 : 1, thorns });
    const R = this.recipe();
    const nl = Math.floor(r() * 2.8 * p.leafy);
    let sd = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < nl; i++) {
      const u = 0.25 + r() * 0.6, [q, a] = this.at(P, u); sd = -sd;
      const sp = R.leaves.length && r() < (R.leafP ?? 0.35) ? this.cycle(R.leaves, 'li') : null;
      E.push({ t: 'leaf', id: nid(), x: q[0], y: q[1], a: a + sd * (0.55 + r() * 0.5), L: (0.14 + r() * 0.2) * (o.depth ? 0.8 : 1) * (sp ? 1.3 : 1), bend: (r() - 0.5) * 1.2, layer: this.layerAt(segs, u), d0: o.d0 + dur * u, sp });
    }
    // a critter sometimes sits on the stem
    if (R.critters.length && !o.depth && r() < (R.critterP ?? 0.22)) {
      const u = 0.4 + r() * 0.4, [q, a] = this.at(P, u);
      E.push({ t: 'critter', id: nid(), x: q[0], y: q[1], a, sp: this.cycle(R.critters, 'ci'), L: 0.16 + r() * 0.08, layer: 1, d0: o.d0 + dur + 400 + r() * 600, flip: r() < 0.5, hover: r() });
    }
    const [tp, ta] = this.at(P, 1), td = o.d0 + dur * 0.8, tl = this.layerAt(segs, 1);
    if (tip === 'rose') {
      const R0 = (0.13 + r() * 0.15) * p.big * (o.depth ? 0.75 : 1);
      const over = tp[1] > -0.78 && tp[1] < 0.05 && Math.abs(tp[0]) < p.w * 0.5;
      const layer = over ? (r() < 0.22 ? 1 : 0) : (r() < 0.6 ? 1 : tl);
      const sp = this.pickBloom(r);
      E.push({ t: 'rose', id: nid(), x: tp[0], y: tp[1], R: R0, rot: (r() - 0.5) * 1.0, ph1: r() * 6.28, ph2: r() * 6.28, turns: 1.8 + r() * 1, layer, d0: td, sp });
      if (r() < 0.2) { const oo = ta + (r() < 0.5 ? 1 : -1) * 1.3; E.push({ t: 'rose', id: nid(), x: tp[0] + Math.cos(oo) * R0 * 1.4, y: tp[1] + Math.sin(oo) * R0 * 1.4, R: R0 * (0.6 + r() * 0.3), rot: (r() - 0.5) * 1.2, ph1: r() * 6.28, ph2: r() * 6.28, turns: 1.8 + r(), layer, d0: td + 120, sp: this.pickBloom(r) }); }
    } else if (tip === 'fan') {
      const spread = 0.6 + r() * 0.3;
      for (let j = 0; j < 2; j++) E.push({ t: 'leaf', id: nid(), x: tp[0], y: tp[1], a: ta + (j - 0.5) * spread, L: 0.2 + r() * 0.2, bend: (j - 0.5) * 0.8, layer: tl, d0: td + j * 60 });
    } else if (tip === 'leaf') {
      E.push({ t: 'leaf', id: nid(), x: tp[0], y: tp[1], a: ta + (r() - 0.5) * 0.3, L: 0.16 + r() * 0.16, bend: (r() - 0.5), layer: tl, d0: td });
    }
    if (!o.depth && r() < 0.3) {
      const u = 0.35 + r() * 0.35, [q, a] = this.at(P, u);
      this.grow(r, E, nid, p, { base: q, dir: a + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.4), len: (o.len || 0.8) * (0.35 + r() * 0.2), d0: o.d0 + dur * u, depth: 1, layer0: this.layerAt(segs, u) });
    }
    return P;
  }
  gen(l) {
    const r = this.rng((l.ws ^ Math.imul(l.wi + 1, 2654435761)) + Math.floor(this.rand() * 1e6));
    const p = this.wordParams(l.ws), E = []; let k0 = 0; const nid = () => l.id * 100 + (k0++);
    const w = this.mw(l.ch), inX = () => (r() - 0.5) * w * 0.7; p.w = w;
    const nUp = 1 + (r() < 0.45 * p.dens ? 1 : 0);
    for (let i = 0; i < nUp; i++) {
      this.grow(r, E, nid, p, { base: [inX(), -r() * 0.3], dir: -Math.PI / 2 + p.lean * 0.5 + (r() - 0.5) * 0.7, len: 0.6 + r() * 0.5, d0: 40 + i * 130, tip: l.wi === 0 && i === 0 ? 'rose' : null });
    }
    if (r() < 0.4 * p.dens) this.grow(r, E, nid, p, { base: [inX(), -0.1 - r() * 0.35], dir: Math.PI / 2 + (r() - 0.5) * 0.8, len: 0.35 + r() * 0.35, d0: 160 });
    if (l.prev && r() < p.bridgeP) {
      const px = -(this.mw(l.prev.ch) + w) / 2;
      const a = [inX(), -0.05 - r() * 0.55], b = [px + (r() - 0.5) * 0.25, -0.05 - r() * 0.55];
      const bulge = (r() < 0.55 ? -1 : 1) * (0.4 + r() * 0.4), dx = b[0] - a[0];
      let P = this.bez(a, [a[0] + dx * 0.15, a[1] + bulge], [b[0] - dx * 0.15, b[1] + bulge * 0.9], b, 40);
      if (r() < 0.45) P = P.slice(0, Math.floor(P.length * (0.7 + r() * 0.2)));
      this.grow(r, E, nid, p, { pts: P, len: Math.abs(dx) + Math.abs(bulge), d0: 90, tip: r() < 0.5 ? 'curl' : r() < 0.5 ? 'leaf' : 'rose' });
    }
    if (l.wi === 0) this.grow(r, E, nid, p, { base: [-w * 0.3, -0.15 - r() * 0.4], dir: Math.PI + (r() - 0.5) * 1.2, len: 0.45 + r() * 0.3, d0: 120, tip: 'curl' });
    l.els = E;
    l.endEls = null;
    const T = [], tr = this.rng(l.id * 977 + Math.floor(this.rand() * 1e6));
    this.grow(tr, T, () => l.id * 100 + 90 + T.length, p, { base: [w * 0.25, -0.1 - tr() * 0.45], dir: (tr() - 0.5) * 1.4, len: 0.45 + tr() * 0.25, d0: 0, tip: 'curl', depth: 1 });
    l.tend = T.filter(e => e.t === 'stem').slice(0, 1);
  }
  genEnd(l, rel) {
    const r = this.rng(l.ws + l.wi * 31 + Math.floor(this.rand() * 1e6)), p = this.wordParams(l.ws), E = [];
    let k0 = 50; const nid = () => l.id * 100 + (k0++);
    const w = this.mw(l.ch), n = 1 + Math.floor(r() * 2.5); p.w = w;
    for (let i = 0; i < n; i++) {
      const dir = -Math.PI / 2 + 0.6 + (i - (n - 1) / 2) * 0.9 + (r() - 0.5) * 0.4;
      this.grow(r, E, nid, p, { base: [(r() - 0.2) * w * 0.6, -r() * 0.5], dir, len: 0.4 + r() * 0.45, d0: rel + 40 + i * 90, depth: 1, tip: i === 0 || r() < 0.5 ? 'rose' : 'fan' });
    }
    l.endEls = E;
  }

  strokeRange(B, P, a, b, col, w) {
    const n = P.length - 1, ia = a * n, ib = b * n;
    const lerp = t => { const i = Math.min(n - 1, Math.floor(t)), f = t - i; return [P[i][0] + (P[i+1][0] - P[i][0]) * f, P[i][1] + (P[i+1][1] - P[i][1]) * f]; };
    const pts = [lerp(ia)];
    for (let i = Math.floor(ia) + 1; i < ib; i++) pts.push(P[i]);
    pts.push(lerp(ib));
    if (pts.length >= 2) B.stroke(pts, col, w);
  }
  thorn(B, P, u, s, S) {
    const [p, a] = this.at(P, u), d = a + s * 2.3, L = S * 0.045;
    B.stroke([p, [p[0] + Math.cos(d) * L, p[1] + Math.sin(d) * L]], this.cc.blue, S * 0.022);
  }
  leaf(B, bx, by, a, L, bend) {
    if (L < 0.5) return;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const ax = u => { const b = Math.sin(Math.PI * u) * bend * 0.15 * L; return [bx + ca * u * L + px * b, by + sa * u * L + py * b]; };
    const hw = u => L * 0.18 * Math.sin(Math.PI * Math.pow(u, 0.8));
    const N = 12, s1 = [], s2 = [];
    for (let i = 0; i <= N; i++) { const u = i / N, c = ax(u), w = hw(u); s1.push([c[0] + px * w, c[1] + py * w]); s2.push([c[0] - px * w, c[1] - py * w]); }
    const tip = ax(1), base = ax(0);
    B.fill([base, ...s1.slice(1, N), tip, tip, ...s2.slice(1, N).reverse(), base], this.cc.blue);
    if (L > 6) { const v = []; for (let i = 0; i <= 8; i++) v.push(ax(0.08 + 0.72 * i / 8)); B.stroke(v, this.cc.vein, Math.max(0.8, L * 0.03)); }
  }
  rose(B, cx, cy, R, rot, e, a, tl) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const tm = tl ? Math.hypot(tl[0], tl[1]) : 0, ux = tm ? tl[0] / tm : 0, uy = tm ? tl[1] / tm : 0, sq = -0.28 * tm;
    const T = (x, y, z = 0) => {
      let dx = x * cr - y * sr, dy = x * sr + y * cr;
      if (tm) { const k = (dx * ux + dy * uy) * sq; dx += k * ux + tl[0] * R * z; dy += k * uy + tl[1] * R * z; }
      return [cx + dx, cy + dy];
    };
    const P = [
      [0, -0.36, 0.56, 0.54, 0, 0, 0],
      [-0.5, -0.06, 0.6, 0.6, -0.35, 0, 0],
      [0.52, -0.06, 0.6, 0.6, 0.35, 0, 0],
      [-0.42, 0.3, 0.62, 0.48, 0.2, 0.12, 1],
      [0.47, 0.3, 0.62, 0.48, -0.2, 0.12, 1],
      [0.05, 0.42, 0.56, 0.38, 0, 0.14, 0]
    ];
    const ax0 = 0, ay0 = 0.5, lw = Math.max(0.8, R * 0.045), st = 85;
    P.forEach((q, i) => {
      const s = this.spr((a - i * st) / 1000, 8, 14); if (s <= 0.001) return;
      const open = (1 - Math.min(1, s)) * (q[0] < 0 ? 0.5 : -0.5), ang = q[4] + open, ca = Math.cos(ang), sa = Math.sin(ang);
      const pt = (th) => {
        const rr = 1 + 0.08 * Math.sin(3 * th + e.ph1 + i) + 0.04 * Math.sin(5 * th + e.ph2);
        const lx = Math.cos(th) * q[2] * rr, ly = Math.sin(th) * q[3] * rr;
        const px = q[0] + lx * ca - ly * sa, py = q[1] + lx * sa + ly * ca;
        return T((ax0 + (px - ax0) * s) * R, (ay0 + (py - ay0) * s) * R, q[5]);
      };
      const pts = []; for (let k = 0; k < 26; k++) pts.push(pt(k / 26 * Math.PI * 2));
      B.fill(pts, this.cc.red);
      if (q[6] && R >= 12 && s > 0.4) {
        const arc = []; for (let k = 0; k <= 14; k++) arc.push(pt(Math.PI * (1.18 + 0.64 * k / 14)));
        this.strokeRange(B, arc, 0, Math.min(1, (s - 0.4) / 0.5), this.cc.line, lw * 0.8);
      }
    });
    const fr = this.eo((a - P.length * st - 80) / 520);
    if (fr > 0 && R > 3) {
      const sp = [], scl = [];
      const turns = R < 20 ? Math.min(e.turns, 1.3) : R < 32 ? e.turns * 0.8 : e.turns;
      for (let i = 0; i <= 70; i++) { const u = i / 70, th = e.ph1 + u * turns * Math.PI * 2, rr = R * (0.08 + 0.57 * u); sp.push(T(Math.cos(th) * rr * 1.05, Math.sin(th) * rr * 0.72 - 0.12 * R, 0.34 - 0.24 * u)); }
      this.strokeRange(B, sp, 0, fr, this.cc.line, lw);
      if (R >= 14) {
        for (let i = 0; i <= 36; i++) { const u = i / 36; scl.push(T((-0.72 + 1.5 * u) * R, 0.36 * R + 0.16 * R * Math.abs(Math.sin(u * Math.PI * 3)), 0.18)); }
        this.strokeRange(B, scl, 0, fr, this.cc.line, lw);
      }
    }
  }

  // ---------- butterflies (ecosystem: arrive, perch, flee from the pointer, drift) ----------
  near() { return this.mx != null ? [this.mx, this.my] : null; }
  faceTurn(e, x, y) {
    let wx = 0, wy = 0;
    const A = this.near();
    if (A) {
      const dx = A[0] - x, dy = A[1] - y, d = Math.hypot(dx, dy), reach = 300;
      if (d < reach && d > 0.001) { const w = 1 - d / reach, s = w * w * (3 - 2 * w) * Math.min(1, d / 40); wx = dx / d * s; wy = dy / d * s; }
    }
    const c = this.fa[e.id] || [0, 0];
    c[0] += (wx - c[0]) * 0.09; c[1] += (wy - c[1]) * 0.09;
    this.fa[e.id] = c;
    return c;
  }
  spawnFly(cx, cy) {
    const taken = new Set(this.flies.filter(f => f.st !== 'leave').map(f => f.pid));
    let best = null, bd = 1e9;
    for (const p of this.perch) { if (taken.has(p.id)) continue; const d = Math.hypot(p.x - cx, p.y - cy) + Math.random() * 200; if (d < bd) { bd = d; best = p; } }
    const left = Math.random() < 0.5, sz = Math.max(28, this.Sd * 0.55);
    this.flies.push({ x: left ? -60 : this.W + 60, y: cy + (Math.random() - 0.5) * this.H * 0.5, vx: 0, vy: 0,
      st: best ? 'fly' : 'wander', pid: best ? best.id : null, hx: cx, hy: cy, t0: performance.now(), ph: Math.random() * 6, sz: sz * (0.75 + Math.random() * 0.45), seed: Math.random() * 100, ang: 0 });
  }
  flyOff(f) { f.st = 'leave'; f.pid = null; f.ex = f.x < this.W / 2 ? -100 : this.W + 100; f.ey = f.y - this.H * 0.3; }
  ecosystem(now) {
    const want = this.opts.butterflies | 0, live = this.flies.filter(f => f.st !== 'leave');
    while (live.length > want) { const f = live.pop(); this.flyOff(f); }
    if (live.length < want && this.perch.length && now - this.lastSpawn > 1600 && now - this.lastKey > 900) {
      this.lastSpawn = now; this.spawnFly(this.W * (0.3 + Math.random() * 0.4), this.H / 2);
    }
    // pointer scares sitting butterflies; they hop to another bloom
    const P = this.near();
    if (P) for (const f of this.flies) if (f.st === 'sit' && Math.hypot(f.x - P[0], f.y - P[1]) < f.sz * 1.6) {
      const taken = new Set(this.flies.map(o => o.pid)), opts = this.perch.filter(p => !taken.has(p.id));
      if (opts.length && Math.random() < 0.7) { const p = opts[Math.floor(Math.random() * opts.length)]; f.st = 'fly'; f.pid = p.id; f.t0 = now; f.vx = (f.x - P[0]) * 0.004; f.vy = -0.25; }
      else this.flyOff(f);
    }
  }
  drawFlies(B, now) {
    const dt = Math.min(48, now - (this._fl || now)); this._fl = now;
    const byId = {}; for (const p of this.perch) byId[p.id] = p;
    this.flies = this.flies.filter(f => {
      const t = (now - f.t0) / 1000;
      let tx, ty;
      if (f.st === 'sit' || f.st === 'fly') {
        const p = byId[f.pid];
        if (!p) this.flyOff(f);
        else { tx = p.x + p.R * 0.05; ty = p.y - p.R * 0.45; }
      }
      if (f.st === 'wander') { tx = f.hx + Math.sin(t * 1.3 + f.seed) * 90; ty = f.hy + Math.sin(t * 2.1 + f.seed) * 50; if (t > 5) this.flyOff(f); }
      if (f.st === 'leave') { tx = f.ex; ty = f.ey; }
      if (f.st === 'sit') {
        f.x += (tx - f.x) * 0.35; f.y += (ty - f.y) * 0.35; f.ang *= 0.85;
        f.ph += dt * 0.004;
        const burst = Math.sin(now / 1000 * 0.9 + f.seed) > 0.75;
        f.open = burst ? 0.2 + 0.8 * Math.abs(Math.cos(now / 1000 * 9 + f.seed)) : 0.55 + 0.25 * Math.sin(f.ph);
      } else {
        const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1, sp = f.st === 'leave' ? 0.42 : Math.min(0.34, 0.06 + d * 0.0016);
        const flut = Math.sin(t * 7 + f.seed) * 0.12, wob = Math.cos(t * 4.3 + f.seed) * 0.1;
        const ax = (dx / d * sp + wob) - f.vx, ay = (dy / d * sp + flut) - f.vy;
        f.vx += ax * 0.06 * dt / 16; f.vy += ay * 0.06 * dt / 16;
        f.x += f.vx * dt; f.y += f.vy * dt + Math.sin(t * 13 + f.seed) * 0.6;
        f.ang += (Math.max(-0.5, Math.min(0.5, f.vx * 1.4)) - f.ang) * 0.1;
        f.open = Math.abs(Math.cos(t * 17 + f.seed));
        if (f.st === 'fly' && d < 5) { f.st = 'sit'; f.ph = 0; }
        if (f.st === 'leave' && (f.x < -90 || f.x > this.W + 90 || f.y < -90)) return false;
      }
      B.fly(f.x, f.y, f.sz, f.ang, f.open);
      return true;
    });
  }

  // ---------- render (typing view + poster share this) ----------
  frame(g, dpr, now) {
    const dt = Math.min(64, now - (this.lt || now)); this.lt = now;
    const k = 1 - Math.exp(-dt / 80);
    this.Sd += (this.St - this.Sd) * k;
    this.cx += (this.ctx_ - this.cx) * k; this.cy += (this.cty - this.cy) * k;
    for (const l of this.letters) if (!l.dead && l.tx != null) { l.x += (l.tx - l.x) * k; l.y += (l.ty - l.y) * k; }
    this.letters = this.letters.filter(l => !(l.dead && now - l.dead > 300));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    const B = this.canvasBackend(g), st = this.mainState();
    this.render(B, now, st);
    this.ecosystem(now);
    this.drawFlies(B, now);
    const S = this.Sd, on = now - this.lastKey < 500 || Math.floor(now / 530) % 2 === 0, hf = this.eo((now - this.t0) / 600);
    if (this.caret && on && hf > 0) { const h = 0.8 * S * hf, w = Math.max(2, S * 0.03); B.rect(this.cx - w / 2, this.cy - h / 2, w, h, st.C.text); }
  }
  mainState() { return { letters: this.letters, S: this.Sd, C: this.C, boil: this.opts.boil, recoil: this.opts.recoil, speed: 1, wither: 260, face: true }; }
  render(B, now, st) {
    const S = st.S, L = st.letters, act = L.filter(l => !l.dead), sp = st.speed || 1;
    this.cc = st.C; this._now = now; if (st.face || st.perchOn) this.perch = [];
    if (st.face) for (const l of L) {
      let tx = 0, ty = 0;
      const A = !l.dead && l.ch !== ' ' ? this.near() : null;
      if (A) {
        const dx = A[0] - l.x, dy = A[1] - (l.y - S * 0.6), d = Math.hypot(dx, dy), reach = Math.max(260, S * 3.2);
        if (d < reach && d > 1) { const w = 1 - d / reach, s = w * w * (3 - 2 * w); tx = dx / d * s; ty = dy / d * s; }
      }
      const c = l.lean || (l.lean = [0, 0]);
      c[0] += (tx - c[0]) * 0.07; c[1] += (ty - c[1]) * 0.07;
    }
    const f = st.boil ? Math.floor(now / 120) : 0, amp = st.boil ? Math.max(0.8, S * 0.01) : 0;
    const kd = l => l.dead ? 1 - this.eo((now - l.dead) / st.wither) : 1;
    const draw = layer => {
      for (const l of L) {
        if (l.ch === ' ' || !l.els) continue;
        const age = (now - l.birth) * sp, kk = kd(l);
        const each = e => { if (e.t === 'stem') this.drawStem(B, e, l, age, kk, st, f, amp, layer); else if (e.layer === layer) this.drawEl(B, e, l, age, kk, st, f, amp); };
        l.els.forEach(each);
        if (l.endEls) l.endEls.forEach(each);
        const i = act.indexOf(l), nx = i >= 0 ? act[i + 1] : null;
        if (l.tend && (l.dead || !nx || nx.ch === ' ')) {
          let fr = this.eo(((now - l.tb) * sp - 150) / 450);
          if (l.cut != null) fr *= 1 - this.eo((now - l.cut) * sp / 150) * Math.min(0.85, st.recoil / (0.6 * S));
          for (const e of l.tend) this.drawStem(B, e, l, age, kk, st, f, amp, layer, fr * kk);
        }
      }
    };
    draw(0);
    for (const l of L) if (l.ch !== ' ' && (st.textAll || !l.dead)) B.text(l.ch, l.x, l.y, S, st.C.text);
    draw(1);
  }
  wpt(st, l, x, y) {
    if (l.birth != null && this._now != null) {
      const t = (this._now - l.birth) * (st.speed || 1) / 1000;
      if (t > 0 && t < 2.5) {
        const hh = Math.max(0, (l.y - y) / st.S), dmp = Math.exp(-t * 3.2), dir = (l.id % 2 ? 1 : -1);
        x += st.S * 0.07 * hh * dmp * Math.sin(t * 11) * dir;
        y += st.S * 0.035 * hh * dmp * Math.sin(t * 11 + 1.2);
      }
    }
    if (st.face && l.lean) {
      const hh = Math.min(2.5, Math.max(0, (l.y - y) / st.S)), f = hh * hh * 0.5 + hh * 0.5;
      x += l.lean[0] * st.S * 0.1 * f;
      y += l.lean[1] * st.S * 0.05 * f;
    }
    return st.warp ? st.warp(x, y, l) : [x, y];
  }
  drawStem(B, e, l, age, kk, st, f, amp, layer, frO) {
    const S = st.S, fr = frO != null ? frO : this.eo((age - e.d0) / e.dur) * kk; if (fr <= 0) return;
    const j = this.jit(e.id, f, amp);
    const P = e.pts.map(p => this.wpt(st, l, l.x + p[0] * S + j[0], l.y + p[1] * S + j[1]));
    for (const sg of e.segs) {
      if (sg.layer !== layer) continue;
      const b = Math.min(sg.u1, fr); if (b <= sg.u0) continue;
      this.strokeRange(B, P, sg.u0, b, st.C.blue, S * 0.022 * (e.w || 1));
    }
    for (const th of e.thorns) if (fr > th.u && this.layerAt(e.segs, th.u) === layer) this.thorn(B, P, th.u, th.s, S);
  }
  drawEl(B, e, l, age, kk, st, f, amp) {
    const S = st.S, j = this.jit(e.id, f, amp), wx = (x, y) => this.wpt(st, l, l.x + x * S + j[0], l.y + y * S + j[1]);
    const rw = st.rotw ? st.rotw(e) : 0;
    if (e.t === 'leaf') {
      const sc = this.spr((age - e.d0) / 1000, 7, 15) * kk; if (sc <= 0) return;
      const p = wx(e.x, e.y);
      if (e.sp) { const sp = getSpecies(e.sp), L = e.L * S * sc; B.species(sp, p[0] + Math.cos(e.a) * L * 0.45, p[1] + Math.sin(e.a) * L * 0.45, L, e.a + Math.PI / 2 + j[2] + rw); }
      else this.leaf(B, p[0], p[1], e.a + j[2] + rw, e.L * S * sc, e.bend);
    } else if (e.t === 'rose') {
      const a = age - e.d0; if (a < 0) return;
      if (kk <= 0.001) return;
      const p = wx(e.x, e.y), tl = st.face ? this.faceTurn(e, p[0], p[1]) : null;
      if ((st.face || st.perchOn) && !l.dead && a > 700) this.perch.push({ id: e.id, x: p[0], y: p[1], R: e.R * S * kk });
      const rot = e.rot + j[2] + rw + (tl ? tl[0] * 0.22 : 0);
      if (e.sp) {
        const sc = this.spr(a / 1000, 7, 13);
        B.species(getSpecies(e.sp), p[0], p[1], e.R * S * kk * 2.3 * sc, rot);
      } else this.rose(B, p[0], p[1], e.R * S * kk, rot, e, a, tl);
    } else if (e.t === 'critter') {
      const a = age - e.d0; if (a < 0 || kk <= 0.01) return;
      const sc = this.eo(a / 500) * kk, sp = getSpecies(e.sp), flyer = /dragonfly|bee|honeybee|butterfly/.test(e.sp);
      const hov = flyer ? [Math.sin(a / 1000 * 1.7 + e.hover * 6) * S * 0.06, -S * 0.22 + Math.sin(a / 1000 * 2.9 + e.hover * 9) * S * 0.04] : [0, -e.L * S * 0.35];
      const p = wx(e.x, e.y);
      B.species(sp, p[0] + hov[0], p[1] + hov[1], e.L * S * 1.4 * sc, flyer ? Math.sin(a / 600) * 0.08 : e.a + Math.PI / 2 + rw, { flip: e.flip, alpha: Math.min(1, sc * 1.4) });
    }
  }

  // ---------- poster (box in poster design units) ----------
  buildPoster({ text, motion, seed, box, speed = 1 }) {
    const pr = MOTIONS.find(m => m.id === motion) || MOTIONS[0], txt = (text || '').slice(0, 40) || ' ';
    this.rand = this.rng(seed * 7919 + 1);
    const L = []; let prev = null, uid = 1;
    for (const ch of txt) {
      if (ch === ' ') { const sp = { ch: ' ', id: 9000 + uid++, els: [] }; L.push(sp); prev = sp; continue; }
      const same = prev && prev.ch !== ' ';
      const l = { ch, id: 9000 + uid++, ws: same ? prev.ws : Math.floor(this.rand() * 1e9), wi: same ? prev.wi + 1 : 0, prev: same ? prev : null };
      this.gen(l); L.push(l); prev = l;
    }
    const n = L.length;
    const step = pr.id === 'grow' ? Math.min(110, 3000 / n) : pr.id === 'typed' ? Math.min(85, 3600 / n) * 2.2 / speed : 0;
    const off = pr.id === 'grow' ? 200 : pr.id === 'typed' ? 300 : 0;
    L.forEach((l, i) => { l.b = off + i * step; });
    if (pr.id === 'scatter') { const r = this.rng(seed * 31 + 5); L.forEach(l => { l.b = 150 + r() * 2400; }); }
    const wd = Math.min(60, 900 / n);
    L.forEach((l, i) => {
      l.d = pr.id === 'scatter' ? 4700 + i * 8 : 4200 + (n - 1 - i) * wd;
      const nx = L[i + 1];
      l.cutRel = null;
      if (pr.id !== 'scatter' && l.ch !== ' ' && nx && nx.ch === ' ') { l.cutRel = Math.max(30, nx.b - l.b); this.genEnd(l, l.cutRel); }
    });
    this.rand = Math.random;
    const res = this.layoutCore(L, box.w, box.h, false, box.h > box.w * 0.75);
    let S = res.S, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const addP = (l, x, y, r) => { const X = l.tx + x * S, Y = l.ty + y * S, R = (r || 0) * S; x0 = Math.min(x0, X - R); x1 = Math.max(x1, X + R); y0 = Math.min(y0, Y - R); y1 = Math.max(y1, Y + R); };
    for (const l of L) {
      if (l.ch === ' ') continue;
      addP(l, -l.tw / S / 2, -0.75); addP(l, l.tw / S / 2, 0.1);
      for (const e of [...l.els, ...(l.endEls || [])]) {
        if (e.t === 'stem') e.pts.forEach(q => addP(l, q[0], q[1], 0.02));
        else if (e.t === 'leaf' || e.t === 'critter') addP(l, e.x, e.y, e.L);
        else addP(l, e.x, e.y, e.R * 1.15);
      }
    }
    let tx0 = 1e9, tx1 = -1e9, ty0 = 1e9, ty1 = -1e9;
    for (const l of L) if (l.ch !== ' ') { tx0 = Math.min(tx0, l.tx - l.tw / 2); tx1 = Math.max(tx1, l.tx + l.tw / 2); ty0 = Math.min(ty0, l.ty - 0.72 * S); ty1 = Math.max(ty1, l.ty); }
    const bcx = (tx0 + tx1) / 2, bcy = (ty0 + ty1) / 2, hw = box.w * 0.47, hh = box.h * 0.47;
    const k = Math.min(1.25, hw / Math.max(1, bcx - x0, x1 - bcx), hh / Math.max(1, bcy - y0, y1 - bcy)) * (box.scale || 1);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    L.forEach(l => { l.tx = cx + (l.tx - bcx) * k; l.ty = cy + (l.ty - bcy) * k; l.tw *= k; l.x = l.tx; l.y = l.ty; });
    // typed: the loop is as long as the typing + a pause + the visitor's flight
    const typeEnd = off + n * step;
    this.P = { letters: L, S: S * k, T: pr.id === 'typed' ? Math.round(typeEnd + 900 + VISIT_MS + 500) : pr.T, preset: pr.id, box, typeEnd };
  }
  posterFly(B, tt, P) {
    const ps = this.perch.slice().sort((a, b) => a.x - b.x);
    if (!ps.length) return;
    const bx = P.box, p1 = ps[Math.floor(ps.length * 0.25)], p2 = ps[Math.min(ps.length - 1, Math.floor(ps.length * 0.75))];
    const A = [bx.x - 80, bx.y + bx.h * 0.28], s1 = [p1.x, p1.y - p1.R * 0.45], s2 = [p2.x, p2.y - p2.R * 0.45], E = [bx.x + bx.w + 80, bx.y + bx.h * 0.24];
    const sz = Math.max(28, P.S * 0.55), t = tt / 1000, eo = v => this.eo(Math.max(0, Math.min(1, v)));
    const leg = (a, b, u, lift) => { const e = eo(u); return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e - Math.sin(e * Math.PI) * lift]; };
    let p, flying = true, vx = 0;
    if (t < 1.8) { p = leg(A, s1, t / 1.8, 160); vx = 1; }
    else if (t < 3.4) { p = s1; flying = false; }
    else if (t < 4.6) { p = leg(s1, s2, (t - 3.4) / 1.2, 140); vx = s2[0] > s1[0] ? 1 : -1; }
    else if (t < 5.8) { p = s2; flying = false; }
    else { p = leg(s2, E, (t - 5.8) / 1.2, 60); vx = 1; }
    let o, ang;
    if (flying) { o = Math.abs(Math.cos(t * 17)); p = [p[0] + Math.sin(t * 7) * 6, p[1] + Math.sin(t * 13) * 4]; ang = vx * 0.3; }
    else { const burst = (t > 2.4 && t < 2.8) || (t > 5 && t < 5.3); o = burst ? 0.2 + 0.8 * Math.abs(Math.cos(t * 9)) : 0.55 + 0.1 * Math.sin(t * 3); ang = 0; }
    B.fly(p[0], p[1], sz, ang, o);
  }
  // static butterflies for non-visitor posters: perched on the first N blooms, wings mid-open
  posterPerched(B, tt, n) {
    const ps = this.perch.slice().sort((a, b) => this.h(a.id) - this.h(b.id)).slice(0, n);
    for (const p of ps) { const o = 0.55 + 0.25 * Math.sin(tt / 1000 * 1.2 + p.id); B.fly(p.x + p.R * 0.05, p.y - p.R * 0.45, Math.max(26, this.P.S * 0.5) * (0.8 + 0.4 * this.h(p.id * 3)), (this.h(p.id) - 0.5) * 0.5, o); }
  }
  posterDraw(B, t) {
    const P = this.P; if (!P) return;
    const tt = ((t % P.T) + P.T) % P.T, L = P.letters, bx = P.box;
    const st = { letters: L, S: P.S, C: this.C, boil: this.opts.boil, recoil: this.opts.recoil, speed: 1, wither: 600, textAll: true, perchOn: true };
    L.forEach(l => { l.x = l.tx; l.y = l.ty; l.dead = null; });
    const set = base => L.forEach(l => { l.birth = base + l.b; l.tb = l.birth; l.cut = l.cutRel != null ? l.birth + l.cutRel : null; });
    if (P.preset === 'breathe') {
      set(-1e5);
      const ph = tt / P.T * Math.PI * 2, S = P.S;
      st.warp = (x, y, l) => { const h = Math.max(0, (l.y - y) / S); return [x + Math.sin(ph + l.x * 0.004 + h * 1.1) * S * 0.03 * h, y + Math.cos(ph + x * 0.003) * S * 0.008 * h]; };
      st.rotw = e => Math.sin(ph + e.id * 0.7) * 0.12;
    } else if (P.preset === 'grow' || P.preset === 'scatter') {
      set(0);
      L.forEach(l => { if (tt >= l.d) l.dead = l.d; });
    } else if (P.preset === 'wind') {
      set(-1e5);
      const S = P.S, u = tt / P.T, front = -0.35 + u * 1.9;
      const gust = x => { const d = (x - bx.x) / bx.w - front; return d < 0 ? Math.exp(d * 2.2) * Math.cos(-d * 9) : Math.exp(-d * d * 30); };
      st.warp = (x, y, l) => {
        const hh = Math.max(0, (l.y - y) / S), g = gust(l.x);
        const idle = Math.sin(tt / 1000 * 1.6 + l.x * 0.01) * 0.012;
        return [x + (g * 0.13 + idle) * S * hh * hh * 0.6 + (g * 0.13 + idle) * S * hh * 0.4, y + Math.abs(g) * 0.02 * S * hh];
      };
      st.rotw = e => gust(e.x) * 0.35;
    } else if (P.preset === 'reach') {
      set(-1e5);
      const S = P.S, ph = tt / P.T * Math.PI * 2, lx = bx.x + bx.w / 2 + Math.sin(ph) * bx.w * 0.4, ly = bx.y + bx.h / 2 + Math.sin(ph * 2) * bx.h * 0.24;
      this._light = [lx, ly];
      st.warp = (x, y, l) => {
        const dx = lx - l.x, dy = ly - (l.y - S * 0.6), d = Math.hypot(dx, dy) || 1, w = Math.max(0, 1 - d / (bx.w * 0.52)), s = w * w * (3 - 2 * w);
        const hh = Math.min(2.5, Math.max(0, (l.y - y) / S)), f = hh * hh * 0.5 + hh * 0.5;
        return [x + dx / d * s * S * 0.12 * f, y + dy / d * s * S * 0.06 * f];
      };
      st.rotw = e => { const a = Math.atan2(ly - e.y, lx - e.x); return Math.sin(a) * 0.15; };
    } else if (P.preset === 'visit') {
      set(-1e5);
      const ph = tt / P.T * Math.PI * 2;
      st.warp = (x, y, l) => { const hh = Math.max(0, (l.y - y) / P.S); return [x + Math.sin(ph + l.x * 0.004 + hh) * P.S * 0.015 * hh, y]; };
    } else {
      if (tt >= P.T - 400) return;
      set(0);
      st.letters = L.filter(l => tt >= l.birth);
      st.textAll = false;
    }
    this.render(B, tt, st);
    if (P.preset === 'reach') {
      const [lx, ly] = this._light, r = P.S * 0.09, pts = [];
      for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; pts.push([lx + Math.cos(a) * r, ly + Math.sin(a) * r]); }
      B.fill(pts, st.C.line);
    }
    if (P.preset === 'visit') this.posterFly(B, tt, P);
    else if (P.preset === 'typed') { const tv = tt - P.typeEnd - 900; if (tv >= 0 && tv <= VISIT_MS) this.posterFly(B, tv, P); }
    else if (P.preset !== 'typed') this.posterPerched(B, tt, Math.min(3, this.opts.butterflies | 0));
    if (P.preset === 'typed') {
      const born = st.letters, last = born[born.length - 1], S = P.S;
      if (tt < P.typeEnd + 900 && (Math.floor(tt / 400) % 2 === 0 || (last && tt - last.birth < 300))) {
        const x = last ? last.tx + last.tw / 2 + 0.07 * S : bx.x + bx.w / 2, y = last ? last.ty - 0.33 * S : bx.y + bx.h / 2, w = Math.max(2, S * 0.03), h = 0.8 * S;
        B.rect(x - w / 2, y - h / 2, w, h, st.C.text);
      }
    }
  }
}
