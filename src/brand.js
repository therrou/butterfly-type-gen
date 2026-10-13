// Novo 2026 tokens + the colourways. Backgrounds/blobs only ever use brand tokens; greens are the
// curated "natural accent" set and are used for foliage only.
export const T = {
  lasting: '#00008F', deep: '#12106A', night: '#07075A', indigo: '#2A1FA8', violet: '#6E4FD0',
  pink: '#E7A6D6', pinkSoft: '#F4B4D6', lilac: '#BDB6F6', cyan: '#9FE3EE', aqua: '#86F2F4',
  panel: '#F6EEF2', white: '#FFFFFF', magenta: '#C2187A', vein: '#2B2F6B',
};
export const GREENS = { deep: '#14523F', moss: '#2E8C6E', fresh: '#6CC4A1', tip: '#C8EFA8', olive: '#7DB36A' };

// bg: base fill · blobs: gradient-blob colours · type: letter colour
// flower/flower2/flowerDeep: bloom ramp · line: drawn detail on blooms · stem: stems + 2D leaves
// foliage: [base, mid, tip] for moss/leaves · petals: falling petal colours · spore: pollen
export const COLOURWAYS = [
  { id: 'lasting', name: 'Lasting', bg: T.lasting, blobs: [T.indigo, T.violet, T.pink, T.cyan], type: T.white,
    flower: T.pinkSoft, flower2: T.cyan, flowerDeep: T.magenta, line: T.white, stem: T.aqua,
    foliage: [GREENS.deep, GREENS.moss, GREENS.tip], petals: [T.pinkSoft, T.pink, T.white, T.lilac], spore: T.pinkSoft, lockup: 'white' },
  { id: 'dawn', name: 'Dawn', bg: T.indigo, blobs: [T.violet, T.pink, T.pinkSoft, T.lasting], type: T.white,
    flower: T.white, flower2: T.pinkSoft, flowerDeep: T.pink, line: T.violet, stem: T.lilac,
    foliage: [GREENS.deep, GREENS.fresh, GREENS.tip], petals: [T.white, T.pinkSoft, T.panel], spore: T.white, lockup: 'white' },
  { id: 'lilac', name: 'Lilac', bg: T.deep, blobs: [T.violet, T.lilac, T.pink, T.indigo], type: T.white,
    flower: T.lilac, flower2: T.pinkSoft, flowerDeep: T.violet, line: T.white, stem: T.pink,
    foliage: [GREENS.deep, GREENS.moss, GREENS.fresh], petals: [T.lilac, T.pink, T.white], spore: T.lilac, lockup: 'white' },
  // iridescent, like light through a glasswing: aqua blooms shifting to lilac and pink, violet hearts
  { id: 'glass', name: 'Glass', bg: T.lasting, blobs: [T.aqua, T.violet, T.pinkSoft, T.indigo], type: T.white,
    flower: T.aqua, flower2: T.lilac, flowerDeep: T.violet, line: T.lasting, stem: T.lilac,
    foliage: [GREENS.deep, GREENS.moss, GREENS.tip], petals: [T.aqua, T.lilac, T.pinkSoft, T.cyan], spore: T.aqua, lockup: 'white' },
  { id: 'fern', name: 'Fern', bg: T.lasting, blobs: [T.indigo, GREENS.moss, T.cyan, T.violet], type: T.white,
    flower: T.pinkSoft, flower2: T.white, flowerDeep: T.pink, line: T.lasting, stem: GREENS.fresh,
    foliage: [GREENS.deep, GREENS.moss, GREENS.tip], petals: [T.pinkSoft, T.white, GREENS.tip], spore: GREENS.tip, lockup: 'white' },
  // Dark type on light: pending brand check (white-on-blue rule), see PLAN.md §9.
  { id: 'paper', name: 'Paper', bg: T.panel, blobs: [T.pinkSoft, T.lilac, T.cyan, T.white], type: T.lasting,
    flower: T.pink, flower2: T.violet, flowerDeep: T.magenta, line: T.white, stem: T.lasting,
    foliage: [GREENS.deep, GREENS.moss, GREENS.fresh], petals: [T.pink, T.lilac, T.cyan], spore: T.violet, lockup: 'blue', pending: true },
];
export const colourway = id => COLOURWAYS.find(c => c.id === id) || COLOURWAYS[0];

// ---- colour helpers ----
export function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgb2hex([r, g, b]) { return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
export function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); }
export function hsl(hex) {
  const [r, g, b] = hex2rgb(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
