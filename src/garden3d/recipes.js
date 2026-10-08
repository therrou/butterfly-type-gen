// 3D recipes: each fills a glyph's instanced layers from its sampler. Species from the library
// arrive as atlas cards (blooms on the surface or on stem tips, leaves along vines, critters walking).
import * as THREE from 'three';
import { mix } from '../brand.js';
import { DEPTH } from './geometry.js';

const V = () => new THREE.Vector3();
const between = (r, a, b) => a + (b - a) * r();
const pick = (r, a) => a[Math.floor(r() * a.length)];
// a direction around n, tilted by `spread` and pulled towards the viewer by `toCam`
function jitterDir(r, n, spread, toCam = 0) {
  return new THREE.Vector3(n.x + (r() - 0.5) * spread * 2, n.y + (r() - 0.5) * spread * 2, n.z + (r() - 0.5) * spread + toCam).normalize();
}
const TWIG = ['#2B2140', '#3A2C4E', '#251B36', '#46365C']; // aubergine-browns that sit on Lasting Blue

export const RECIPES3D = {
  moss: {
    label: 'Moss', petals: { rate: 0.25, size: 0.022 }, spores: 0.8, height: 1, body: cw => mix(cw.foliage[0], '#000000', 0.25),
    build(c) {
      const { r, cw } = c;
      for (let i = 0, n = c.count(3600, 90); i < n; i++) {
        const p = c.point(0.8);
        c.add('moss', { pos: p.pos.clone().addScaledVector(p.normal, 0.002), normal: p.normal.clone(), data: [between(r, 0.035, 0.06), r() * 6.28, c.delay(p.pos), r()],
          a: mix(cw.foliage[0], '#000000', r() * 0.2), b: mix(cw.foliage[1], cw.foliage[0], r() * 0.3), c: mix(cw.foliage[2], cw.foliage[1], r() * 0.35) });
      }
      // tiny 5-petal flowers on short stems (ref: moss + pink blossoms)
      for (let i = 0, n = c.count(60, 1.5); i < n; i++) {
        const p = c.point(0.9), d = c.delay(p.pos, 0.6);
        const inst = { pos: p.pos.clone(), dir: jitterDir(r, p.normal, 0.35, 0.3), stem: [between(r, 0.02, 0.04), 0, (r() - 0.5), r()], own: [between(r, 0.05, 0.075), r() * 6.28, d, r()],
          a: mix('#FFFFFF', cw.flower, r() * 0.5), b: cw.flower, c: cw.flowerDeep };
        c.add('flower5', inst); c.perch(inst, 0.04);
      }
      for (let i = 0, n = c.count(16, 0.5); i < n; i++) {
        const p = c.point(0.7);
        c.add('leaf', { pos: p.pos.clone(), dir: new THREE.Vector3(r() - 0.5, r() - 0.5, 0.35).normalize(), stem: [0, 0, 0, r()], own: [between(r, 0.06, 0.1), (r() - 0.5) * 1.2, c.delay(p.pos, 0.3), r()], a: cw.foliage[1], b: cw.foliage[2] });
      }
      c.cards({ bloom: 16, leaf: 6, critter: 0.6 });
    },
  },
  blossom: {
    label: 'Blossom', petals: { rate: 0.9, size: 0.028 }, spores: 0.6,
    build(c) {
      const { r, cw } = c;
      for (let i = 0, n = c.count(200, 22); i < n; i++) {
        const p = c.point(0.6);
        c.add('stem', { pos: p.pos.clone(), dir: jitterDir(r, new THREE.Vector3(r() - 0.5, r() - 0.5, 0.3), 0.4), stem: [between(r, 0.06, 0.13), 0.1, (r() - 0.5) * 1.4, r()], own: [between(r, 0.004, 0.0075), 0, c.delay(p.pos), r()], a: pick(r, TWIG), b: pick(r, TWIG) });
      }
      const big = [[4, ['#FFFFFF', cw.flower2, cw.flowerDeep]], [2.5, [cw.flower, mix(cw.flower, '#FFFFFF', 0.5), cw.flowerDeep]], [2, [cw.flowerDeep, cw.flower, cw.flowerDeep]], [1.5, [cw.flower2, '#FFFFFF', cw.flowerDeep]]];
      const pickW = () => { const tot = big.reduce((s, b) => s + b[0], 0); let x = r() * tot; for (const b of big) { x -= b[0]; if (x <= 0) return b[1]; } return big[0][1]; };
      for (let i = 0, n = c.count(70, 2.4); i < n; i++) {
        const p = c.point(0.75), [a, b, cc] = pickW();
        const inst = { pos: p.pos.clone(), dir: jitterDir(r, p.normal, 0.9, 0.5), stem: [0.012, 0, 0, r()], own: [between(r, 0.075, 0.14), r() * 6.28, c.delay(p.pos, 0.35), r()], a, b, c: cc };
        c.add('flower6', inst); c.perch(inst, 0.012);
      }
      for (let i = 0, n = c.count(420, 16); i < n; i++) {
        const p = c.point(0.7), [a, b, cc] = pickW();
        c.add('flower5', { pos: p.pos.clone(), dir: jitterDir(r, p.normal, 0.9, 0.5), stem: [0.008, 0, 0, r()], own: [between(r, 0.035, 0.065), r() * 6.28, c.delay(p.pos, 0.2), r()], a, b, c: cc });
      }
      for (let i = 0, n = c.count(22, 1.2); i < n; i++) {
        const p = c.point(0.6);
        c.add('leaf', { pos: p.pos.clone(), dir: jitterDir(r, new THREE.Vector3(r() - 0.5, r() - 0.5, 0.2), 0.3), stem: [0, 0, 0, r()], own: [between(r, 0.05, 0.085), (r() - 0.5), c.delay(p.pos, 0.4), r()], a: cw.foliage[1], b: cw.foliage[2] });
      }
      c.cards({ bloom: 24, leaf: 4, critter: 0.5 });
    },
  },
  jungle: {
    label: 'Jungle', petals: { rate: 0.35, size: 0.03, leafy: true }, spores: 0.5, height: 0.7,
    build(c) {
      const { r, cw } = c;
      for (let i = 0, n = c.count(500, 40); i < n; i++) {
        const p = c.point(0.45);
        c.add('moss', { pos: p.pos.clone(), normal: p.normal.clone(), data: [between(r, 0.03, 0.05), r() * 6.28, c.delay(p.pos), r()],
          a: mix(cw.foliage[0], '#000000', 0.3), b: cw.foliage[0], c: cw.foliage[1] });
      }
      const leafCards = c.speciesOf('leaf'), bloomCards = c.speciesOf('bloom');
      // creepers: from the rim, drooping under gravity, leaves alternating along them
      const nv = Math.max(2, c.count(0, 3.4));
      for (let i = 0; i < nv; i++) {
        const p = c.point(0.25), hang = r() < 0.7;
        const dir = hang ? new THREE.Vector3(p.normal.x * 0.6 + (r() - 0.5) * 0.4, -1, 0.15).normalize() : jitterDir(r, new THREE.Vector3(r() - 0.5, 0.6, 0.2), 0.5);
        const len = hang ? between(r, 0.35, 1.0) : between(r, 0.25, 0.55), d0 = c.delay(p.pos);
        const stem = [len, hang ? between(r, 0.1, 0.35) : 0.6, (r() - 0.5) * 1.6, r()];
        c.add('stem', { pos: p.pos.clone(), dir, stem, own: [between(r, 0.006, 0.01), 0, d0, r()], a: cw.foliage[0], b: cw.foliage[1] });
        let side = r() < 0.5 ? -1 : 1;
        for (let u = 0.12 + r() * 0.08; u <= 1.0; u += between(r, 0.06, 0.1)) {
          side = -side;
          const own = [between(r, 0.07, 0.12) * (1.1 - u * 0.4), (r() - 0.5) * 0.8, d0 + u * 0.9, r()];
          if (leafCards.length && r() < 0.3) c.add('card', { pos: p.pos.clone(), dir, stem, own: [own[0] * 1.9, 0, own[2], own[3]], u: [u, side * 1.1], sp: c.next(leafCards), mode: 1 });
          else c.add('leaf', { pos: p.pos.clone(), dir, stem, own, u: [u, side * 0.9], a: mix(cw.foliage[1], cw.foliage[2], r() * 0.5), b: cw.foliage[0] });
        }
        if (r() < 0.45) {
          const tip = { pos: p.pos.clone(), dir, stem, own: [between(r, 0.1, 0.16), r() * 6.28, d0 + 0.9, r()], u: [1, 0] };
          if (bloomCards.length && r() < 0.6) { c.add('card', { ...tip, own: [tip.own[0] * 1.8, tip.own[1] * 0.1, tip.own[2], tip.own[3]], sp: c.next(bloomCards), mode: 0 }); c.perch({ ...tip, stem }, 1); }
          else { c.add('flower6', { ...tip, a: cw.flower, b: mix(cw.flower, '#FFFFFF', 0.4), c: cw.flowerDeep }); c.perch({ ...tip, stem }, 1); }
        }
      }
      // big fronds standing off the face
      for (let i = 0, n = c.count(6, 0.5); i < n; i++) {
        const p = c.point(0.9);
        c.add('leaf', { pos: p.pos.clone(), dir: jitterDir(r, new THREE.Vector3(r() - 0.5, r() - 0.2, 0.4), 0.4), stem: [0, 0, 0, r()], own: [between(r, 0.12, 0.22), (r() - 0.5), c.delay(p.pos, 0.3), r()], a: cw.foliage[1], b: cw.foliage[0] });
      }
      c.cards({ bloom: 6, leaf: 10, critter: 0.6 });
    },
  },
  // letters as bark-covered limbs, overgrown like an old tree: moss in patches, shelf fungi on the sides,
  // mushrooms on the top edges, bare forking branches with dry leaves, caterpillars instead of butterflies
  timber: {
    label: 'Timber', petals: { rate: 0.35, size: 0.032, leafy: true, cols: () => DRY }, spores: 0.9, height: 1, bevel: 0.016, butterflies: false,
    wood: cw => ({ light: mix('#94765C', cw.bg, 0.06), dark: mix('#21150D', cw.bg, 0.08), lichen: mix('#B5C4A2', cw.foliage[2], 0.2) }),
    build(c) {
      const { r, cw } = c;
      // a rim point whose outward normal passes `test` (falls back to any rim point)
      const rim = test => { let p; for (let k = 0; k < 24; k++) { p = c.point(0); if (test(p.normal)) break; } return p; };
      // moss grows in patches, thickest in the middle of each
      for (let k = 0, np = Math.max(1, c.count(4, 0.2)); k < np; k++) {
        const ctr = c.point(0.75), R = between(r, 0.04, 0.11), face = ctr.normal.z > 0.9;
        for (let i = 0, n = Math.round(R * R * 9000 * c.density); i < n; i++) {
          const a = r() * 6.28, d = R * Math.sqrt(-Math.log(1 - r() * 0.95)) * 0.6, x = ctr.pos.x + Math.cos(a) * d, y = ctr.pos.y + Math.sin(a) * d;
          if (face && !c.inside(x, y)) continue;
          const pos = face ? new THREE.Vector3(x, y, ctr.pos.z + 0.002) : ctr.pos.clone().add(new THREE.Vector3(Math.cos(a) * d * 0.4, Math.sin(a) * d * 0.4, (r() - 0.5) * 0.04));
          c.add('moss', { pos, normal: ctr.normal.clone(), data: [between(r, 0.03, 0.055) * (1.15 - d / R * 0.5), r() * 6.28, c.delay(pos), r()],
            a: mix(cw.foliage[0], '#000000', r() * 0.25), b: mix(cw.foliage[1], cw.foliage[0], r() * 0.3), c: mix(cw.foliage[2], cw.foliage[1], r() * 0.4) });
        }
      }
      // shelf fungi in little stacks on the side walls, rolled about the outward axis so they tip towards the viewer
      for (let k = 0, n = c.count(0, 1.1); k < n; k++) {
        const p = rim(nm => Math.abs(nm.x) > 0.75), nrm = new THREE.Vector3(p.normal.x, p.normal.y * 0.3, 0).normalize(), d0 = c.delay(p.pos, 0.5);
        const base = pick(r, [[mix('#4A2E20', cw.bg, 0.15), '#9A6A44', '#D9C2A0'], [mix('#6A341A', '#3A2418', 0.4), '#B4702E', '#E6CFA6']]);
        for (let j = 0, m = 1 + Math.floor(r() * 3); j < m; j++) {
          const pos = p.pos.clone().add(new THREE.Vector3(0, j * 0.04 - 0.03, (r() - 0.5) * 0.02)).setZ(DEPTH / 2);
          c.add('bracket', { pos, normal: nrm, data: [between(r, 0.11, 0.17) * (1 - j * 0.2), 0.95 + (r() - 0.5) * 0.3, d0 + j * 0.12, r()], a: base[0], b: base[1], c: base[2] });
        }
      }
      // mushrooms in clusters on the edges that face up, plus the odd one on the face
      for (let k = 0, n = c.count(2.5, 0.8); k < n; k++) {
        const onTop = r() < 0.8, p = onTop ? rim(nm => nm.y > 0.55) : c.point(1), d0 = c.delay(p.pos, 0.4);
        const up = onTop ? new THREE.Vector3(p.normal.x * 0.25, 1, 0.15).normalize() : new THREE.Vector3((r() - 0.5) * 0.3, 0.45, 1).normalize();
        const cap = pick(r, ['#8C5A3C', '#B4532A', '#C98A3A', mix('#6A4A3A', cw.flowerDeep, 0.3)]);
        for (let j = 0, m = 1 + Math.floor(r() * 3); j < m; j++) {
          const sz = between(r, 0.06, 0.11) * (j ? 0.7 : 1), pos = p.pos.clone().add(new THREE.Vector3((r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.03));
          c.add('shroom', { pos, normal: up.clone().add(new THREE.Vector3((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.2)).normalize(), data: [sz, r() * 6.28, d0 + j * 0.15, r()], a: '#F2E9DA', b: mix('#E4CDB0', cap, 0.25), c: cap });
        }
      }
      // bare forking branches from the rim, carrying dry leaves
      const BARK = [mix('#3B2A1E', cw.bg, 0.12), mix('#5E4A3A', cw.bg, 0.08)];
      const branch = (pos, dir, len, rad, d0, depth) => {
        const stem = [len, between(r, 0, 0.1), (r() - 0.5) * 0.8, r()];
        c.add('stem', { pos, dir, stem, own: [rad, 0, d0, r()], a: BARK[0], b: BARK[1] });
        let side = r() < 0.5 ? -1 : 1;
        for (let u = 0.3 + r() * 0.2; u <= 1; u += between(r, 0.14, 0.26)) {
          side = -side;
          if (r() < 0.25) continue; // gaps: some leaves have already fallen
          c.add('leaf', { pos, dir, stem, own: [between(r, 0.045, 0.075), (r() - 0.5) * 1.6, d0 + u * 0.8, r()], u: [u, side * 1.1], a: pick(r, DRY), b: mix('#4A2E1A', cw.bg, 0.1) });
        }
        if (depth < 2) for (let k = 0, n = 1 + Math.floor(r() * 2); k < n; k++) { // forks: start where the parent is at u
          const u = between(r, 0.35, 0.75), side3 = new THREE.Vector3(-dir.y, dir.x, 0).normalize(), b = side3.clone().multiplyScalar(stem[2] * len * Math.sin(u * Math.PI) * 0.35);
          const at = pos.clone().addScaledVector(dir, len * u).add(b); at.y -= stem[1] * len * u * u;
          const nd = dir.clone().addScaledVector(side3, (r() < 0.5 ? -1 : 1) * between(r, 0.5, 0.9)).normalize();
          branch(at, nd, len * between(r, 0.4, 0.6), rad * 0.6, d0 + u * 0.6, depth + 1);
        }
      };
      for (let k = 0, n = c.count(0, 1.2); k < n; k++) {
        const p = c.point(0);
        branch(p.pos.clone(), jitterDir(r, new THREE.Vector3(p.normal.x, p.normal.y + 0.35, 0.2), 0.3), between(r, 0.2, 0.38), between(r, 0.011, 0.017), c.delay(p.pos, 0.1), 0);
      }
      // fallen dry leaves lying on the face
      for (let i = 0, n = c.count(12, 0); i < n; i++) {
        const p = c.point(1), a = r() * 6.28;
        c.add('leaf', { pos: p.pos.clone().setZ(p.pos.z + 0.004), dir: new THREE.Vector3(Math.cos(a), Math.sin(a), 0.12).normalize(), stem: [0, 0, 0, r()], own: [between(r, 0.05, 0.08), (r() - 0.5) * 0.3, c.delay(p.pos, 0.6), r()], a: pick(r, DRY), b: mix('#4A2E1A', cw.bg, 0.1) });
      }
      // caterpillars crawling round a small loop on the face (the loop is checked to stay on the letter)
      for (let k = 0, n = Math.max(r() < 0.6 ? 1 : 0, c.count(1.5, 0)); k < n; k++) caterpillar(c, c.point(1).pos, c.delay(new THREE.Vector3(), 0.8));
      // no species cards: the library recolours them into the brand palette (pink/cyan), wrong for dry wood
    },
    // click on a letter: a drift of dry leaves, a clump of mushrooms and sometimes a new caterpillar
    spot({ r, cw, pts, R, add }) {
      pts.forEach((p, i) => {
        const a = r() * 6.28, delay = p.d / R * 0.55 + r() * 0.15;
        add('leaf', { pos: p.pos.clone().setZ(p.pos.z + 0.004), dir: new THREE.Vector3(Math.cos(a), Math.sin(a), 0.15).normalize(), stem: [0, 0, 0, r()], own: [between(r, 0.05, 0.08), (r() - 0.5) * 0.4, delay, r()], a: pick(r, DRY), b: '#4A2E1A' });
        if (i < 3) { const cap = pick(r, ['#8C5A3C', '#B4532A', '#C98A3A']); add('shroom', { pos: p.pos.clone(), normal: new THREE.Vector3((r() - 0.5) * 0.4, 0.4, 1).normalize(), data: [between(r, 0.05, 0.09), r() * 6.28, delay + 0.2, r()], a: '#F2E9DA', b: mix('#E4CDB0', cap, 0.25), c: cap }); }
      });
      if (r() < 0.5) caterpillar({ r, cw, add, inside: null }, pts[0].pos, 0.4);
    },
  },
};
const DRY = ['#C98A3A', '#A5532A', '#7A4A2A', '#D9B26A', '#8E5B2E'];
const CATER = cw => [[mix('#7DBF3A', cw.foliage[1], 0.3), mix('#B8D84A', cw.foliage[2], 0.3), '#3A2A12'], ['#E07A1F', '#22160E', '#1A120C'], [mix('#5FA83A', cw.foliage[1], 0.2), '#E8C33A', '#2A1D15']];
function caterpillar(c, ctr, delay) {
  const { r } = c;
  for (let k = 0; k < 20; k++) {
    const A = between(r, 0.05, 0.09), Bm = A * between(r, 0.4, 0.7), th = r() * 6.28, d = new THREE.Vector2(Math.cos(th), Math.sin(th)), n = new THREE.Vector2(-d.y, d.x);
    const ok = !c.inside || [...Array(12)].every((_, i) => { const a = i / 12 * 6.28, x = ctr.x + d.x * A * Math.cos(a) + n.x * Bm * Math.sin(a), y = ctr.y + d.y * A * Math.cos(a) + n.y * Bm * Math.sin(a); return c.inside(x, y); });
    if (!ok) continue;
    const [a, b, cc] = pick(r, CATER(c.cw));
    c.add('cater', { pos: new THREE.Vector3(ctr.x, ctr.y, DEPTH), dir: new THREE.Vector3(d.x, d.y, 0), stem: [A, Bm, between(r, 0.5, 0.8), r() < 0.5 ? -1 : 1], own: [between(r, 0.02, 0.026), r() * 6.28, delay, r()], a, b, c: cc });
    return;
  }
}

// shared helper the engine binds into the build context
export function placeCards(c, { bloom = 0, leaf = 0, critter = 0 }) {
  const { r } = c;
  const kinds = [['bloom', bloom, [0.15, 0.24], 0], ['leaf', leaf, [0.13, 0.2], 0]];
  for (const [kind, k, [a, b], mode] of kinds) {
    const list = c.speciesOf(kind); if (!list.length || !k) continue;
    for (let i = 0, n = c.count(k, k * 0.05); i < n; i++) {
      const p = c.point(0.85), inst = { pos: p.pos.clone().addScaledVector(p.normal, 0.06), dir: p.normal.clone(), stem: [0, 0, 0, r()], own: [between(r, a, b), (r() - 0.5) * 0.9, c.delay(p.pos, 0.5), r()], u: [0, 0], sp: c.next(list), mode };
      c.add('card', inst);
      if (kind === 'bloom') c.perch(inst, 0);
    }
  }
  const crit = c.speciesOf('critter');
  if (crit.length && r() < critter * c.density) {
    const p = c.point(1);
    c.add('card', { pos: p.pos.clone().addScaledVector(p.normal, 0.08), dir: p.normal.clone(), stem: [0, 0, 0, r()], own: [between(r, 0.17, 0.24), (r() - 0.5) * 1.2, c.delay(p.pos, 1.2), r()], u: [0, 0], sp: c.next(crit), mode: 2 });
  }
}
export { V };
