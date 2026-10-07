// The film's iridescent butterflies (../src/butterflies.js), living in the garden: they arrive once
// blooms have grown, perch and breathe their wings, flee from a close pointer (with a petal puff),
// drift on the breeze, and leave when the text is cleared. Coordinates are root-local (em).
import * as THREE from 'three';
import { makeWings, bodyGeometry, bodyMaterial, G as BG } from '../film/butterflies.js';
import { drawWing } from '../film/wing.js';

const MAX = 12, TAU = Math.PI * 2;
function flapAngle(phase, mid = 0.42, amp = 0.85) {
  const p = phase - Math.floor(phase), w = p < 0.4 ? 0.5 * p / 0.4 : 0.5 + 0.5 * (p - 0.4) / 0.6;
  return mid + amp * Math.cos(TAU * w);
}
const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const UP = new THREE.Vector3(0, -0.35, 1).normalize();

export class Flock {
  constructor(engine) {
    this.e = engine;
    // light the membranes from a large panel behind the type (the film's backlit look), no fog
    BG.uPanelMin.value.set(-60, -60, -16); BG.uPanelMax.value.set(60, 60, -16); BG.uFogDensity.value = 0; BG.uPanelI.value = 1.1;
    const tex = new THREE.CanvasTexture(drawWing(1024, 1));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.group = new THREE.Group(); engine.root.add(this.group);
    this.wings = makeWings(this.group, MAX, tex, 70, false).meshes;
    for (const m of this.wings) { m.renderOrder = 4; for (let i = 0; i < MAX; i++) m.geometry.attributes.aTint.setX(i, hash(i) * 0.6); }
    this.bodies = new THREE.InstancedMesh(bodyGeometry(), bodyMaterial, MAX); this.bodies.frustumCulled = false; this.group.add(this.bodies);
    this.flies = []; this.want = 4; this.lastSpawn = 0; this.lastKey = 0; this.poses = [];
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.X = new THREE.Vector3(); this.Y = new THREE.Vector3(); this.Z = new THREE.Vector3();
  }
  // a click scatters perched butterflies nearby; one may come to see the new blooms
  react(p, t) {
    for (const f of this.flies) if (f.st === 'sit' && Math.hypot(f.p.x - p.x, f.p.y - p.y) < 0.9) {
      this.e.puff(f.p, t); f.st = 'drift'; f.t0 = t - 4; f.pid = null; f.v.set((f.p.x - p.x) * 3, 2.4, 0.8);
    }
    this.lastSpawn = Math.min(this.lastSpawn, t - 0.6); this.lastKey = Math.min(this.lastKey, t - 1);
  }
  setCount(n) { this.want = Math.max(0, Math.min(MAX, n | 0)); }
  reset() { this.flies = []; this.poses = []; this.posterPerch = null; }
  scatter() { for (const f of this.flies) this.leave(f); }

  // root-local view rectangle
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
  leave(f) { const b = this.bounds(); f.st = 'leave'; f.pid = null; f.target = new THREE.Vector3(f.p.x < (b.x0 + b.x1) / 2 ? b.x0 - 1 : b.x1 + 1, f.p.y + (b.y1 - b.y0) * 0.35, 0.4); }

  update(t, dt) {
    const P = this.perches(t), byId = new Map(P.map(p => [p.id, p]));
    const live = this.flies.filter(f => f.st !== 'leave');
    while (live.length > this.want) this.leave(live.pop());
    const taken = new Set(this.flies.map(f => f.pid));
    const free = P.filter(p => !taken.has(p.id));
    if (live.length < this.want && P.length && t - this.lastSpawn > 1.4 && t - this.lastKey > 0.8) {
      this.lastSpawn = t;
      const b = this.bounds(), left = Math.random() < 0.5, seed = Math.random() * 100;
      const drift = Math.random() < 0.25 || !free.length, pc = free[Math.floor(Math.random() * free.length)];
      this.flies.push({ st: drift ? 'drift' : 'arrive', pid: drift ? null : pc.id, p: new THREE.Vector3(left ? b.x0 - 0.6 : b.x1 + 0.6, (b.y0 + b.y1) / 2 + (Math.random() - 0.5) * (b.y1 - b.y0) * 0.6, 0.5), v: new THREE.Vector3(),
        t0: t, seed, phase: Math.random(), size: 0.55 + Math.random() * 0.2, head: (Math.random() - 0.5) * 1.2, wing: 0.4, fwd: new THREE.Vector3(left ? 1 : -1, 0, 0) });
    }
    // pointer scares perched butterflies
    const e = this.e, ptr = e.U.uPointer.value, s = e.root.scale.x;
    const pl = new THREE.Vector3((ptr.x - e.root.position.x) / s, (ptr.y - e.root.position.y) / s, 0), moving = t - e.pointer.last < 0.15;
    for (const f of this.flies) {
      if (f.st === 'sit' && moving && Math.hypot(f.p.x - pl.x, f.p.y - pl.y) < 0.55) {
        e.puff(f.p, t);
        const opts = P.filter(p => !this.flies.some(o => o.pid === p.id) && Math.hypot(p.p.x - pl.x, p.p.y - pl.y) > 1);
        if (opts.length && Math.random() < 0.75) { f.st = 'arrive'; f.pid = opts[Math.floor(Math.random() * opts.length)].id; f.v.set((f.p.x - pl.x) * 2, 2.2, 0.6); }
        else { this.leave(f); f.v.set((f.p.x - pl.x) * 2, 2.5, 0.6); }
      }
    }
    const b = this.bounds();
    this.flies = this.flies.filter(f => {
      const age = t - f.t0;
      let target = f.target;
      if (f.st === 'arrive' || f.st === 'sit') { const p = byId.get(f.pid); if (!p) { this.leave(f); target = f.target; } else target = p.p.clone().add(new THREE.Vector3(0, 0.02, 0.05)); }
      if (f.st === 'drift') {
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        target = new THREE.Vector3(cx + Math.sin(age * 0.35 + f.seed) * (b.x1 - b.x0) * 0.32, cy + Math.sin(age * 0.53 + f.seed * 2) * (b.y1 - b.y0) * 0.25, 0.6 + 0.3 * Math.sin(age * 0.7));
        if (age > 12) this.leave(f);
      }
      if (f.st === 'sit') {
        f.p.lerp(target, 1 - Math.exp(-dt * 12));
        const breath = Math.sin(t * 0.8 + f.seed) > 0.8;
        f.wing = breath ? flapAngle(t * 3 + f.seed) : 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.3 + f.seed));
        f.fwd.set(Math.sin(f.head), Math.cos(f.head), 0);
        return true;
      }
      const d = target.clone().sub(f.p), dist = d.length(), sp = f.st === 'leave' ? 2.4 : Math.min(1.8, 0.5 + dist * 1.2);
      const desired = d.normalize().multiplyScalar(sp).add(new THREE.Vector3(Math.cos(age * 4.3 + f.seed) * 0.35, Math.sin(age * 7 + f.seed) * 0.4, 0));
      desired.x += e.U.uWind.value * 0.25;
      f.v.lerp(desired, 1 - Math.exp(-dt * 3));
      f.p.addScaledVector(f.v, dt); f.p.y += Math.sin(age * 13 + f.seed) * 0.004;
      f.phase += dt * (f.st === 'leave' ? 6.5 : 5.2);
      f.wing = flapAngle(f.phase);
      if (f.v.lengthSq() > 1e-4) f.fwd.lerp(new THREE.Vector3(f.v.x, f.v.y, 0).normalize(), 1 - Math.exp(-dt * 6));
      if (f.st === 'arrive' && dist < 0.05) { f.st = 'sit'; f.head = Math.atan2(f.fwd.x, f.fwd.y) * 0.4 + (Math.random() - 0.5) * 0.6; }
      if (f.st === 'leave' && (f.p.x < b.x0 - 1.5 || f.p.x > b.x1 + 1.5 || f.p.y > b.y1 + 1.5)) return false;
      return true;
    });
    this.poses = this.flies.map(f => ({ p: f.p, fwd: f.fwd, wing: f.wing, size: f.size, bend: f.st === 'sit' ? 0.05 : 0.18 }));
  }

  // ---- poster: deterministic poses from loop time ----
  posterPerches(seed) {
    const all = [];
    for (const l of this.e.letters) if (l.g) l.g.perches.forEach((p, i) => all.push({ l, p: p.clone().add(l.g.group.position), h: hash(seed * 31 + l.id * 7 + i) }));
    all.sort((a, b) => a.h - b.h);
    this.posterPerch = all;
  }
  posterPose(tt, P) {
    const all = this.posterPerch || [], poses = [], b = this.bounds();
    // typed: the visitor arrives once the word is complete
    if (P.motion === 'typed') { tt -= P.typeEnd + 0.9; if (tt < 0 || tt > 7) { this.poses = poses; return; } }
    if ((P.motion === 'visit' || P.motion === 'typed') && all.length) {
      const byX = all.slice(0, 12).sort((a, c) => a.p.x - c.p.x), p1 = byX[Math.floor(byX.length * 0.25)].p, p2 = byX[Math.min(byX.length - 1, Math.floor(byX.length * 0.75))].p;
      const A = new THREE.Vector3(b.x0 - 0.6, p1.y + 0.8, 0.6), E = new THREE.Vector3(b.x1 + 0.6, p2.y + 1.2, 0.6);
      const eo = x => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
      const leg = (a, c, u, lift) => { const k = eo(u); return a.clone().lerp(c, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * lift, 0.3 * Math.sin(k * Math.PI))); };
      const s1 = p1.clone().add(new THREE.Vector3(0, 0.02, 0.05)), s2 = p2.clone().add(new THREE.Vector3(0, 0.02, 0.05));
      let p, fly = true, dir = 1;
      if (tt < 1.8) p = leg(A, s1, tt / 1.8, 0.8);
      else if (tt < 3.4) { p = s1; fly = false; }
      else if (tt < 4.6) { p = leg(s1, s2, (tt - 3.4) / 1.2, 0.6); dir = Math.sign(s2.x - s1.x) || 1; }
      else if (tt < 5.8) { p = s2; fly = false; }
      else p = leg(s2, E, (tt - 5.8) / 1.2, 0.4);
      const wing = fly ? flapAngle(tt * 5.2) : ((tt > 2.4 && tt < 2.8) || (tt > 5 && tt < 5.3)) ? flapAngle(tt * 3) : 0.4 + 0.3 * Math.sin(tt * 3);
      poses.push({ p, fwd: fly ? new THREE.Vector3(dir, 0.15, 0).normalize() : new THREE.Vector3(0.3, 1, 0).normalize(), wing, size: 0.75, bend: fly ? 0.18 : 0.05 });
    } else if (P.motion !== 'typed') {
      const n = Math.min(3, this.want), timed = P.motion === 'grow' || P.motion === 'scatter';
      for (const a of all.slice(0, n)) {
        if (timed && (tt < a.l.b + 1.4 + this.e.formDelay() || tt > a.l.d - 0.3)) continue;
        const k = a.h * 50;
        poses.push({ p: a.p.clone().add(new THREE.Vector3(0, 0.02, 0.05)), fwd: new THREE.Vector3(Math.sin((a.h - 0.5) * 1.4), Math.cos((a.h - 0.5) * 1.4), 0), wing: 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(tt * 1.3 + k)), size: 0.6 + a.h * 0.15, bend: 0.05 });
      }
    }
    this.poses = poses;
  }

  sync(time) {
    BG.uTime.value = time;
    const { m, q, s, X, Y, Z } = this;
    for (let i = 0; i < MAX; i++) {
      const f = this.poses[i];
      if (!f) { m.makeScale(0, 0, 0); this.bodies.setMatrixAt(i, m); for (const w of this.wings) w.setMatrixAt(i, m); continue; }
      Z.copy(f.fwd).normalize(); Y.copy(UP).addScaledVector(Z, -UP.dot(Z)).normalize(); X.crossVectors(Y, Z).normalize();
      m.makeBasis(X, Y, Z); q.setFromRotationMatrix(m); s.setScalar(f.size);
      m.compose(f.p, q, s);
      this.bodies.setMatrixAt(i, m);
      for (const w of this.wings) { w.setMatrixAt(i, m); w.geometry.attributes.aWing.setXYZ(i, f.wing, f.bend, w.userData.side); }
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    for (const w of this.wings) { w.instanceMatrix.needsUpdate = true; w.geometry.attributes.aWing.needsUpdate = true; }
  }
}
