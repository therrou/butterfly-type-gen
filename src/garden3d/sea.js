// Ocean fauna and bubbles. Sea stands in for the butterfly Flock (same interface: setCount, update, react,
// scatter, reset, sync, posterPerches, posterPose): small fish schools cruise through and scatter from the
// pointer and clicks, seahorses swim in slowly and hold on to coral and kelp, jellyfish pulse their way up
// through the scene. Bubbles mirrors Petals.emit. Coordinates are root-local (em), like the flock.
import * as THREE from 'three';
import * as S from './shaders.js';

const MAXF = 64, MAXH = 6, MAXJ = 6, TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
// fixed accents for the fish (belly, back, stripes); the brand ones are added from the colourway
const FISH = [['#FFD9A8', '#F06A1A', 3], ['#FFF4B8', '#F2C230', 0], ['#E8EEF8', '#6E8CC8', 0]];
const HORSE = ['#F2B33A', '#E8743A', '#D85A7A'];

// ---- geometry: local +z forward, +y up ----
function finish(pos, idx, extra) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const [k, [arr, n]] of Object.entries(extra)) g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a tube along a list of [z, y, radius-y, radius-x] points, aZ from `az(i)`
function tube(pos, idx, aZ, pts, az, R = 8) {
  const b0 = pos.length / 3;
  pts.forEach(([z, y, ry, rx], i) => { for (let j = 0; j < R; j++) { const a = j / R * TAU; pos.push(Math.cos(a) * rx, y + Math.sin(a) * ry, z); aZ.push(az(i)); } });
  for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < R; j++) { const a = b0 + i * R + j, b = b0 + i * R + (j + 1) % R; idx.push(a, a + R, b, b, a + R, b + R); }
  return b0;
}
function fishGeometry() {
  const pos = [], idx = [], aZ = [], S = 10, pts = [];
  for (let i = 0; i <= S; i++) { const u = i / S, pr = Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * u)), 0.7); pts.push([-0.42 + u * 0.9, 0, 0.19 * pr + 0.015, 0.075 * pr + 0.01]); }
  const zOf = z => (z + 0.75) / 1.25;
  const b0 = tube(pos, idx, aZ, pts, i => zOf(pts[i][0]));
  const nose = pos.length / 3; pos.push(0, 0, 0.5); aZ.push(1);
  for (let j = 0; j < 8; j++) idx.push(b0 + S * 8 + j, b0 + S * 8 + (j + 1) % 8, nose);
  const tri = (...v) => { const b = pos.length / 3; for (const [x, y, z] of v) { pos.push(x, y, z); aZ.push(zOf(z)); } idx.push(b, b + 1, b + 2); };
  tri([0, 0, -0.4], [0, 0.22, -0.74], [0, 0, -0.6]); tri([0, 0, -0.4], [0, 0, -0.6], [0, -0.22, -0.74]); // tail
  tri([0, 0.16, 0.12], [0, 0.29, -0.06], [0, 0.13, -0.22]); // dorsal fin
  tri([0, -0.14, 0.02], [0, -0.22, -0.1], [0, -0.12, -0.16]); // anal fin
  return finish(pos, idx, { aZ: [aZ, 1] });
}
// seahorse side-on: snout forward (+z), upright body, belly out front, tail curling under and back
function horseGeometry() {
  const P = [[0.34, 0.47, 0.022], [0.22, 0.47, 0.03], [0.12, 0.48, 0.07], [0.03, 0.52, 0.085], [-0.04, 0.46, 0.075], [-0.04, 0.34, 0.07], [0.0, 0.22, 0.09],
    [0.06, 0.08, 0.115], [0.06, -0.06, 0.11], [0.01, -0.18, 0.08], [-0.06, -0.28, 0.055], [-0.08, -0.38, 0.04], [-0.03, -0.46, 0.032], [0.04, -0.45, 0.026], [0.06, -0.38, 0.022], [0.02, -0.34, 0.018]];
  const curve = new THREE.CatmullRomCurve3(P.map(([z, y]) => new THREE.Vector3(0, y, z))), N = 40, pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = curve.getPoint(u), k = u * (P.length - 1), a = Math.floor(Math.min(k, P.length - 2)), f = k - a, r = P[a][2] * (1 - f) + P[a + 1][2] * f;
    pts.push([p.z, p.y, r, r * 0.7]);
  }
  const pos = [], idx = [], aZ = [];
  tube(pos, idx, aZ, pts, () => 1);
  const b = pos.length / 3; // dorsal fin on the back
  pos.push(0, 0.2, -0.07, 0, 0.06, -0.06, 0, 0.14, -0.17); aZ.push(1, 1, 1); idx.push(b, b + 1, b + 2);
  return finish(pos, idx, { aZ: [aZ, 1] });
}
function jellyGeometry() {
  const pos = [], idx = [], aV = [], aT = [], aK = [], R = 16, V = 6;
  for (let i = 0; i <= V; i++) for (let j = 0; j < R; j++) {
    const v = i / V, a = j / R * TAU, rr = Math.sin(v * Math.PI / 2) * 0.5, y = Math.cos(v * Math.PI / 2) * 0.42 - (v > 0.95 ? 0.02 : 0);
    pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr); aV.push(v); aT.push(0); aK.push(0);
  }
  for (let i = 0; i < V; i++) for (let j = 0; j < R; j++) { const a = i * R + j, b = i * R + (j + 1) % R; idx.push(a, a + R, b, b, a + R, b + R); }
  const ribbon = (x, z, len, w, segs) => { // a hanging ribbon facing the camera
    const b = pos.length / 3;
    for (let s = 0; s <= segs; s++) { const t = s / segs, ww = w * (1 - t * 0.7); pos.push(x - ww, -t * len, z, x + ww, -t * len, z); aV.push(0, 0); aT.push(t, t); aK.push(1, 1); }
    for (let s = 0; s < segs; s++) { const a = b + s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  };
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; ribbon(Math.cos(a) * 0.44, Math.sin(a) * 0.44, 1.1 + (k % 3) * 0.25, 0.012, 12); }
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; ribbon(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.7, 0.05, 10); } // frilly oral arms
  return finish(pos, idx, { aV: [aV, 1], aT: [aT, 1], aK: [aK, 1] });
}

function instanced(geo, mat, max, attrs) {
  for (const [k, n] of Object.entries(attrs)) geo.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.InstancedMesh(geo, mat, max); m.frustumCulled = false; m.count = 0;
  return m;
}
const rnd = (a, b) => a + (b - a) * Math.random();

export class Sea {
  constructor(engine) {
    this.e = engine;
    this.group = new THREE.Group(); engine.root.add(this.group);
    const U = { uTime: engine.U.uTime, uLightDir: engine.U.uLightDir };
    const solid = eye => new THREE.ShaderMaterial({ vertexShader: S.fishVert, fragmentShader: S.fishFrag, uniforms: { ...U, uEye: { value: new THREE.Vector4(...eye) } }, side: THREE.DoubleSide });
    this.fish = instanced(fishGeometry(), solid([0.05, 0.04, 0.3, 0.032]), MAXF, { iColA: 3, iColB: 3, iSwim: 4 });
    this.horses = instanced(horseGeometry(), solid([0.05, 0.5, 0.1, 0.022]), MAXH, { iColA: 3, iColB: 3, iSwim: 4 });
    this.jellies = instanced(jellyGeometry(), new THREE.ShaderMaterial({ vertexShader: S.jellyVert, fragmentShader: S.jellyFrag, uniforms: U, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }), MAXJ, { iCol: 3, iSwim: 4 });
    this.jellies.renderOrder = 4;
    for (const m of [this.fish, this.horses, this.jellies]) this.group.add(m);
    this.want = 0; this.schools = []; this.seahorses = []; this.jellys = []; this.lastKey = 0;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.X = new THREE.Vector3(); this.Y = new THREE.Vector3(); this.Z = new THREE.Vector3();
    this.poses = null;
  }
  // 0 when the recipe isn't Ocean: the sea life goes at once rather than swimming off into another garden
  setCount(n) { this.want = Math.max(0, Math.min(12, n | 0)); if (!this.want) this.reset(); }
  // "Sea life" n → fish schools, seahorses and jellyfish
  quota() { const n = this.want; return { schools: n ? Math.ceil(n / 2.5) : 0, horses: Math.round(n / 4), jellies: Math.round(n / 4) }; }
  reset() { this.schools = []; this.seahorses = []; this.jellys = []; this.poses = null; }
  scatter() { for (const sc of this.schools) this.flee(sc, null, 1); for (const h of this.seahorses) this.leave(h); }

  bounds() {
    const e = this.e, s = e.root.scale.x, visH = 2 * 10 * Math.tan(15 * Math.PI / 180), visW = visH * e.camera.aspect;
    return { x0: (-visW / 2 - e.root.position.x) / s, x1: (visW / 2 - e.root.position.x) / s, y0: (-visH / 2 - e.root.position.y) / s, y1: (visH / 2 - e.root.position.y) / s };
  }
  perches(t) {
    const out = [];
    for (const l of this.e.letters) {
      if (!l.g || l.dead || t - l.g.U.uBirth.value < 1.6) continue;
      l.g.perches.forEach((p, i) => out.push({ id: l.id * 1000 + i, p: p.clone().add(l.g.group.position) }));
    }
    return out;
  }
  colours() {
    const cw = this.e.opts.cw || {};
    return [...FISH, ['#FFFFFF', cw.flower2 || '#9FE3EE', 0], ['#FFF0F6', cw.flower || '#F4B4D6', 0]];
  }
  spawnSchool(t) {
    const b = this.bounds(), left = Math.random() < 0.5, [ca, cb, st] = this.colours()[Math.floor(Math.random() * this.colours().length)];
    const n = 5 + Math.floor(Math.random() * 5), back = Math.random() < 0.35, size = rnd(0.09, 0.14) * (back ? 0.8 : 1);
    const p = new THREE.Vector3(left ? b.x0 - 0.5 : b.x1 + 0.5, rnd(b.y0 + (b.y1 - b.y0) * 0.2, b.y1 - (b.y1 - b.y0) * 0.2), back ? -0.45 : rnd(0.3, 0.7));
    const fish = [...Array(n)].map((_, i) => ({ off: new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.14, 0.14), rnd(-0.1, 0.1)), p: p.clone(), v: new THREE.Vector3(left ? 0.5 : -0.5, 0, 0), fwd: new THREE.Vector3(left ? 1 : -1, 0, 0), ph: Math.random() * TAU, sz: size * rnd(0.85, 1.15), kick: 0 }));
    this.schools.push({ p, v: new THREE.Vector3(left ? 0.4 : -0.4, 0, 0), st: 'cruise', t0: t, seed: Math.random() * 100, dir: left ? 1 : -1, fish, ca, cb, st2: st });
  }
  spawnJelly(t, b) {
    const cw = this.e.opts.cw || {}, cols = [cw.flower2, cw.flower, '#FFFFFF', cw.lilac || '#BDB6F6'].filter(Boolean);
    this.jellys.push({ p: new THREE.Vector3(rnd(b.x0 + 0.5, b.x1 - 0.5), b.y0 - 0.6, rnd(-0.6, 0.4)), ph: Math.random() * TAU, rate: rnd(1.6, 2.3), size: rnd(0.18, 0.3), col: cols[Math.floor(Math.random() * cols.length)], vx: 0 });
  }
  leave(h) { const b = this.bounds(); h.st = 'leave'; h.pid = null; h.target = new THREE.Vector3(h.p.x < (b.x0 + b.x1) / 2 ? b.x0 - 1 : b.x1 + 1, h.p.y + 0.6, 0.4); }
  // push a school's fish away from `from` (or just send them off at speed when null)
  flee(sc, from, k) {
    for (const f of sc.fish) {
      const away = from ? new THREE.Vector3(f.p.x - from.x, f.p.y - from.y, 0) : new THREE.Vector3(sc.dir, rnd(-0.5, 0.5), 0);
      f.v.addScaledVector(away.normalize(), 2.2 * k); f.kick = 1;
    }
    if (from) { sc.p.addScaledVector(new THREE.Vector3(sc.p.x - from.x, sc.p.y - from.y, 0).normalize(), 0.5 * k); }
  }
  react(p, t) {
    for (const sc of this.schools) if (Math.hypot(sc.p.x - p.x, sc.p.y - p.y) < 1.4) this.flee(sc, p, 1);
    for (const h of this.seahorses) if (Math.hypot(h.p.x - p.x, h.p.y - p.y) < 0.9) { this.leave(h); h.v.set(h.p.x - p.x, 1, 0).normalize().multiplyScalar(1.2); }
    for (const j of this.jellys) if (Math.hypot(j.p.x - p.x, j.p.y - p.y) < 0.9) j.vx += Math.sign(j.p.x - p.x) * 0.6;
  }

  update(t, dt) {
    this.poses = null;
    const q = this.quota(), b = this.bounds(), e = this.e, cur = e.U.uWind.value;
    // keep the numbers up (and let the extras swim off)
    const live = this.schools.filter(sc => sc.st !== 'leave');
    while (live.length > q.schools) live.pop().st = 'leave';
    if (live.length < q.schools && t - (this.lastSchool || 0) > 2.5 && t - this.lastKey > 0.6) { this.lastSchool = t; this.spawnSchool(t); }
    while (this.jellys.length > q.jellies) this.jellys.pop();
    if (this.jellys.length < q.jellies && t - (this.lastJelly || 0) > 4) { this.lastJelly = t; this.spawnJelly(t, b); }
    const P = this.perches(t), byId = new Map(P.map(p => [p.id, p]));
    const sitting = this.seahorses.filter(h => h.st !== 'leave');
    while (sitting.length > q.horses) this.leave(sitting.pop());
    if (sitting.length < q.horses && P.length && t - (this.lastHorse || 0) > 3) {
      this.lastHorse = t;
      const taken = new Set(this.seahorses.map(h => h.pid)), free = P.filter(p => !taken.has(p.id));
      if (free.length) {
        const left = Math.random() < 0.5, pc = free[Math.floor(Math.random() * free.length)];
        this.seahorses.push({ st: 'arrive', pid: pc.id, p: new THREE.Vector3(left ? b.x0 - 0.4 : b.x1 + 0.4, pc.p.y + rnd(-0.3, 0.6), 0.3), v: new THREE.Vector3(), face: left ? 1 : -1, seed: Math.random() * 100, size: rnd(0.26, 0.34), col: HORSE[Math.floor(Math.random() * HORSE.length)] });
      }
    }
    // the pointer: fish dart away from it, seahorses let go
    const ptr = e.U.uPointer.value, s = e.root.scale.x, pl = new THREE.Vector3((ptr.x - e.root.position.x) / s, (ptr.y - e.root.position.y) / s, 0), moving = t - e.pointer.last < 0.15;
    // schools: the centre wanders across the view, then leaves; each fish follows its slot, with a kick when scared
    this.schools = this.schools.filter(sc => {
      const age = t - sc.t0;
      if (sc.st === 'cruise' && age > 16 + (sc.seed % 6)) sc.st = 'leave';
      const tx = sc.st === 'leave' ? (sc.dir > 0 ? b.x1 + 2 : b.x0 - 2) : (b.x0 + b.x1) / 2 + sc.dir * (age * 0.18 - 1.2) + Math.sin(age * 0.3 + sc.seed) * 0.8;
      const ty = (b.y0 + b.y1) / 2 + Math.sin(age * 0.23 + sc.seed * 2) * (b.y1 - b.y0) * 0.3;
      const want = new THREE.Vector3(tx - sc.p.x, ty - sc.p.y, 0).clampLength(0, 0.7);
      want.x += cur * 0.3;
      sc.v.lerp(want, 1 - Math.exp(-dt * 0.8)); sc.p.addScaledVector(sc.v, dt);
      let out = true;
      for (const f of sc.fish) {
        if (moving && Math.hypot(f.p.x - pl.x, f.p.y - pl.y) < 0.4) { f.v.add(new THREE.Vector3(f.p.x - pl.x, f.p.y - pl.y, 0).normalize().multiplyScalar(3 * dt * 20)); f.kick = 1; }
        const slot = sc.p.clone().add(f.off).add(new THREE.Vector3(0, Math.sin(t * 1.3 + f.ph) * 0.03, 0));
        const d = slot.sub(f.p);
        f.v.lerp(d.multiplyScalar(2.2).add(sc.v), 1 - Math.exp(-dt * (f.kick > 0.1 ? 0.8 : 3)));
        f.kick *= Math.exp(-dt * 1.5);
        f.p.addScaledVector(f.v, dt);
        const sp = f.v.length();
        if (sp > 0.02) f.fwd.lerp(this.X.copy(f.v).setZ(f.v.z * 0.3).normalize(), 1 - Math.exp(-dt * 8)).normalize();
        f.beat = 9 + Math.min(sp, 3) * 9;
        if (f.p.x > b.x0 - 1.2 && f.p.x < b.x1 + 1.2) out = false;
      }
      return !(sc.st === 'leave' && out);
    });
    // seahorses: swim in upright and slow, hold their perch (tail on it, bobbing), drift off when scared
    this.seahorses = this.seahorses.filter(h => {
      if (h.st === 'sit' && moving && Math.hypot(h.p.x - pl.x, h.p.y - pl.y) < 0.4) this.leave(h);
      let target = h.target;
      if (h.st !== 'leave') { const p = byId.get(h.pid); if (!p) { this.leave(h); target = h.target; } else target = p.p.clone().add(new THREE.Vector3(0, h.size * 0.42, 0.03)); }
      if (h.st === 'sit') { h.p.lerp(target, 1 - Math.exp(-dt * 4)); h.p.y += Math.sin(t * 1.1 + h.seed) * 0.0015; return true; }
      const d = target.clone().sub(h.p), dist = d.length();
      h.v.lerp(d.normalize().multiplyScalar(h.st === 'leave' ? 0.6 : Math.min(0.4, 0.1 + dist * 0.6)), 1 - Math.exp(-dt * 1.5));
      h.p.addScaledVector(h.v, dt); h.p.y += Math.sin(t * 2.2 + h.seed) * 0.002;
      if (Math.abs(h.v.x) > 0.05) h.face = Math.sign(h.v.x);
      if (h.st === 'arrive' && dist < 0.03) h.st = 'sit';
      return !(h.st === 'leave' && (h.p.x < b.x0 - 1.2 || h.p.x > b.x1 + 1.2));
    });
    // jellyfish: each contraction pushes the bell up, then it glides; the current carries them sideways
    this.jellys = this.jellys.filter(j => {
      const k = Math.max(0, Math.sin(t * j.rate + j.ph));
      j.p.y += (0.03 + 0.2 * k * k) * dt * (j.size / 0.25);
      j.vx *= Math.exp(-dt * 0.8);
      j.p.x += (cur * 0.08 + j.vx) * dt;
      if (moving && Math.hypot(j.p.x - pl.x, j.p.y - pl.y) < 0.5) j.vx += Math.sign(j.p.x - pl.x) * dt * 1.5;
      return j.p.y < b.y1 + 0.8;
    });
  }

  // ---- poster: no swimmers yet (the poster motions arrive with the poster step) ----
  posterPerches() {}
  posterPose() { this.poses = { fish: [], horses: [], jellies: [] }; }

  sync() {
    const cw = this.e.opts.cw || {};
    const live = this.poses || {
      fish: this.schools.flatMap(sc => sc.fish.map(f => ({ p: f.p, fwd: f.fwd, size: f.sz, a: sc.ca, b: sc.cb, stripes: sc.st2, ph: f.ph, beat: f.beat || 10 }))),
      horses: this.seahorses.map(h => ({ p: h.p, fwd: new THREE.Vector3(h.face, 0, 0.25), size: h.size, a: mix2(h.col, '#FFFFFF', 0.35), b: h.col, ph: h.seed })),
      jellies: this.jellys.map(j => ({ p: j.p, size: j.size, col: j.col || cw.flower2 || '#9FE3EE', ph: j.ph, rate: j.rate })),
    };
    this.write(this.fish, live.fish.slice(0, MAXF), (i, f, A) => { A.iColA.setXYZ(i, ...lin(f.a)); A.iColB.setXYZ(i, ...lin(f.b)); A.iSwim.setXYZW(i, f.ph, f.beat, f.stripes, 0); });
    this.write(this.horses, live.horses.slice(0, MAXH), (i, f, A) => { A.iColA.setXYZ(i, ...lin(f.a)); A.iColB.setXYZ(i, ...lin(f.b)); A.iSwim.setXYZW(i, f.ph, 0, 0, 0); });
    this.write(this.jellies, live.jellies.slice(0, MAXJ), (i, f, A) => { A.iCol.setXYZ(i, ...lin(f.col)); A.iSwim.setXYZW(i, f.ph, f.rate, 0, 0); }, true);
  }
  write(mesh, list, set, upright) {
    const { m, q, s, X, Y, Z } = this, A = mesh.geometry.attributes;
    list.forEach((f, i) => {
      if (upright) m.identity(); else { Z.copy(f.fwd).normalize(); Y.copy(UP).addScaledVector(Z, -UP.dot(Z)).normalize(); X.crossVectors(Y, Z).normalize(); m.makeBasis(X, Y, Z); }
      q.setFromRotationMatrix(m); s.setScalar(f.size); m.compose(f.p, q, s);
      mesh.setMatrixAt(i, m); set(i, f, A);
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    for (const k of Object.keys(A)) if (A[k].isInstancedBufferAttribute) A[k].needsUpdate = true;
  }
}
const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mix2 = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

// ---- bubbles: same emit API as the petal stream ----
export class Bubbles {
  constructor(max = 600) {
    this.max = max; this.next = 0; this.dirty = false;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const A = n => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iSpawn', this.spawn = A(3)); g.setAttribute('iVel', this.vel = A(3)); g.setAttribute('iLife', this.life = A(4)); g.setAttribute('iCol', this.col = A(3));
    for (let i = 0; i < max; i++) this.life.setXYZW(i, -1e9, 1, 0, 0);
    g.instanceCount = max;
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.5 }, uRise: { value: 0.1 }, uGravity: { value: new THREE.Vector3(0, -1, 0) } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: S.bubbleVert, fragmentShader: S.bubbleFrag, uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7;
  }
  emit(p, v, c, size, t, life) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.spawn.setXYZ(i, p.x, p.y, p.z); this.vel.setXYZ(i, v.x, v.y, v.z);
    this.life.setXYZW(i, t, life ?? (4 + Math.random() * 3), size * (0.5 + Math.random() * 0.9), Math.random());
    this.col.setXYZ(i, c.r, c.g, c.b); this.dirty = true;
  }
  clear() { for (let i = 0; i < this.max; i++) this.life.setXYZW(i, -1e9, 1, 0, 0); this.dirty = true; }
  flush() { if (!this.dirty) return; for (const a of [this.spawn, this.vel, this.life, this.col]) a.needsUpdate = true; this.dirty = false; }
}
