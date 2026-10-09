// 3D engine: Novo glyphs extruded and overgrown by instanced flora; shared growth/wind/pointer
// prelude; petal stream; pollen; tilt-shift; the film's iridescent butterflies perch on the blooms.
import * as THREE from 'three';
import * as S from './shaders.js';
import { glyphShapes, glyphBody, GlyphSampler, DEPTH, tuftGeometry, stemGeometry, flowerGeometry, leafGeometry, cardGeometry, petalGeometry, mushroomGeometry, bracketGeometry, caterpillarGeometry, barkMap, grassGeometry, bladeGeometry, urchinGeometry, scallopGeometry, anemoneGeometry, starGeometry } from './geometry.js';
import { RECIPES3D, placeCards } from './recipes.js';
import { Flock } from './flock.js';
import { Sea, Bubbles } from './sea.js';
import { buildAtlas, ofKind } from '../species.js';
import { mix } from '../brand.js';
import { rng } from '../film/rand.js';

const FOV = 30, CAM_Z = 10, VIS_H = 2 * CAM_Z * Math.tan(FOV / 2 * Math.PI / 180);
const LINE_H = 1.32;
const col = hex => new THREE.Color(hex);

const BASE = {};
const base = () => BASE.tuft ? BASE : Object.assign(BASE, { tuft: tuftGeometry(), stem: stemGeometry(), flower5: flowerGeometry(5), flower6: flowerGeometry(6), leaf: leafGeometry(), card: cardGeometry(), shroom: mushroomGeometry(), bracket: bracketGeometry(), cater: caterpillarGeometry(),
  grass: grassGeometry(), blade: bladeGeometry(), urchin: urchinGeometry(), scallop: scallopGeometry(), anemone: anemoneGeometry(), star: starGeometry() });

const SURFACE = new Set(['moss', 'shroom', 'bracket', 'grass', 'urchin', 'scallop', 'anemone', 'star']);

class Layer { constructor() { this.pos = []; this.dir = []; this.stem = []; this.own = []; this.u = []; this.a = []; this.b = []; this.c = []; this.atlas = []; this.mode = []; this.n = 0; } }

class Petals {
  constructor(max = 700) {
    this.max = max; this.next = 0; this.dirty = false;
    const g = petalGeometry();
    const A = n => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iSpawn', this.spawn = A(3)); g.setAttribute('iVel', this.vel = A(3)); g.setAttribute('iLife', this.life = A(4)); g.setAttribute('iCol', this.col = A(3));
    for (let i = 0; i < max; i++) this.life.setXYZW(i, -1e9, 1, 0, 0);
    g.instanceCount = max;
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.5 } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: S.petalVert, fragmentShader: S.petalFrag, uniforms: this.uniforms, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
  }
  emit(p, v, c, size, t, life) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.spawn.setXYZ(i, p.x, p.y, p.z); this.vel.setXYZ(i, v.x, v.y, v.z);
    this.life.setXYZW(i, t, life ?? (3.5 + Math.random() * 2.5), size * (0.7 + Math.random() * 0.6), Math.random());
    this.col.setXYZ(i, c.r, c.g, c.b); this.dirty = true;
  }
  clear() { for (let i = 0; i < this.max; i++) this.life.setXYZW(i, -1e9, 1, 0, 0); this.dirty = true; }
  flush() { if (!this.dirty) return; for (const a of [this.spawn, this.vel, this.life, this.col]) a.needsUpdate = true; this.dirty = false; }
}

export class Garden3D {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    this.camera.position.set(0, 0, CAM_Z);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.textRoot = new THREE.Group(); this.root.add(this.textRoot);
    this.U = {
      uTime: { value: 0 }, uGrowDur: { value: 1.6 }, uDelayScale: { value: 1 }, uWind: { value: 0.5 }, uBreath: { value: 0.6 },
      uPointer: { value: new THREE.Vector3(1e3, 1e3, 0) }, uPointerStrength: { value: 0 }, uPointerRadius: { value: 0.35 },
      uLightDir: { value: new THREE.Vector3(-0.35, 0.55, 0.75).normalize() },
      uHeight: { value: 1 }, uShimmer: { value: 0.25 }, uGlow: { value: 0.25 }, uAtlas: { value: null },
      uFormDur: { value: 1.3 }, uFormPR: { value: 1 }, uReveal: { value: 1 },
      uPulse: { value: new THREE.Vector4(0, 0, -100, 0) }, uPulseK: { value: 1 },
      uGravity: { value: new THREE.Vector3(0, -1, 0) }, uHang: { value: 0 }, uSink: { value: 1 }, uShake: { value: 0 },
    };
    // phone tilt as one angle in the screen plane (0 = upright, + = gravity towards screen right); eased each frame
    this.grav = { target: 0, angle: 0, raw: null, on: false }; // on: the phone's sensors are live (setMotion)
    this.opts = { weight: 700, density: 1, butterflies: 4, recipe: 'blossom', cw: null, species: null, wind: 0.5, petals: 1, spores: 1, tilt: 1, blur: 1, form: false, formDur: 1.75, reveal: 'dissolve' };
    this.blobSource = null; // () => [{u, v, ru, rv, col}] in view fractions, set by the shell
    this.letters = []; this.uid = 1; this.clock0 = performance.now();
    this.petals = new Petals(); this.scene.add(this.petals.mesh); this.petals.uniforms.uGravity = this.U.uGravity;
    this.bubbles = new Bubbles(); this.scene.add(this.bubbles.mesh); this.bubbles.uniforms.uGravity = this.U.uGravity;
    this.initSpores(); this.initPost();
    this.flock = new Flock(this); this.sea = new Sea(this); // butterflies, or (Ocean) fish, seahorses and jellyfish
    this.pointer = { inside: false, speed: 0, last: -1, prev: new THREE.Vector3(), presence: 0 };
    this.fit = { s: 1, x: 0, y: 0, ts: 1, tx: 0, ty: 0 };
    this.view = { W: 1, H: 1, box: null };
    this.bindPointer();
    this.mode = 'type';
  }
  now() { return (performance.now() - this.clock0) / 1000 + 100; }

  // ---------- setup ----------
  initSpores() {
    const N = 260, a = new Float32Array(N * 4), r = rng(77);
    for (let i = 0; i < a.length; i++) a[i] = r();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(a, 4));
    this.sporeU = { uTime: this.U.uTime, uPixelRatio: { value: 1 }, uBox: { value: new THREE.Vector3(12, 8, 6) }, uFocus: { value: CAM_Z }, uColor: { value: col('#ffffff') }, uAmount: { value: 0.6 }, uDrift: { value: 1 } };
    this.spores = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: S.sporeVert, fragmentShader: S.sporeFrag, uniforms: this.sporeU, transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    this.spores.frustumCulled = false; this.spores.renderOrder = 10;
    this.scene.add(this.spores);
  }
  initPost() {
    const mk = (samples) => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
    this.rtA = mk(4); this.rtB = mk(0); this.rtC = mk(0);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.tiltU = { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uTexel: { value: new THREE.Vector2() }, uAmount: { value: 8 },
      uFocusCenter: { value: 0.5 }, uFocusBand: { value: 0.2 }, uFull: { value: new THREE.Vector2(1, 1) }, uOrigin: { value: new THREE.Vector2() } };
    this.tiltMat = new THREE.ShaderMaterial({ vertexShader: S.fullVert, fragmentShader: S.tiltFrag, uniforms: this.tiltU, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.outMat = new THREE.ShaderMaterial({ vertexShader: S.fullVert, fragmentShader: S.outFrag, uniforms: { tDiffuse: { value: null } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  }
  // ---------- formation particles ----------
  formationMesh(g, sampler, r, uni) {
    const cw = this.opts.cw, N = Math.max(220, Math.min(1400, Math.round(sampler.area * 4200)));
    const to = new Float32Array(N * 3), seed = new Float32Array(N * 4), colA = new Float32Array(N * 3), o = { pos: new THREE.Vector3(), normal: new THREE.Vector3() };
    const typeCol = col(cw.type);
    for (let i = 0; i < N; i++) {
      sampler.sampleFace(r, o); o.pos.toArray(to, i * 3);
      seed.set([r(), 2.2 + r() * 3.6, 0.4 + r() * 1.2, r() * 6.28], i * 4);
      if (r() < 0.35) typeCol.toArray(colA, i * 3); // the rest take their colour from the blob they leave
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(to, 3));
    geo.setAttribute('aFrom', new THREE.BufferAttribute(new Float32Array(to), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setAttribute('aCol', new THREE.BufferAttribute(colA, 3));
    const mat = new THREE.ShaderMaterial({ vertexShader: S.formVert, fragmentShader: S.formFrag,
      uniforms: { uTime: uni.uTime, uForm: uni.uForm, uFormDur: uni.uFormDur, uPixelRatio: this.U.uFormPR, uReveal: this.U.uReveal },
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 6;
    g.group.add(pts); g.meshes.push(pts); g.form = { pts, N, typeShare: 0.35, r };
  }
  // pull every particle's start point out of a background blob (view fractions → glyph-local space)
  seedFormation(l) {
    const g = l.g, F = g.form, r = F.r, attrFrom = F.pts.geometry.attributes.aFrom, attrCol = F.pts.geometry.attributes.aCol;
    const visW = VIS_H * this.camera.aspect, s = this.fit.ts || 1, blobs = this.blobSource?.() || [];
    const c = new THREE.Color();
    for (let i = 0; i < F.N; i++) {
      let u, v, hex;
      if (blobs.length) {
        const b = blobs[Math.floor(r() * blobs.length)], gx = (r() + r() + r() - 1.5) / 1.5, gy = (r() + r() + r() - 1.5) / 1.5;
        u = b.u + gx * b.ru * 0.55; v = b.v + gy * b.rv * 0.55; hex = b.col;
      } else { u = r(); v = r(); hex = this.opts.cw.flower; }
      const wx = (u - 0.5) * visW, wy = (0.5 - v) * VIS_H;
      attrFrom.setXYZ(i, (wx - this.fit.tx) / s - l.tx, (wy - this.fit.ty) / s - l.ty, (r() - 0.5) * 2);
      if (attrCol.getX(i) + attrCol.getY(i) + attrCol.getZ(i) === 0) { c.set(hex).lerp(new THREE.Color(1, 1, 1), r() * 0.35); attrCol.setXYZ(i, c.r, c.g, c.b); }
    }
    attrFrom.needsUpdate = true; attrCol.needsUpdate = true; g.formSeeded = true;
  }

  setSize(W, H, dpr = Math.min(2, devicePixelRatio || 1)) {
    this.css = { W, H }; this.dpr = dpr;
    if (this.mode === 'type') { this.view.W = W; this.view.H = H; }
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(W, H, false);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    this.camera.aspect = W / H; this.camera.updateProjectionMatrix();
    this.resizeTargets(Math.round(W * dpr), Math.round(H * dpr));
    this.refit(true);
  }
  resizeTargets(w, h) { for (const t of [this.rtA, this.rtB, this.rtC]) t.setSize(w, h); this.tiltU.uTexel.value.set(1 / w, 1 / h); this.tiltU.uFull.value.set(w, h); }

  setOpts(o) {
    const prev = { ...this.opts };
    Object.assign(this.opts, o);
    const same = (k) => k === 'species' ? String(o[k]) === String(prev[k]) : o[k] === prev[k];
    const cwChanged = o.cw && (!prev.cw || prev.cw.id !== o.cw.id);
    if (cwChanged || !this.U.uAtlas.value) this.U.uAtlas.value = this.atlasTex(this.opts.cw);
    if (this.opts.cw) this.sporeU.uColor.value = col(RECIPES3D[this.opts.recipe]?.snow?.(this.opts.cw) || this.opts.cw.spore);
    this.sporeU.uDrift.value = RECIPES3D[this.opts.recipe]?.snow ? -0.6 : 1; // marine snow sinks, pollen rises
    this.U.uHeight.value = RECIPES3D[this.opts.recipe]?.height ?? 1;
    this.U.uSink.value = RECIPES3D[this.opts.recipe]?.buoyant ? -1 : 1; // Ocean: kelp and blades float up
    const rec = RECIPES3D[this.opts.recipe];
    if (o.recipe !== undefined && !same('recipe')) { const off = rec?.bubbles ? this.petals : this.bubbles; off.clear(); off.flush(); } // bubbles only in Ocean, petals/leaves only elsewhere
    this.flock.setCount(rec?.butterflies === false ? 0 : this.opts.butterflies); // Timber has caterpillars instead
    this.sea.setCount(rec?.sea ? this.opts.butterflies : 0); // Ocean: the same slider counts the sea life
    const rebuild = ['weight', 'density', 'recipe', 'cw', 'species'].some(k => o[k] !== undefined && !same(k));
    if (rebuild && this.letters.length) this.rebuildAll(o.regrow);
  }
  atlasTex(cw) {
    const { canvas, uv } = buildAtlas(cw);
    this.atlasUV = uv;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    if (this.U.uAtlas.value) this.U.uAtlas.value.dispose();
    return t;
  }

  // ---------- glyphs ----------
  formDelay() { return this.opts.form ? this.opts.formDur * (this.opts.reveal === 'dissolve' ? 1.1 : 1) : 0; }
  buildGlyph(ch, seed, start) {
    const birth = start + this.formDelay();
    const { shapes, adv } = glyphShapes(ch, this.opts.weight);
    const g = { ch, adv, group: new THREE.Group(), meshes: [], emit: [], perches: [], seed };
    g.U = { uBirth: { value: birth }, uForm: { value: start }, uDeath: { value: 1e9 }, uDeathDur: { value: 0.45 }, uDeathStagger: { value: 1 }, uFadeMode: { value: 0 } };
    this.textRoot.add(g.group);
    if (!shapes.length) return g;
    const cw = this.opts.cw, uni = { ...this.U, ...g.U };
    const rec0 = RECIPES3D[this.opts.recipe] || RECIPES3D.blossom, bodyCol = rec0.body ? rec0.body(cw) : cw.type;
    const sampler = new GlyphSampler(shapes), wood = rec0.wood?.(cw), reef = rec0.reef?.(cw), bark = wood || reef ? this.barkTex(ch, sampler) : null;
    const woodU = { uWood: { value: wood ? 1 : 0 }, uWoodA: { value: col(wood?.light || '#000000') }, uWoodB: { value: col(wood?.dark || '#000000') }, uLichen: { value: col(wood?.lichen || '#000000') },
      uGrain: { value: new THREE.Vector4(0, 1, 0, (seed % 1000) / 100) }, uBark: { value: bark }, uBarkBox: { value: new THREE.Vector3(...(bark ? bark.box : [0, 0, 1])) } };
    const reefU = { uReef: { value: reef ? 1 : 0 } };
    for (const k of ['rockA', 'rockB', 'sand', 'coralA', 'coralB', 'algae', 'caustic']) reefU['u' + k[0].toUpperCase() + k.slice(1)] = { value: col(reef?.[k] || '#000000') };
    const body = new THREE.Mesh(glyphBody(shapes, rec0.bevel || 0), new THREE.ShaderMaterial({ vertexShader: S.bodyVert, fragmentShader: S.bodyFrag, uniforms: { ...uni, ...woodU, ...reefU, uColor: { value: col(bodyCol) }, uSide: { value: col(mix(bodyCol, cw.bg, 0.45)) }, uGlowCol: { value: col(mix(cw.flower2, '#FFFFFF', 0.5)) } } }));
    g.group.add(body); g.meshes.push(body);

    const r = rng(seed), recipe = RECIPES3D[this.opts.recipe] || RECIPES3D.blossom;
    const layers = {}, tmp = { pos: new THREE.Vector3(), normal: new THREE.Vector3() }, ctr = sampler.center;
    const sel = this.opts.species;
    const c = {
      r, cw, density: this.opts.density,
      point: (faceP = 0.7) => { const o = { pos: new THREE.Vector3(), normal: new THREE.Vector3() }; return r() < faceP ? sampler.sampleFace(r, o) : sampler.sampleRim(r, o); },
      delay: (p, extra = 0) => Math.min(1, Math.hypot(p.x - ctr.x, p.y - ctr.y) / 0.5) * 0.9 + r() * 0.3 + extra,
      inside: (x, y) => sampler.inside(x, y),
      count: (a, b = 0) => Math.round((sampler.area * a + sampler.perimeter * b) * this.opts.density),
      add: (name, inst) => { (layers[name] ||= new Layer()); pushInst(layers[name], inst, this.atlasUV); },
      perch: (inst) => { const L = inst.stem?.[0] || 0, d = inst.dir; g.perches.push(new THREE.Vector3(inst.pos.x + d.x * L, inst.pos.y + d.y * L - (inst.stem?.[1] || 0) * L, inst.pos.z + d.z * L + 0.03)); },
      speciesOf: kind => ofKind(kind, sel).map(s => s.id).filter(id => this.atlasUV?.has(id)),
      // selected species are used in turn, starting at a different one per glyph, so all of them appear
      k: Math.floor(r() * 997), next: list => list[(c.k++) % list.length],
    };
    c.cards = spec => placeCards(c, spec);
    recipe.build(c);
    for (let i = 0; i < 40; i++) { sampler.sampleFace(r, tmp); g.emit.push(tmp.pos.clone().addScaledVector(tmp.normal, 0.03)); }
    for (const [name, L] of Object.entries(layers)) if (L.n) { const m = this.layerMesh(name, L, uni); g.group.add(m); g.meshes.push(m); }
    g.sampler = sampler;
    if (this.opts.form) this.formationMesh(g, sampler, r, uni);
    return g;
  }
  // bark map texture per glyph (shared by every copy of the letter; kept for the session)
  barkTex(ch, sampler) {
    const key = ch + '|' + this.opts.weight;
    if (this.barkTexs?.has(key)) return this.barkTexs.get(key);
    const m = barkMap(key, sampler), t = new THREE.DataTexture(m.data, m.N, m.N, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; t.box = m.box;
    (this.barkTexs ||= new Map()).set(key, t);
    return t;
  }
  layerMesh(name, L, uni) {
    const B = base(), F = (arr, n) => new THREE.InstancedBufferAttribute(new Float32Array(arr), n);
    let geo, vs, fs, extra = {};
    if (SURFACE.has(name)) { // surface-standing: tufts, mushrooms, shelf fungi, sea grass, urchins, shells, anemones, seastars
      geo = B[name === 'moss' ? 'tuft' : name].clone();
      geo.setAttribute('iPos', F(L.pos, 3)); geo.setAttribute('iNormal', F(L.dir, 3)); geo.setAttribute('iData', F(L.own, 4));
      [vs, fs] = name === 'anemone' ? [S.anemoneVert, S.anemoneFrag] : name === 'star' ? [S.starVert, S.starFrag] : [S.mossVert, S.mossFrag];
    } else {
      geo = (B[name] || B.card).clone();
      geo.setAttribute('iPos', F(L.pos, 3)); geo.setAttribute('iDir', F(L.dir, 3)); geo.setAttribute('iStem', F(L.stem, 4)); geo.setAttribute('iOwn', F(L.own, 4)); geo.setAttribute('iU', F(L.u, 2));
      if (name === 'card') { geo.setAttribute('iAtlas', F(L.atlas, 4)); geo.setAttribute('iMode', F(L.mode, 1)); }
      [vs, fs] = { stem: [S.stemVert, S.stemFrag], flower5: [S.flowerVert, S.flowerFrag], flower6: [S.flowerVert, S.flowerFrag], leaf: [S.leafVert, S.leafFrag], blade: [S.leafVert, S.leafFrag], card: [S.cardVert, S.cardFrag], cater: [S.caterVert, S.caterFrag] }[name];
    }
    geo.setAttribute('iColA', F(L.a, 3)); geo.setAttribute('iColB', F(L.b, 3)); geo.setAttribute('iColC', F(L.c, 3));
    geo.instanceCount = L.n;
    const mat = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: { ...uni, ...extra }, side: THREE.DoubleSide, alphaToCoverage: name === 'card', extensions: { derivatives: true } });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false;
    return m;
  }
  disposeGlyph(g) { for (const m of g.meshes) { m.geometry.dispose(); m.material.dispose(); } g.group.removeFromParent(); }

  // ---------- text ----------
  add(ch) {
    const t = this.now();
    const l = { ch, id: this.uid++, seed: Math.floor(Math.random() * 1e9), g: null, birth: t };
    if (ch !== ' ') l.g = this.buildGlyph(ch, l.seed, t);
    this.letters.push(l); this.layout(); this.flock.lastKey = t; this.sea.lastKey = t;
  }
  backspace() {
    const live = this.letters.filter(l => !l.dead), l = live[live.length - 1];
    if (!l) return;
    this.kill(l, false); this.layout();
  }
  clear() { for (const l of this.letters) if (!l.dead) this.kill(l, true); this.layout(); this.fauna('scatter'); }
  kill(l, fade) {
    const t = this.now(); l.dead = t;
    if (l.g) { l.g.U.uDeath.value = t; l.g.U.uFadeMode.value = fade ? 1 : 0; l.g.U.uDeathDur.value = fade ? 0.9 : 0.45; }
  }
  setText(str, { regrow = false } = {}) {
    for (const l of this.letters) if (l.g) this.disposeGlyph(l.g);
    this.letters = [];
    const t = this.now();
    let i = 0;
    for (const ch of str) {
      const l = { ch, id: this.uid++, seed: Math.floor(Math.random() * 1e9), birth: regrow ? t + i * 0.06 : t - 10 };
      if (ch !== ' ') l.g = this.buildGlyph(ch, l.seed, l.birth);
      this.letters.push(l); i++;
    }
    this.layout(); this.refit(true);
  }
  text() { return this.letters.filter(l => !l.dead).map(l => l.ch).join(''); }
  reseed() { this.setText(this.text(), { regrow: true }); }
  rebuildAll(regrow) {
    const t = this.now();
    this.letters = this.letters.filter(l => !l.dead);
    this.letters.forEach((l, i) => {
      if (l.g) this.disposeGlyph(l.g);
      l.birth = regrow ? t + i * 0.05 : t - 10;
      l.g = l.ch !== ' ' ? this.buildGlyph(l.ch, l.seed, l.birth) : null;
    });
    this.layout(); this.refit(true);
  }
  // greedy word wrap into a block whose aspect roughly matches the target box
  layout() {
    const live = this.letters.filter(l => !l.dead);
    const adv = l => l.g ? l.g.adv : glyphShapes(' ', this.opts.weight).adv * 1.1;
    const words = []; let cur = [];
    for (const l of live) { if (l.ch === ' ') { if (cur.length) words.push(cur); words.push([l]); cur = []; } else cur.push(l); }
    if (cur.length) words.push(cur);
    const total = live.reduce((s, l) => s + adv(l), 0);
    // line breaks follow the stable full-screen shape (layoutH) so the on-screen keyboard doesn't re-wrap words
    const box = this.view.box || { w: this.view.W, h: Math.max(this.view.H, this.view.layoutH || 0) };
    const maxW = Math.max(...words.filter(w => w[0].ch !== ' ').map(w => w.reduce((s, l) => s + adv(l), 0)), 0, Math.sqrt(total * LINE_H * (box.w / box.h) * (box.w > box.h * 1.3 ? 2.6 : 0.9)), box.w > box.h * 1.3 ? 7 : 2.5);
    const lines = [[]]; let lw = 0;
    for (const w of words) {
      const ww = w.reduce((s, l) => s + adv(l), 0);
      if (w[0].ch !== ' ' && lw > 0 && lw + ww > maxW) { lines.push([]); lw = 0; }
      if (w[0].ch === ' ' && lw === 0 && lines.length > 1) continue;
      lines[lines.length - 1].push(...w); lw += ww;
    }
    const n = lines.length; let bw = 0;
    lines.forEach((li, k) => {
      while (li.length && li[li.length - 1].ch === ' ') li.pop();
      const w = li.reduce((s, l) => s + adv(l), 0); bw = Math.max(bw, w);
      let x = -w / 2; const y = ((n - 1) / 2 - k) * LINE_H - 0.36;
      for (const l of li) { l.tx = x + adv(l) / 2; l.ty = y; x += adv(l); if (l.x == null) { l.x = l.tx; l.y = l.ty; } }
    });
    for (const l of live) if (l.tx == null) { l.tx = l.ty = l.x = l.y = 0; }
    this.block = { w: Math.max(bw, 0.6), h: n * LINE_H, n };
    this.refit();
    for (const l of live) if (l.g?.form && !l.g.formSeeded) this.seedFormation(l);
  }
  // world placement of the text block inside view.box (poster units or CSS px)
  refit(snap) {
    const { W, H } = this.view, box = this.view.box || { x: W * 0.07, y: H * 0.16, w: W * 0.86, h: H * 0.66, scale: 1 };
    const k = VIS_H / H, b = this.block || { w: 1, h: 1 };
    const margin = this.opts.recipe === 'jungle' ? [0.45, 0.75] : [0.35, 0.45];
    const s = Math.min(box.w * k / (b.w + margin[0] * 2), box.h * k / (b.h + margin[1] * 2), 2.4 * k * Math.min(W, H) / 3) * (box.scale || 1);
    this.fit.ts = s; this.fit.tx = (box.x + box.w / 2 - W / 2) * k; this.fit.ty = -(box.y + box.h / 2 - H / 2) * k - (this.opts.recipe === 'jungle' ? 0.25 * s : 0);
    if (snap) { this.fit.s = this.fit.ts; this.fit.x = this.fit.tx; this.fit.y = this.fit.ty; this.applyFit(); }
    const cy = 1 - (box.y + box.h / 2) / H;
    this.tiltU.uFocusCenter.value = cy; this.tiltU.uFocusBand.value = Math.min(0.42, (b.h * s / VIS_H) / 2 + 0.06);
  }
  applyFit() { this.root.scale.setScalar(this.fit.s); this.root.position.set(this.fit.x, this.fit.y, 0); }

  // vertical extent of the text block in canvas px (uses the target fit, so it is stable while easing)
  textBoundsPx() {
    if (!this.block || !this.letters.some(l => !l.dead && l.g)) return null;
    const pxPerWorld = this.view.H / VIS_H, s = this.fit.ts, n = this.block.n;
    const topLocal = ((n - 1) / 2) * LINE_H - 0.36 + 0.78, bottomLocal = ((n - 1) / 2 - (n - 1)) * LINE_H - 0.36 - 0.22;
    const toPx = y => this.view.H / 2 - (this.fit.ty + y * s) * pxPerWorld;
    return { top: toPx(topLocal), bottom: toPx(bottomLocal) };
  }

  // ---------- pointer ----------
  bindPointer() {
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
    this.canvas.addEventListener('pointermove', e => {
      const r = this.canvas.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      plane.constant = -DEPTH * this.root.scale.x;
      if (!ray.ray.intersectPlane(plane, hit)) return;
      const t = this.now(), dt = Math.max(0.008, t - this.pointer.last);
      if (this.pointer.last >= 0 && dt < 0.2) this.pointer.speed = Math.max(this.pointer.speed, hit.distanceTo(this.pointer.prev) / dt / Math.max(0.01, this.root.scale.x));
      this.pointer.prev.copy(hit); this.pointer.last = t; this.pointer.inside = true;
      if (this.mode === 'type') this.U.uPointer.value.copy(hit);
    });
    this.canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; this.pointer.last = -1; });
    // a click (not a drag) blooms the letter under it, or sends a gust through the garden
    let down = null;
    this.canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    this.canvas.addEventListener('pointerup', e => {
      if (!down || this.mode !== 'type' || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      down = null;
      const r = this.canvas.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      plane.constant = -DEPTH * this.root.scale.x;
      if (ray.ray.intersectPlane(plane, hit)) this.click(hit.clone());
    });
  }

  // phone tilt (deviceorientation β/γ in degrees, screen rotation in degrees) → "down" in screen space:
  // device-frame gravity is (sinγ·cosβ, −sinβ, −cosγ·cosβ), then rotated into the current screen orientation
  setMotion(on) { this.grav.on = on; }
  setGravity(beta, gamma, angle = 0) {
    const b = beta * Math.PI / 180, g = gamma * Math.PI / 180;
    this.setGravityDevice(Math.sin(g) * Math.cos(b), -Math.sin(b), -Math.cos(g) * Math.cos(b), angle);
  }
  // gravity in device axes (x right, y up the screen, z out of it) → the in-screen angle. Only the part of
  // gravity lying in the screen plane counts: holding the phone tipped back is not a tilt. Lying flat, that
  // part vanishes and its direction is noise, so the angle fades back to upright.
  setGravityDevice(x, y, z, angle = 0) {
    const a = angle * Math.PI / 180, sx = x * Math.cos(a) - y * Math.sin(a), sy = x * Math.sin(a) + y * Math.cos(a);
    const len = Math.hypot(sx, sy) / (Math.hypot(x, y, z) || 1), w = Math.min(1, Math.max(0, (len - 0.25) / 0.35));
    this.grav.target = Math.atan2(sx, -sy) * w * w * (3 - 2 * w);
    this.grav.raw = { sx, sy, len };
  }

  // phone shake (0..1): the plants rattle, and every letter sheds a few leaves/petals (at most every 0.4 s)
  shake(k) {
    this.U.uShake.value = Math.max(this.U.uShake.value, k);
    const t = this.now(); if (t - (this.lastShed || 0) < 0.4) return; this.lastShed = t;
    const v = new THREE.Vector3();
    for (const l of this.letters) if (l.g && !l.dead) { this.burst(l.g.group.getWorldPosition(v), t, Math.round(3 + k * 9)); if (RECIPES3D[this.opts.recipe]?.bubbles) this.sandCloud(l, t, k); }
    this.fauna('scatter');
  }

  // ---------- per-frame ----------
  frame() {
    const t = this.now(), dt = Math.min(0.05, t - (this.lastT || t)); this.lastT = t;
    this.U.uTime.value = t; this.petals.uniforms.uTime.value = t; this.bubbles.uniforms.uTime.value = t;
    const G = this.grav, d = Math.atan2(Math.sin(G.target - G.angle), Math.cos(G.target - G.angle)); // shortest way round
    G.angle += d * (1 - Math.exp(-dt * 6));
    this.U.uGravity.value.set(Math.sin(G.angle), -Math.cos(G.angle), 0);
    this.U.uHang.value += ((G.on ? 1 : 0) - this.U.uHang.value) * (1 - Math.exp(-dt * 2));
    this.U.uShake.value *= Math.exp(-dt * 2.5);
    if (this.mode === 'type') {
      const k = 1 - Math.exp(-dt * 10);
      this.fit.s += (this.fit.ts - this.fit.s) * k; this.fit.x += (this.fit.tx - this.fit.x) * k; this.fit.y += (this.fit.ty - this.fit.y) * k;
      this.applyFit();
      for (const l of this.letters) { if (l.tx == null) continue; l.x += (l.tx - l.x) * k; l.y += (l.ty - l.y) * k; if (l.g) l.g.group.position.set(l.x, l.y, 0); }
      this.letters = this.letters.filter(l => { if (l.dead && t - l.dead > 1.2) { if (l.g) this.disposeGlyph(l.g); return false; } return true; });
      const pr = this.pointer;
      pr.presence += ((pr.inside ? 1 : 0) - pr.presence) * Math.min(1, dt * 4);
      this.U.uPointerStrength.value = 0.35 * pr.presence; this.U.uPointerRadius.value = 0.35 * this.root.scale.x;
      this.U.uPulseK.value = this.root.scale.x;
      // a current surge (Ocean, click on empty water) swells in fast and dies away over a couple of seconds
      const sg = this.surge, sk = sg ? Math.exp(-(t - sg.t) * 0.9) * Math.min(1, (t - sg.t) * 5) : 0;
      this.U.uWind.value = this.opts.wind + sk * 1.8 * (sg?.dir || 0); this.U.uBreath.value = 0.6;
      this.emitPetals(t, dt);
      this.fauna('update', t, dt);
    }
    this.petals.uniforms.uWind.value = this.bubbles.uniforms.uWind.value = this.U.uWind.value;
    this.bubbles.uniforms.uRise.value = 0.11 * this.root.scale.x;
    this.render();
  }
  emitPetals(t, dt) {
    const rec = RECIPES3D[this.opts.recipe], cw = this.opts.cw, pr = this.pointer;
    const speed = pr.speed; pr.speed *= Math.exp(-dt * 8);
    const gl = this.letters.filter(l => l.g && !l.dead && t - l.g.U.uBirth.value > 1.2 && l.g.emit.length), sys = this.drops(), cfg = rec.bubbles || rec.petals;
    if (!gl.length || !this.opts.petals) return sys.flush();
    const s = this.root.scale.x, size = cfg.size * s, cols = rec.petals.cols?.(cw) || (rec.petals.leafy ? [cw.foliage[1], cw.foliage[2], cw.flower] : cw.petals);
    const P = new THREE.Vector3(), Vv = new THREE.Vector3();
    this.petalAcc = (this.petalAcc || 0) + cfg.rate * this.opts.petals * gl.length * dt;
    for (let n = 0; this.petalAcc >= 1 && n < 40; n++) {
      this.petalAcc--;
      const l = gl[Math.floor(Math.random() * gl.length)];
      P.copy(l.g.emit[Math.floor(Math.random() * l.g.emit.length)]).applyMatrix4(l.g.group.matrixWorld);
      if (rec.bubbles) Vv.set((Math.random() - 0.5) * 0.06, 0.04, 0.05).multiplyScalar(s); // bubbles seep out and rise
      else Vv.set(0.18 + Math.random() * 0.2, 0.06 + Math.random() * 0.12, (Math.random() - 0.3) * 0.15).multiplyScalar(s);
      sys.emit(P, Vv, col(cols[Math.floor(Math.random() * cols.length)]), size, t);
    }
    // a fast flick of the pointer near a letter throws petals away from it
    const ptr = this.U.uPointer.value;
    if (speed > 0.6 && t - pr.last < 0.1) {
      const k = Math.min(6, Math.floor(speed * 0.8 * this.opts.petals)), R2 = (0.45 * s) ** 2;
      for (let i = 0; i < k; i++) {
        const l = gl[Math.floor(Math.random() * gl.length)];
        P.copy(l.g.emit[Math.floor(Math.random() * l.g.emit.length)]).applyMatrix4(l.g.group.matrixWorld);
        if ((P.x - ptr.x) ** 2 + (P.y - ptr.y) ** 2 > R2) continue;
        Vv.set(P.x - ptr.x, P.y - ptr.y, 0.4).normalize().multiplyScalar((0.25 + Math.min(speed, 4) * 0.08) * s);
        sys.emit(P, Vv, col(cols[Math.floor(Math.random() * cols.length)]), size, t);
      }
    }
    sys.flush();
  }
  puff(pLocal, t) {
    const cw = this.opts.cw, s = this.root.scale.x, P = pLocal.clone().applyMatrix4(this.root.matrixWorld), V = new THREE.Vector3();
    const pc = RECIPES3D[this.opts.recipe].petals.cols?.(cw) || cw.petals;
    const rec = RECIPES3D[this.opts.recipe], sys = this.drops(), size = (rec.bubbles || rec.petals).size;
    for (let i = 0; i < 5; i++) { V.set((Math.random() - 0.5) * 0.5, Math.random() * 0.3, 0.2).multiplyScalar(s); sys.emit(P, V, col(pc[i % pc.length]), size * s, t, 2.5); }
    sys.flush();
  }

  // ---------- click: bloom burst ----------
  click(world) {
    const t = this.now(), s = this.root.scale.x;
    this.U.uPulse.value.set(world.x, world.y, t, 0.9);
    const rootLocal = new THREE.Vector3((world.x - this.root.position.x) / s, (world.y - this.root.position.y) / s, 0);
    // which letter (if any) was clicked: inside its outline, or within a small margin
    let hitL = null, best = 0.12;
    for (const l of this.letters) {
      if (!l.g?.sampler || l.dead) continue;
      const x = rootLocal.x - l.g.group.position.x, y = rootLocal.y - l.g.group.position.y;
      if (l.g.sampler.inside(x, y)) { hitL = l; break; }
      const b = l.g.sampler.box, dx = Math.max(b.min.x - x, 0, x - b.max.x), dy = Math.max(b.min.y - y, 0, y - b.max.y), d = Math.hypot(dx, dy);
      if (d < best) { best = d; hitL = l; }
    }
    this.burst(world, t, hitL ? 46 : 26);
    if (!hitL && RECIPES3D[this.opts.recipe]?.bubbles) this.surge = { t, dir: rootLocal.x < 0 ? 1 : -1 }; // Ocean: empty water → current surge away from the click
    this.fauna('react', rootLocal, t);
    if (hitL && t - hitL.g.U.uBirth.value > 0.6) this.bloomSpot(hitL, rootLocal.x - hitL.g.group.position.x, rootLocal.y - hitL.g.group.position.y, t);
  }
  burst(world, t, n) {
    const rec = RECIPES3D[this.opts.recipe], cw = this.opts.cw, s = this.root.scale.x;
    const cols = rec.petals.cols?.(cw) || (rec.petals.leafy ? [cw.foliage[1], cw.foliage[2], cw.flower, cw.flower2] : cw.petals), sys = this.drops();
    const P = new THREE.Vector3(), V = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.35 + Math.random() * 0.9;
      P.set(world.x + Math.cos(a) * 0.06 * s, world.y + Math.sin(a) * 0.06 * s, world.z + 0.05 * s);
      V.set(Math.cos(a) * sp, Math.sin(a) * sp + 0.25, 0.3 + Math.random() * 0.6).multiplyScalar(s);
      sys.emit(P, V, col(cols[i % cols.length]), (rec.bubbles || rec.petals).size * s * (1 + Math.random() * 0.6), t, rec.bubbles ? 3 + Math.random() * 3 : 2.5 + Math.random() * 2);
    }
    sys.flush();
  }
  // petals, or (Ocean) bubbles
  drops() { return RECIPES3D[this.opts.recipe]?.bubbles ? this.bubbles : this.petals; }
  // every fauna system gets the same calls; the inactive one has a count of 0
  fauna(fn, ...a) { this.flock[fn](...a); this.sea[fn](...a); }
  // shake (Ocean): sand billows off the letter's top ledges and sinks back
  sandCloud(l, t, k) {
    const s = this.root.scale.x, cw = this.opts.cw, sand = [mix('#E8D6AC', cw.bg, 0.08), mix('#C8B48A', cw.bg, 0.12), '#F2E6C8'];
    const o = { pos: new THREE.Vector3(), normal: new THREE.Vector3() }, P = new THREE.Vector3(), V = new THREE.Vector3(), r = Math.random;
    for (let i = 0, n = Math.round(6 + k * 14); i < n; i++) {
      for (let j = 0; j < 8; j++) { l.g.sampler.sampleRim(r, o); if (o.normal.y > 0.4) break; }
      P.copy(o.pos).applyMatrix4(l.g.group.matrixWorld);
      V.set((r() - 0.5) * 0.5, 0.15 + r() * 0.35, (r() - 0.3) * 0.3).multiplyScalar(s);
      this.petals.emit(P, V, col(sand[i % 3]), 0.011 * s, t, 2 + r() * 2);
    }
    this.petals.flush();
  }
  // extra generation: a cluster of new blooms (+ a species or two) that ripples outward from the click
  bloomSpot(l, x, y, t) {
    const g = l.g; g.spots = (g.spots || 0) + 1;
    if (g.spots > 8) return;
    const cw = this.opts.cw, r = rng(Math.floor(Math.random() * 1e9)), o = { pos: new THREE.Vector3(), normal: new THREE.Vector3() };
    const R = 0.3, pts = [];
    for (let i = 0; i < 600 && pts.length < 22; i++) {
      g.sampler.sampleFace(r, o);
      const d = Math.hypot(o.pos.x - x, o.pos.y - y);
      if (d < R) pts.push({ pos: o.pos.clone(), d });
    }
    if (!pts.length) return;
    const ramp = [[cw.flower, mix(cw.flower, '#FFFFFF', 0.5), cw.flowerDeep], ['#FFFFFF', cw.flower2, cw.flowerDeep], [cw.flower2, '#FFFFFF', cw.flower]];
    const layers = {}, add = (n, inst) => pushInst(layers[n] ||= new Layer(), inst, this.atlasUV);
    const spot = RECIPES3D[this.opts.recipe]?.spot;
    if (spot) spot({ r, cw, pts, R, add, perch: p => g.perches.push(p) });
    else {
      const species = (k) => ofKind(k, this.opts.species).map(s => s.id).filter(id => this.atlasUV?.has(id));
      const blooms = species('bloom'), crit = species('critter');
      pts.forEach((p, i) => {
        const [a, b, c] = ramp[i % ramp.length], delay = p.d / R * 0.55 + r() * 0.15;
        const inst = { pos: p.pos, dir: new THREE.Vector3((r() - 0.5) * 0.8, (r() - 0.5) * 0.8, 1).normalize(), stem: [0.012 + r() * 0.03, 0, (r() - 0.5), r()], own: [0.06 + r() * 0.08 * (1 - p.d / R), r() * 6.28, delay, r()], a, b, c };
        add(i % 3 ? 'flower5' : 'flower6', inst);
        if (i % 4 === 0) g.perches.push(new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z + 0.05));
      });
      if (blooms.length) for (let k = 0; k < 2; k++) { const p = pts[Math.floor(r() * pts.length)]; add('card', { pos: p.pos.clone().setZ(p.pos.z + 0.07), dir: new THREE.Vector3(0, 0, 1), stem: [0, 0, 0, r()], own: [0.17 + r() * 0.07, (r() - 0.5) * 0.8, 0.2 + k * 0.15, r()], u: [0, 0], sp: blooms[Math.floor(r() * blooms.length)], mode: 0 }); }
      if (crit.length && r() < 0.35) { const p = pts[0]; add('card', { pos: p.pos.clone().setZ(p.pos.z + 0.09), dir: new THREE.Vector3(0, 0, 1), stem: [0, 0, 0, r()], own: [0.17, (r() - 0.5), 0.7, r()], u: [0, 0], sp: crit[Math.floor(r() * crit.length)], mode: 2 }); }
    }
    // own birth clock, but dies with the glyph (death uniforms are shared)
    const uni = { ...this.U, ...g.U, uBirth: { value: t } };
    for (const [name, L] of Object.entries(layers)) if (L.n) { const m = this.layerMesh(name, L, uni); g.group.add(m); g.meshes.push(m); }
  }

  // ---------- render ----------
  render(tile) {
    const R = this.renderer, rec = RECIPES3D[this.opts.recipe];
    const visW = VIS_H * this.camera.aspect;
    this.sporeU.uBox.value.set(visW * 1.15, VIS_H * 1.15, 5);
    this.sporeU.uAmount.value = (rec?.spores ?? 0.6) * this.opts.spores;
    this.sporeU.uPixelRatio.value = (this.dpr || 1) * (tile ? tile.k : 1);
    this.U.uFormPR.value = this.sporeU.uPixelRatio.value;
    this.U.uFormDur.value = this.opts.formDur;
    this.U.uReveal.value = this.opts.form && this.opts.reveal === 'dissolve' ? 1 : 0;
    this.root.updateMatrixWorld(true);
    this.fauna('sync', this.U.uTime.value);
    R.setRenderTarget(this.rtA); R.setClearColor(0, 0); R.clear(); R.render(this.scene, this.camera);
    const amt = 7 * this.opts.tilt * (this.dpr || 1) * (tile ? tile.k : 1);
    this.tiltU.uAmount.value = amt;
    if (!tile) this.tiltU.uOrigin.value.set(0, 0);
    this.quad.material = this.tiltMat;
    this.tiltU.tDiffuse.value = this.rtA.texture; this.tiltU.uDir.value.set(1, 0); R.setRenderTarget(this.rtB); R.render(this.quadScene, this.quadCam);
    this.tiltU.tDiffuse.value = this.rtB.texture; this.tiltU.uDir.value.set(0, 1); R.setRenderTarget(this.rtC); R.render(this.quadScene, this.quadCam);
    this.quad.material = this.outMat; this.outMat.uniforms.tDiffuse.value = this.rtC.texture;
    R.setRenderTarget(null); R.render(this.quadScene, this.quadCam);
  }

  // Render one tile of a fullW×fullH image (pixels) into `dst` at (dx, dy). k = print px per preview px.
  renderTile(fullW, fullH, x, y, w, h, k, dst, dx, dy) {
    const m = Math.ceil(7 * this.opts.tilt * k * 1.6) + 8, tw = w + 2 * m, th = h + 2 * m;
    const R = this.renderer, saved = { W: this.css.W, H: this.css.H, dpr: this.dpr };
    R.setPixelRatio(1); R.setSize(tw, th, false); this.dpr = 1;
    this.camera.aspect = fullW / fullH;
    this.camera.setViewOffset(fullW, fullH, x - m, y - m, tw, th);
    this.resizeTargets(tw, th);
    this.tiltU.uFull.value.set(fullW, fullH); this.tiltU.uOrigin.value.set(x - m, fullH - (y - m) - th);
    this.render({ k });
    dst.drawImage(this.canvas, m, m, w, h, dx, dy, w, h);
    this.camera.clearViewOffset();
    this.setSize(saved.W, saved.H, saved.dpr);
  }

  // ---------- poster ----------
  // box: art rect in poster units; W×H poster units; motion schedule mirrors the 2D engine
  buildPoster({ text, motion, seed, box, W, H, T, speed = 1 }) {
    this.mode = 'poster';
    this.view.box = box; this.view.W = W; this.view.H = H;
    for (const l of this.letters) if (l.g) this.disposeGlyph(l.g);
    this.letters = []; this.petals.clear(); this.bubbles.clear();
    const r = rng(seed * 7919 + 1), txt = (text || '').slice(0, 40) || ' ', n = txt.length;
    const step = motion === 'grow' ? Math.min(0.11, 3 / n) : motion === 'typed' ? Math.min(0.085, 3.6 / n) * 2.2 / speed : 0, off = motion === 'grow' ? 0.2 : motion === 'typed' ? 0.3 : 0;
    let i = 0;
    for (const ch of txt) {
      const l = { ch, id: this.uid++, seed: Math.floor(r() * 1e9), b: off + i * step, d: motion === 'scatter' ? 4.7 + i * 0.008 : 4.2 + (n - 1 - i) * Math.min(0.06, 0.9 / n) };
      if (motion === 'scatter') l.b = 0.15 + r() * 2.4;
      if (ch !== ' ') l.g = this.buildGlyph(ch, l.seed, 0);
      this.letters.push(l); i++;
    }
    const typeEnd = off + n * step + this.formDelay();
    this.poster = { motion, T: motion === 'typed' ? typeEnd + 0.9 + 7 + 0.5 : T / 1000, seed, typeEnd };
    this.layout();
    for (const l of this.letters) { l.x = l.tx; l.y = l.ty; if (l.g) l.g.group.position.set(l.x, l.y, 0); }
    this.refit(true); this.root.updateMatrixWorld(true);
    this.fauna('posterPerches', seed);
  }
  endPoster() { this.mode = 'type'; this.view.box = null; if (this.css) { this.view.W = this.css.W; this.view.H = this.css.H; } this.poster = null; for (const l of this.letters) if (l.g) this.disposeGlyph(l.g); this.letters = []; this.fauna('reset'); }
  posterFrame(tMs) {
    const P = this.poster; if (!P) return;
    const T = P.T, tt = (((tMs / 1000) % T) + T) % T, base = 100, u = tt / T;
    const t = base + tt;
    this.U.uTime.value = t; this.petals.uniforms.uTime.value = t; this.bubbles.uniforms.uTime.value = t;
    this.U.uGravity.value.set(0, -1, 0); this.U.uHang.value = 0; this.U.uShake.value = 0; // posters (and their exports) always hang straight down, still
    const timed = P.motion === 'grow' || P.motion === 'typed' || P.motion === 'scatter';
    for (const l of this.letters) {
      if (!l.g) continue;
      const start = timed ? base + l.b : base - 50;
      l.g.U.uForm.value = start; l.g.U.uBirth.value = start + this.formDelay();
      const dies = P.motion === 'grow' || P.motion === 'scatter';
      l.g.U.uDeath.value = dies ? base + l.d : 1e9; l.g.U.uFadeMode.value = P.motion === 'scatter' ? 1 : 0; l.g.U.uDeathDur.value = 0.6;
    }
    this.U.uBreath.value = P.motion === 'breathe' ? 1.6 : 0.5;
    this.U.uWind.value = P.motion === 'wind' ? 0.25 + 2.2 * Math.pow(Math.sin(Math.PI * u), 4) : P.motion === 'breathe' ? 0.45 : 0.3;
    if (P.motion === 'reach') {
      const b = this.view.box, k = VIS_H / this.view.H, ph = u * Math.PI * 2;
      const lx = (b.x + b.w / 2 + Math.sin(ph) * b.w * 0.4 - this.view.W / 2) * k, ly = -(b.y + b.h / 2 + Math.sin(ph * 2) * b.h * 0.24 - this.view.H / 2) * k;
      this.U.uPointer.value.set(lx, ly, 0); this.U.uPointerStrength.value = -0.5; this.U.uPointerRadius.value = 1.2 * this.root.scale.x;
    } else this.U.uPointerStrength.value = 0;
    this.petals.uniforms.uWind.value = this.bubbles.uniforms.uWind.value = this.U.uWind.value;
    if (this.opts.petals && P.motion !== 'typed') this.emitPetals(t, 1 / 60);
    this.fauna('posterPose', tt, P);
  }
}

function pushInst(L, o, atlasUV) {
  const c3 = (h, arr) => { const c = col(h || '#ffffff'); arr.push(c.r, c.g, c.b); };
  L.pos.push(o.pos.x, o.pos.y, o.pos.z);
  const d = o.normal || o.dir; L.dir.push(d.x, d.y, d.z);
  if (o.data) L.own.push(...o.data); else L.own.push(...o.own);
  L.stem.push(...(o.stem || [0, 0, 0, 0])); L.u.push(...(o.u || [0, 0]));
  c3(o.a, L.a); c3(o.b || o.a, L.b); c3(o.c || o.a, L.c);
  if (o.sp) { const uv = atlasUV?.get(o.sp) || [0, 0, 0, 0]; L.atlas.push(...uv); L.mode.push(o.mode || 0); }
  L.n++;
}
