// 3D recipes: each fills a glyph's instanced layers from its sampler. Species from the library
// arrive as atlas cards (blooms on the surface or on stem tips, leaves along vines, critters walking).
import * as THREE from 'three';
import { mix } from '../brand.js';

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
};

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
