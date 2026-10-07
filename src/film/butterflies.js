// Shared butterfly rendering: palette, global uniforms, iridescent wing + body materials, geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const lin = (hex) => new THREE.Color(hex); // Color() stores linear values (ColorManagement on)
export const PAL = {
  void: lin('#0B0A0F'), charcoal: lin('#17151C'), panel: lin('#F6EEF2'),
  pink: lin('#F4B4D6'), lilac: lin('#BDB6F6'), cyan: lin('#86F2F4'),
  lastingBlue: lin('#00008F'),
};

// Global uniforms shared by every scene material.
export const G = {
  uDepthMode: { value: 0 },
  uTime: { value: 0 },
  uPanelI: { value: 1 },
  uPanelMin: { value: new THREE.Vector3(-18, 1, -40) },
  uPanelMax: { value: new THREE.Vector3(18, 17, -40) },
  uPanelCol: { value: PAL.panel },
  uFogCol: { value: new THREE.Color('#141019') },
  uFogDensity: { value: 0.011 },
  uBrandMix: { value: 0 },
  uBrandWipe: { value: 0 },
  uBrandBlue: { value: PAL.lastingBlue },
};

// ---------- shared GLSL ----------
export const COMMON = /* glsl */`
uniform float uDepthMode; uniform float uTime; uniform float uPanelI;
uniform vec3 uPanelMin; uniform vec3 uPanelMax; uniform vec3 uPanelCol;
uniform vec3 uFogCol; uniform float uFogDensity; uniform float uBrandMix; uniform float uBrandWipe; uniform vec3 uBrandBlue;
varying float vViewZ; varying vec3 vWorld;
vec3 toPanel(vec3 p){ vec3 q = clamp(p, uPanelMin, uPanelMax); q.z = uPanelMin.z; return normalize(q - p); }
vec3 fog(vec3 c, float d){ return mix(uFogCol, c, exp(-d * uFogDensity)); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

// ---------- wing material ----------
export function wingMaterial(tex, sparkleScale, isHero) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...G,
      map: { value: tex },
      uSparkle: { value: sparkleScale },
      uSweep: { value: -1 },
      uHero: { value: isHero ? 1 : 0 },
      uPink: { value: PAL.pink }, uLilac: { value: PAL.lilac }, uCyan: { value: PAL.cyan },
    },
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    vertexShader: COMMON + /* glsl */`
      attribute vec3 aWing;   // x: flap angle (rad), y: bend, z: side (+1 right, -1 left)
      attribute float aTint;
      varying vec2 vUv; varying vec3 vN; varying float vTint;
      void main(){
        vUv = uv; vTint = aTint;
        float side = aWing.z;
        // wing lies in local xz, hinge at x=0; flex grows toward the tip
        vec3 p = position; p.x *= side;
        float dist = abs(p.x);
        float ang = aWing.x + aWing.y * dist * 1.6;
        float c = cos(ang), s = sin(ang);
        vec3 q = vec3(side * dist * c, dist * s, p.z);
        // slight camber
        q.y += 0.035 * sin(3.14159 * clamp(dist / 0.55, 0.0, 1.0)) * (0.5 + 0.5 * uv.y);
        vec3 n = normalize(vec3(-side * s, c, 0.0));
        vec4 wp = modelMatrix * instanceMatrix * vec4(q, 1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * n);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp; vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: COMMON + /* glsl */`
      uniform sampler2D map; uniform float uSparkle; uniform float uSweep; uniform float uHero;
      uniform vec3 uPink; uniform vec3 uLilac; uniform vec3 uCyan;
      varying vec2 vUv; varying vec3 vN; varying float vTint;
      vec3 film(float h){
        h = fract(h);
        vec3 a = mix(uPink, uLilac, smoothstep(0.0, 0.33, h));
        a = mix(a, uCyan, smoothstep(0.33, 0.66, h));
        return mix(a, uPink, smoothstep(0.66, 1.0, h));
      }
      void main(){
        vec4 tx = texture2D(map, vUv);
        float a = clamp((tx.a - 0.45) / max(fwidth(tx.a), 1e-4) + 0.5, 0.0, 1.0);
        if (a < 0.01) discard;
        if (uDepthMode > 0.5) { gl_FragColor = vec4(vViewZ, 0.0, 0.0, a); return; }
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vN); if (dot(N, V) < 0.0) N = -N;
        vec3 L = toPanel(vWorld);
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        // light sweep band (hook)
        float band = exp(-pow((vUv.x - uSweep) * 5.0, 2.0));
        float hue = 0.08 + 0.55 * (1.0 - ndv) + 0.25 * vUv.x + vTint + 0.35 * band;
        vec3 iri = film(hue);
        vec3 base = mix(tx.rgb, tx.rgb * iri * 1.6, 0.5);
        // thin membrane transmission: panel behind the wing glows through
        float trans = pow(clamp(dot(-V, L), 0.0, 1.0), 3.0);
        float diff = 0.5 + 0.5 * dot(N, L);
        vec3 col = base * (0.10 + 0.16 * diff) + base * uPanelCol * uPanelI * trans * 0.42;
        col += iri * pow(1.0 - ndv, 3.0) * 0.30 * (0.4 + trans);                 // iridescent rim
        col += base * band * 0.6 * uHero;
        // micro-scale glints
        vec2 cell = floor(vUv * uSparkle);
        float h = hash12(cell + 0.5);
        vec2 f = fract(vUv * uSparkle) - 0.5;
        float dotMask = smoothstep(0.42, 0.1, length(f));
        float tw = pow(0.5 + 0.5 * sin(uTime * 2.3 + h * 60.0 + ndv * 22.0), 24.0);
        vec2 sc = vUv * uSparkle * vec2(1.0, 1.6);
        float row = floor(sc.y); vec2 sf = fract(vec2(sc.x + 0.5 * mod(row, 2.0), sc.y)) - 0.5;
        float hs = hash12(vec2(floor(sc.x + 0.5 * mod(row, 2.0)), row));
        float scale = smoothstep(0.55, 0.2, length(sf * vec2(1.0, 1.4)));
        col *= 1.0 + uHero * (0.35 * (hs - 0.5) + 0.25 * scale * sin(uTime * 1.3 + hs * 30.0 + ndv * 12.0));
        col += mix(vec3(1.0), iri, 0.5) * step(0.93, h) * dotMask * tw * (0.6 + 1.2 * uHero) * (0.4 + trans);
        col = fog(col, vViewZ);
        gl_FragColor = vec4(col, a);
      }`,
  });
}

// ---------- body material ----------
export const bodyMaterial = new THREE.ShaderMaterial({
  uniforms: { ...G },
  vertexShader: COMMON + /* glsl */`
    attribute float aPart;           // 0 fur, 1 eye, 2 chitin (legs, antennae)
    varying vec3 vN; varying float vPart; varying vec3 vLocal;
    void main(){
      vPart = aPart; vLocal = position;
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
      vWorld = wp.xyz; vec4 mv = viewMatrix * wp; vViewZ = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: COMMON + /* glsl */`
    varying vec3 vN; varying float vPart; varying vec3 vLocal;
    float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float a = hash12(i.xy + i.z * 17.0), b = hash12(i.xy + vec2(1, 0) + i.z * 17.0), c = hash12(i.xy + vec2(0, 1) + i.z * 17.0), d = hash12(i.xy + vec2(1, 1) + i.z * 17.0);
      float e = hash12(i.xy + (i.z + 1.0) * 17.0), g = hash12(i.xy + vec2(1, 0) + (i.z + 1.0) * 17.0), h = hash12(i.xy + vec2(0, 1) + (i.z + 1.0) * 17.0), k = hash12(i.xy + vec2(1, 1) + (i.z + 1.0) * 17.0);
      return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z); }
    void main(){
      if (uDepthMode > 0.5) { gl_FragColor = vec4(vViewZ, 0.0, 0.0, 1.0); return; }
      vec3 V = normalize(cameraPosition - vWorld); vec3 N = normalize(vN); vec3 L = toPanel(vWorld);
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      float back = max(dot(-V, L), 0.15);
      vec3 col;
      if (vPart > 1.5) {            // legs / antennae: dark glossy indigo
        col = vec3(0.05, 0.05, 0.12) + uPanelCol * uPanelI * pow(1.0 - ndv, 3.0) * 0.35 * back;
      } else if (vPart > 0.5) {     // compound eye: near-black with a sharp highlight
        vec3 H = normalize(L + V);
        col = vec3(0.01, 0.012, 0.03) + vec3(1.0) * pow(max(dot(N, H), 0.0), 60.0) * 1.2 + vec3(0.2, 0.25, 0.6) * pow(1.0 - ndv, 3.0) * 0.4;
      } else {                      // fur: fine hair streaks, soft sheen, bright backlit fringe
        float hair = vnoise(vLocal * vec3(260.0, 260.0, 40.0)) * 0.6 + vnoise(vLocal * 600.0) * 0.4;
        vec3 fur = mix(vec3(0.78, 0.74, 0.88), vec3(1.0, 0.97, 1.0), hair);
        float fringe = pow(1.0 - ndv, 1.6);
        col = fur * (0.34 + 0.3 * max(dot(N, L), 0.0) + 0.18 * ndv) + mix(uPanelCol, vec3(0.8, 0.85, 1.0), 0.3) * uPanelI * fringe * (0.5 + 0.6 * hair) * back;
      }
      gl_FragColor = vec4(fog(col, vViewZ), 1.0);
    }`,
});

export function wingGeometry() {
  // plane in xz: x in [0, 0.55] (span), z in [-0.3, 0.3] (body axis, +z = head)
  const g = new THREE.PlaneGeometry(0.55, 0.6, 48, 32);
  g.rotateX(-Math.PI / 2);
  g.translate(0.275, 0, 0);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 0.55, (pos.getZ(i) + 0.3) / 0.6);
  return g;
}
export function bodyGeometry() {
  const parts = [];
  const tag = (g, part) => { const n = g.attributes.position.count; g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1)); parts.push(g); return g; };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // thorax: plump fuzzy ellipsoid
  const thorax = new THREE.SphereGeometry(1, 24, 16); thorax.scale(0.042, 0.04, 0.075); thorax.translate(0, 0.004, 0.07); tag(thorax, 0);
  // abdomen: tapered, segmented (lathe along -z)
  const prof = [];
  for (let k = 0; k <= 40; k++) {
    const u = k / 40, seg = 0.9 + 0.1 * Math.abs(Math.cos(u * Math.PI * 7));
    prof.push(new THREE.Vector2(Math.max(0.001, 0.028 * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.02)) * (1 - 0.55 * u) * seg), -u * 0.27));
  }
  const abdomen = new THREE.LatheGeometry(prof, 20); abdomen.rotateX(Math.PI / 2); abdomen.translate(0, -0.004, 0.012); tag(abdomen, 0);
  // head + big compound eyes + palps
  const head = new THREE.SphereGeometry(0.024, 16, 12); head.translate(0, 0.006, 0.148); tag(head, 0);
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.0165, 16, 12); eye.translate(s * 0.02, 0.01, 0.158); tag(eye, 1);
    const palp = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(s * 0.006, -0.01, 0.16), V3(s * 0.008, -0.004, 0.185), V3(s * 0.006, 0.012, 0.19)), 6, 0.004, 5, false); tag(palp, 0);
    // antennae: long, thin, gently curved, with clubs
    const ant = new THREE.TubeGeometry(new THREE.CubicBezierCurve3(V3(s * 0.01, 0.024, 0.16), V3(s * 0.04, 0.09, 0.26), V3(s * 0.08, 0.14, 0.36), V3(s * 0.12, 0.16, 0.44)), 20, 0.0026, 5, false); tag(ant, 2);
    const club = new THREE.SphereGeometry(1, 10, 8); club.scale(0.007, 0.007, 0.016); club.lookAt(V3(s * 0.4, 0.2, 0.8)); club.translate(s * 0.122, 0.161, 0.448); tag(club, 2);
    // six legs: coxa-femur-tibia as one bent tube each
    for (const [z, out, fwd] of [[0.1, 0.05, 0.05], [0.07, 0.06, 0.0], [0.04, 0.055, -0.06]]) {
      const leg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(s * 0.02, -0.02, z), V3(s * out * 0.7, -0.03, z + fwd * 0.4), V3(s * out, -0.07, z + fwd), V3(s * out * 1.15, -0.1, z + fwd * 1.3)]), 12, 0.0028, 5, false);
      tag(leg, 2);
    }
  }
  return mergeGeometries(parts.map(p => { const g = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aPart'].includes(k)) g.deleteAttribute(k); return g; }));
}

export const wingGeo = wingGeometry();

export function makeWings(scene, count, tex, sparkle, hero) {
  const mat = wingMaterial(tex, sparkle, hero);
  const meshes = [];
  for (const side of [1, -1]) {
    const geo = wingGeo.clone();
    const wingAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    const tintAttr = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    geo.setAttribute('aWing', wingAttr); geo.setAttribute('aTint', tintAttr);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    mesh.userData.side = side;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return { meshes, mat };
}
const tmpM = new THREE.Matrix4(), tmpS = new THREE.Vector3();
export function applyInstances(meshes, bodies, idx, st) {
  tmpS.setScalar(st.s);
  tmpM.compose(st.p, st.q, tmpS);
  bodies.setMatrixAt(idx, tmpM);
  for (const m of meshes) {
    m.setMatrixAt(idx, tmpM);
    m.geometry.attributes.aWing.setXYZ(idx, st.wing, st.bend, m.userData.side);
  }
}

