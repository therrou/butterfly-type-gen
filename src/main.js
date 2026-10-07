// Butterfly Type — shell: state, dock, catalogue, type mode ↔ poster mode, 2D ↔ 3D engines, export.
import { COLOURWAYS, colourway } from './brand.js';
import { loadFonts, WEIGHTS } from './fonts.js';
import { loadSpecies, species, getSpecies, thumb } from './species.js';
import { defaultBg, drawBg, drawGrainPreview, blobs, blobAt } from './background.js';
import { Garden2D, MOTIONS, ROSE, loadButterflySprite } from './garden2d.js';
import { Garden3D } from './garden3d/index.js';
import { PW, PH, FORMATS, layout, drawOverlay, loadPosterImages, exportPNG, exportSVG, download } from './poster.js';

// ---------- recipes ----------
const RECIPES = {
  '2d': [
    { id: 'vines', label: 'Vines & roses', roses: 0.6, leafP: 0.3, critterP: 0.3, def: { bloom: [ROSE, 'g:rose', 'g:daisy', 'g:flower-twirl'], leaf: ['g:vine-leaf', 'g:fern'], critter: ['g:dragonfly', 'g:ladybug', 'g:caterpillar', 'g:snail'] } },
    { id: 'meadow', label: 'Meadow', roses: 0.15, leafP: 0.5, critterP: 0.35, def: { bloom: [ROSE, 'f:cherry-blossom', 'f:hibiscus', 'f:tulip', 'f:blossom', 'f:white-flower', 'f:sunflower'], leaf: ['f:herb', 'f:leaf-fluttering-in-wind', 'f:shamrock', 'f:seedling'], critter: ['f:lady-beetle', 'f:snail', 'f:honeybee', 'f:bug'] } },
    { id: 'silhouette', label: 'Silhouettes', roses: 0.5, leafP: 0.5, critterP: 0.35, def: { bloom: ['g:daisy', 'g:rose', 'g:lotus-flower', 'g:sunflower', 'g:flower-twirl', 'g:vine-flower'], leaf: ['g:fern', 'g:vine-leaf', 'g:oak-leaf', 'g:linden-leaf', 'g:sprout'], critter: ['g:dragonfly', 'g:caterpillar', 'g:ladybug', 'g:bee', 'g:snail'] } },
  ],
  '3d': [
    { id: 'moss', label: 'Moss', def: { bloom: ['f:white-flower', 'f:blossom', 'f:cherry-blossom'], leaf: ['f:mushroom', 'f:seedling', 'f:four-leaf-clover'], critter: ['f:lady-beetle', 'f:snail', 'f:bug'] } },
    { id: 'blossom', label: 'Blossom', def: { bloom: ['f:cherry-blossom', 'f:blossom', 'f:hibiscus', 'f:white-flower'], leaf: ['f:leaf-fluttering-in-wind'], critter: ['f:honeybee', 'f:lady-beetle'] } },
    { id: 'jungle', label: 'Jungle', def: { bloom: ['f:hibiscus', 'f:lotus', 'f:tulip'], leaf: ['f:herb', 'f:leaf-fluttering-in-wind', 'g:fern', 'g:vine-leaf', 'f:maple-leaf'], critter: ['g:dragonfly', 'f:snail', 'f:bug', 'f:cricket', 'f:beetle'] } },
  ],
};
const recipeDef = (eng, id) => RECIPES[eng].find(r => r.id === id) || RECIPES[eng][0];

// ---------- state ----------
const STORE = 'butterfly-type-v5'; // bump when defaults change so saved settings don't mask them
const DEFAULT = {
  mode: 'type', engine: '2d', recipe: { '2d': 'vines', '3d': 'blossom' }, weight: { '2d': 400, '3d': 700 },
  // settings sliders start at the middle of their range; 3D particle formation is off by default
  // (when switched on, the reveal is preset to Particles → letter)
  cw: 'lasting', density: 1.05, butterflies: 6, wind: 0.75, petals: 1, spores: 1, tilt: 1, boil: true, form: false, formDur: 1.75, reveal: 'dissolve',
  species: {}, bg: defaultBg(), text: '',
  poster: { words: '', typeSpeed: 1, headline: 'Small steps to\nlasting health', subline: '', motion: 'typed', seed: 7, format: 'A3', bleed: false, artScale: 1, artY: 0, frame: 0.5, playing: true },
};
let S = structuredClone(DEFAULT);
try { const saved = JSON.parse(localStorage.getItem(STORE) || 'null'); if (saved) S = { ...S, ...saved, poster: { ...S.poster, ...saved.poster }, bg: { ...S.bg, ...saved.bg }, recipe: { ...S.recipe, ...saved.recipe }, weight: { ...S.weight, ...saved.weight } }; } catch {}
S.mode = 'type'; S.text = ''; // always open on an empty garden ("Start typing")
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ ...S, text: liveText() })); } catch {} };
let saveT = 0; const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 400); };

const $ = id => document.getElementById(id);
const g2 = new Garden2D(), g3 = new Garden3D();
const c2 = document.createElement('canvas'), x2 = c2.getContext('2d');
const eng = () => (S.engine === '3d' ? g3 : g2);
const selected = () => { const r = S.recipe[S.engine]; return S.species[r] || defaultSelection(S.engine, r); };
const defaultSelection = (e, r) => { const d = recipeDef(e, r).def; return [...d.bloom, ...d.leaf, ...d.critter]; };
const liveText = () => (S.engine === '3d' ? g3.text() : g2.letters.filter(l => !l.dead).map(l => l.ch).join('')) || S.text;

function engineOpts() {
  const cw = colourway(S.cw), sel = selected(), r = recipeDef(S.engine, S.recipe[S.engine]);
  if (S.engine === '2d') {
    const ofk = k => sel.filter(id => (id === ROSE ? 'bloom' : getSpecies(id)?.kind) === k);
    g2.setOpts({ weight: S.weight['2d'], density: S.density, butterflies: S.butterflies, boil: S.boil, cw,
      recipe: { roses: r.roses, leafP: r.leafP, critterP: r.critterP, blooms: ofk('bloom'), leaves: ofk('leaf'), critters: ofk('critter') } });
  } else {
    g3.setOpts({ weight: S.weight['3d'], density: S.density, butterflies: S.butterflies, recipe: r.id, cw, species: sel, wind: S.wind, petals: S.petals, spores: S.spores, tilt: S.tilt, form: S.form, formDur: S.formDur, reveal: S.reveal });
  }
}

// ---------- type view ----------
const tbg = $('tbg'), tx = tbg.getContext('2d');
const typeView = $('typeView');
let stable = { w: 0, h: 0 };
function stableHeight(W, H) {
  const full = Math.max(H, innerHeight, document.documentElement.clientHeight);
  if (Math.abs(W - stable.w) > 2) stable = { w: W, h: full };
  else stable.h = Math.max(stable.h, full);
  return stable.h;
}
function sizeType() {
  const W = typeView.clientWidth || innerWidth, H = typeView.clientHeight || innerHeight, d = Math.min(2, devicePixelRatio || 1);
  tbg.width = W * d; tbg.height = H * d;
  c2.width = W * d; c2.height = H * d; c2.style.width = W + 'px'; c2.style.height = H + 'px';
  // Line breaking uses the tallest height seen at this width, so the on-screen keyboard (which shrinks
  // the visible area, and on iOS / Firefox / Samsung Internet also innerHeight) never re-wraps the words;
  // W×H, the visible area, is only used to fit. A width change (rotation) starts a new measurement.
  const layoutH = coarse ? stableHeight(W, H) : H;
  g2.layoutH = layoutH; g3.view.layoutH = layoutH;
  g2.topPad = coarse ? Math.max(0, document.querySelector('.dock').getBoundingClientRect().bottom - typeView.getBoundingClientRect().top + 8) : 0;
  g2.resize(W, H);
  if (S.mode === 'type') g3.setSize(W, H, d);
}
function mountType() {
  const host = $('tHost'); host.innerHTML = '';
  host.appendChild(S.engine === '3d' ? g3.canvas : c2);
}
c2.addEventListener('pointermove', e => { g2.mx = e.clientX; g2.my = e.clientY; });
c2.addEventListener('pointerleave', () => { g2.mx = null; });

addEventListener('keydown', e => {
  if (S.mode !== 'type' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) e.target.blur();
  const E = eng();
  if (e.key === 'Backspace') { e.preventDefault(); E.backspace(); }
  else if (e.key === 'Enter') { e.preventDefault(); E.clear(); }
  else if (e.key.length === 1) { e.preventDefault(); E.add(e.key); }
  else return;
  hint(); saveSoon();
});
// touch devices: a hidden input brings up the keyboard; beforeinput maps to grow / wither / clear
const typeInput = $('typeInput'), coarse = matchMedia('(pointer: coarse)').matches;
// ---- touch typing ----
// The hidden field always holds one sentinel character so the keyboard's ⌫ has something to delete
// (an empty field fires no delete at all on iOS / many Android keyboards). On every input we diff
// the field against what it held before: removed characters wither, new ones grow. This also follows
// predictive keyboards (Gboard etc.) that type through a composition and rewrite whole words.
const SENT = '_';
let fieldWas = SENT, composing = false;
const resetField = () => { typeInput.value = SENT; fieldWas = SENT; try { typeInput.setSelectionRange(1, 1); } catch {} };
function fieldDiff() {
  if (S.mode !== 'type') { resetField(); return; }
  const old = fieldWas, cur = typeInput.value, E = eng();
  let p = 0; while (p < old.length && p < cur.length && old[p] === cur[p]) p++;
  let dels = old.length - p;
  if (p === 0 && old[0] === SENT && old.length > 1) dels -= 1; // the sentinel itself is not a letter
  for (let i = 0; i < dels; i++) E.backspace();
  for (const ch of cur.slice(p)) { if (ch === SENT) continue; if (ch === '\n') E.clear(); else E.add(ch); }
  if (composing) fieldWas = cur; else resetField();
  hint(); saveSoon();
}
typeInput.addEventListener('input', fieldDiff);
typeInput.addEventListener('compositionstart', () => { composing = true; });
typeInput.addEventListener('compositionend', () => { composing = false; setTimeout(fieldDiff, 0); });
typeInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); eng().clear(); hint(); } });
typeInput.addEventListener('focus', () => { resetField(); requestAnimationFrame(() => scrollTo(0, 0)); });
resetField();
// focus on a completed tap (click), not on touch-down: focusing on pointerdown let the tap's own
// focus change blur the field again, so the keyboard flickered open/closed
typeView.addEventListener('click', () => { if (coarse && S.mode === 'type' && document.activeElement !== typeInput) typeInput.focus({ preventScroll: true }); });

// ---- keyboard-aware layout (touch) ----
// Keep the garden and toolbar inside the visible area above the on-screen keyboard instead of letting
// the browser scroll the page; batch the resize events of the keyboard animation into one refit.
if (coarse) document.body.setAttribute('data-touch', '');
const vv = window.visualViewport;
if (vv && coarse) {
  let raf = 0;
  const syncVV = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const root = document.documentElement.style;
      root.setProperty('--vv-top', vv.offsetTop + 'px');
      root.setProperty('--vv-h', vv.height + 'px');
      if (scrollY) scrollTo(0, 0);
    });
  };
  vv.addEventListener('resize', syncVV); vv.addEventListener('scroll', syncVV); syncVV();
}
$('hint').textContent = coarse ? 'Tap to start typing' : 'Start typing';
function hint() { const has = liveText().trim().length > 0 && (S.engine === '3d' ? g3.letters.some(l => !l.dead) : g2.letters.some(l => !l.dead)); $('hint').toggleAttribute('data-hidden', has); }

// ---------- poster view ----------
const pbg = $('pbg'), pover = $('pover'), pb = pbg.getContext('2d'), po = pover.getContext('2d'), sheet = $('sheet');
const pc2 = document.createElement('canvas'), px2 = pc2.getContext('2d');
let pScale = 1, pDpr = 1, pt0 = performance.now(), exporting = false;
const motion = () => MOTIONS.find(m => m.id === S.poster.motion) || MOTIONS[0];
// loop length comes from the engine (Typed depends on word length and typing speed)
const loopT = () => (S.engine === '3d' ? (g3.poster ? g3.poster.T * 1000 : 0) : (g2.P ? g2.P.T : 0)) || motion().T;
function sizePoster() {
  const st = $('pstage'), r = st.getBoundingClientRect(), phone = innerWidth <= 760, padX = phone ? 24 : 56, padBot = phone ? 12 : 28;
  // keep the sheet clear of the toolbar, however many rows it wraps to
  const padTop = phone ? 12 : Math.max(28, document.querySelector('.dock').getBoundingClientRect().bottom - r.top + 14);
  const h = Math.max(200, Math.min(r.height - padTop - padBot, (r.width - padX) * Math.SQRT2)), w = h / Math.SQRT2;
  sheet.style.width = w + 'px'; sheet.style.height = h + 'px';
  sheet.style.marginTop = (padTop - padBot) + 'px';
  pDpr = Math.min(2, devicePixelRatio || 1); pScale = w / PW;
  for (const c of [pbg, pover, pc2]) { c.width = Math.round(w * pDpr); c.height = Math.round(h * pDpr); }
  pc2.style.width = w + 'px'; pc2.style.height = h + 'px';
  if (S.mode === 'poster' && S.engine === '3d') g3.setSize(w, h, pDpr);
}
function buildPoster() {
  const L = layout(S.poster), m = motion();
  if (S.engine === '3d') { g3.setSize(PW * pScale, PH * pScale, pDpr); g3.buildPoster({ text: S.poster.words, motion: m.id, seed: S.poster.seed, box: L.box, W: PW, H: PH, T: m.T, speed: S.poster.typeSpeed }); }
  else g2.buildPoster({ text: S.poster.words, motion: m.id, seed: S.poster.seed, box: L.box, speed: S.poster.typeSpeed });
  pt0 = performance.now();
}
function mountPoster() {
  const host = $('pHost'); host.innerHTML = '';
  host.appendChild(S.engine === '3d' ? g3.canvas : pc2);
}
function posterTime(now) {
  const T = loopT();
  if (S.poster.playing) { const t = (now - pt0) % T; S.poster.frame = t / T; return t; }
  return S.poster.frame * T;
}

// blob dragging (design units)
let drag = null;
const toDesign = e => { const r = pover.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
pover.addEventListener('pointerdown', e => {
  if (!$('bgGroup').open) return;
  const [u, v] = toDesign(e), t = S.poster.playing ? 0 : posterTime(performance.now()) / 1000;
  const hit = blobs(S.bg, colourway(S.cw)).find(b => { const [x, y] = blobAt(b, S.bg.drift ? t : 0, false); return Math.hypot((x - u) * PW, (y - v) * PH) < 28; });
  if (hit) { drag = hit.i; pover.setPointerCapture(e.pointerId); }
});
pover.addEventListener('pointermove', e => {
  const [u, v] = toDesign(e);
  if (drag != null) { S.bg.moved[drag] = [Math.max(-0.2, Math.min(1.2, u)), Math.max(-0.2, Math.min(1.2, v))]; saveSoon(); return; }
  const near = $('bgGroup').open && blobs(S.bg, colourway(S.cw)).some(b => Math.hypot((b.x - u) * PW, (b.y - v) * PH) < 28);
  pover.toggleAttribute('data-drag', near);
});
pover.addEventListener('pointerup', () => { drag = null; });

// ---------- render loop ----------
function tick(now) {
  requestAnimationFrame(tick);
  const cw = colourway(S.cw);
  if (S.mode === 'type') {
    const d = Math.min(2, devicePixelRatio || 1);
    tx.setTransform(d, 0, 0, d, 0, 0);
    const W = typeView.clientWidth, H = typeView.clientHeight;
    drawBg(tx, W, H, S.bg, cw, now / 1000);
    drawGrainPreview(tx, W, H, S.bg.grain);
    if (S.engine === '3d') g3.frame(); else { g2.caret = true; g2.frame(x2, d, now); }
  } else if (!exporting) {
    const t = posterTime(now), k = pScale * pDpr;
    pb.setTransform(k, 0, 0, k, 0, 0);
    drawBg(pb, PW, PH, S.bg, cw, t / 1000);
    pb.setTransform(pDpr, 0, 0, pDpr, 0, 0); drawGrainPreview(pb, PW * pScale, PH * pScale, S.bg.grain);
    if (S.engine === '3d') { g3.posterFrame(t); g3.render(); }
    else { px2.setTransform(1, 0, 0, 1, 0, 0); px2.clearRect(0, 0, pc2.width, pc2.height); px2.setTransform(k, 0, 0, k, 0, 0); g2.posterDraw(g2.canvasBackend(px2), t); }
    po.setTransform(1, 0, 0, 1, 0, 0); po.clearRect(0, 0, pover.width, pover.height); po.setTransform(k, 0, 0, k, 0, 0);
    drawOverlay(po, layout(S.poster), cw);
    if ($('bgGroup').open) for (const b of blobs(S.bg, cw)) {
      const [x, y] = blobAt(b, t / 1000, S.bg.drift);
      po.strokeStyle = 'rgba(255,255,255,.7)'; po.lineWidth = 1.5 / pScale; po.beginPath(); po.arc(x * PW, y * PH, 14, 0, 7); po.stroke();
      po.fillStyle = b.col; po.beginPath(); po.arc(x * PW, y * PH, 9, 0, 7); po.fill();
    }
    if (S.poster.playing) { $('pFrame').value = Math.round(S.poster.frame * 1000); $('pFrameOut').value = (t / 1000).toFixed(1) + 's'; }
  }
}

// ---------- mode / engine switches ----------
function setMode(m) {
  if (m === S.mode) return;
  const keep = liveText();
  S.mode = m; document.body.dataset.mode = m;
  if (m === 'poster') {
    S.text = keep;
    if (S.engine === '3d') { g3.endPoster(); }
    requestAnimationFrame(() => { sizePoster(); mountPoster(); buildPoster(); });
  } else {
    if (S.engine === '3d') { g3.endPoster(); }
    sizeType(); mountType();
    eng().setText(S.text || '');
    hint();
  }
  syncUI(); save();
}
function setEngine(e) {
  if (e === S.engine) return;
  const keep = liveText();
  if (S.engine === '3d') g3.endPoster();
  S.engine = e; document.body.dataset.engine = e;
  engineOpts();
  if (S.mode === 'type') { sizeType(); mountType(); eng().setText(keep); hint(); }
  else { sizePoster(); mountPoster(); buildPoster(); }
  if (!$('drawer').hidden) renderCatalogue();
  syncUI(); save();
}
function applyLook({ regrow = false } = {}) {
  engineOpts();
  if (S.mode === 'poster') buildPoster();
  else if (S.engine === '2d' && regrow) g2.reseed();
  else if (S.engine === '3d' && regrow) g3.reseed();
  syncUI(); saveSoon();
}

// ---------- UI ----------
function seg(el, value, on) {
  for (const b of el.querySelectorAll('button')) { b.setAttribute('aria-pressed', String(b.dataset.v === value)); b.onclick = () => on(b.dataset.v); }
}
function syncUI() {
  const cw = colourway(S.cw);
  seg($('engineSeg'), S.engine, setEngine);
  // recipes
  const rc = $('recipeChips'); rc.innerHTML = '';
  for (const r of RECIPES[S.engine]) {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = r.label; b.setAttribute('aria-pressed', String(S.recipe[S.engine] === r.id));
    b.onclick = () => { S.recipe[S.engine] = r.id; applyLook({ regrow: true }); renderCatalogue(); };
    rc.appendChild(b);
  }
  // weight
  const wname = Object.entries(WEIGHTS).find(([, v]) => v === S.weight[S.engine])?.[0] || 'Regular';
  $('weightBtn').textContent = 'Novo ' + wname;
  const wm = $('weightMenu'); wm.innerHTML = '';
  for (const [n, v] of Object.entries(WEIGHTS)) {
    const b = document.createElement('button'); b.textContent = n; b.style.fontWeight = v; b.setAttribute('aria-checked', String(v === S.weight[S.engine]));
    b.onclick = () => { S.weight[S.engine] = v; wm.hidden = true; applyLook({ regrow: true }); };
    wm.appendChild(b);
  }
  // colourways (dock swatches + poster cards)
  const sw = $('cwSwatches'); sw.innerHTML = '';
  const pp = $('pPalette'); pp.innerHTML = '';
  for (const c of COLOURWAYS) {
    const b = document.createElement('button'); b.className = 'sw'; b.title = c.name + (c.pending ? ' (pending brand check)' : '');
    b.style.background = `radial-gradient(circle at 30% 30%, ${c.blobs[2]}, ${c.bg} 70%)`; b.innerHTML = `<i style="background:${c.flower}"></i>`;
    b.setAttribute('aria-pressed', String(c.id === S.cw)); b.onclick = () => { S.cw = c.id; applyLook(); renderCatalogue(); };
    sw.appendChild(b);
    const p = document.createElement('button'); p.className = 'card pal'; p.setAttribute('aria-pressed', String(c.id === S.cw)); p.setAttribute('aria-label', c.name);
    p.innerHTML = `<span class="prev" style="background:radial-gradient(circle at 25% 30%, ${c.blobs[1]}aa, transparent 55%),radial-gradient(circle at 80% 75%, ${c.blobs[2]}aa, transparent 60%),${c.bg}"><span class="d1" style="background:${c.flower}"></span><span class="d2" style="background:${c.foliage[1]}"></span><b style="color:${c.type}">Aa</b></span><span class="name">${c.name}${c.pending ? ' <em>· pending</em>' : ''}</span>`;
    p.onclick = () => { S.cw = c.id; applyLook(); renderCatalogue(); };
    pp.appendChild(p);
  }
  // settings
  const setR = (id, key, fn) => { const el = $(id); el.value = S[key]; el.oninput = () => { S[key] = +el.value; fn?.(); engineOpts(); saveSoon(); }; };
  setR('sDensity', 'density'); setR('sFormDur', 'formDur'); setR('sWind', 'wind');
  seg($('sReveal'), S.reveal, v => { S.reveal = v; engineOpts(); seg($('sReveal'), S.reveal, () => {}); syncUI(); if (S.mode === 'poster') buildPoster(); else g3.reseed(); saveSoon(); });
  $('sForm').checked = S.form; $('sForm').onchange = () => { S.form = $('sForm').checked; engineOpts(); if (S.mode === 'poster') buildPoster(); else g3.reseed(); saveSoon(); }; setR('sPetals', 'petals'); setR('sSpores', 'spores'); setR('sTilt', 'tilt');
  setR('sFlies', 'butterflies', () => { $('sFliesOut').value = S.butterflies; }); $('sFliesOut').value = S.butterflies;
  $('sDensity').onchange = () => applyLook({ regrow: true });
  $('sBoil').checked = S.boil; $('sBoil').onchange = () => { S.boil = $('sBoil').checked; engineOpts(); saveSoon(); };
  // poster panel
  const P = S.poster, [, , mw, mh] = FORMATS[P.format];
  $('sheetMeta').textContent = `${P.format} · ${motion().label} · ${colourway(S.cw).name}`;
  $('pmeta').textContent = `${P.format} · ${mw} × ${mh} mm · 300 dpi · ${(loopT() / 1000).toFixed(1)}s preview loop`;
  $('pExpLabel').textContent = `Export · ${P.format} print${P.bleed ? ' + bleed' : ''}`;
  const mg = $('pMotions'); mg.innerHTML = '';
  for (const m of MOTIONS) {
    const b = document.createElement('button'); b.className = 'card'; b.setAttribute('aria-pressed', String(m.id === P.motion));
    b.innerHTML = `<span>${m.label}</span><span class="sub">${m.sub}</span>`;
    b.onclick = () => { P.motion = m.id; P.playing = true; buildPoster(); syncUI(); saveSoon(); };
    mg.appendChild(b);
  }
  $('pPlay').textContent = P.playing ? '❚❚' : '▶';
  $('pSpeedRow').hidden = P.motion !== 'typed';
  seg($('pFormat'), P.format, v => { P.format = v; syncUI(); saveSoon(); });
  $('pSVG').disabled = S.engine !== '2d';
  $('pSVG').textContent = S.engine === '2d' ? 'Export SVG (vector)' : 'SVG needs the 2D engine';
  for (const el of document.querySelectorAll('.only3d,.only2d')) el.toggleAttribute('hidden', false);
}
function bindPanel() {
  const P = S.poster;
  $('pWords').value = P.words; $('pHead').value = P.headline; $('pSub').value = P.subline;
  let wt = 0;
  $('pWords').oninput = () => { P.words = $('pWords').value; clearTimeout(wt); wt = setTimeout(buildPoster, 250); saveSoon(); };
  $('pHead').oninput = () => { P.headline = $('pHead').value; relayout(); };
  $('pSub').oninput = () => { P.subline = $('pSub').value; relayout(); };
  $('pRegrow').onclick = () => { P.seed = Math.floor(Math.random() * 1e5); buildPoster(); saveSoon(); };
  $('pPlay').onclick = () => { P.playing = !P.playing; if (P.playing) pt0 = performance.now() - P.frame * loopT(); syncUI(); };
  $('pFrame').oninput = () => { P.playing = false; P.frame = +$('pFrame').value / 1000; $('pFrameOut').value = (P.frame * loopT() / 1000).toFixed(1) + 's'; syncUI(); };
  const sp = $('pSpeed'), spOut = $('pSpeedOut');
  sp.value = P.typeSpeed; spOut.value = P.typeSpeed.toFixed(1) + '×';
  let st = 0;
  sp.oninput = () => { P.typeSpeed = +sp.value; spOut.value = P.typeSpeed.toFixed(1) + '×'; clearTimeout(st); st = setTimeout(() => { buildPoster(); syncUI(); }, 150); saveSoon(); };
  $('pBleed').checked = P.bleed; $('pBleed').onchange = () => { P.bleed = $('pBleed').checked; syncUI(); saveSoon(); };
  const rng = (id, obj, key, rebuild) => { const el = $(id); el.value = obj[key]; el.oninput = () => { obj[key] = +el.value; if (rebuild) relayout(); saveSoon(); }; };
  rng('pArtScale', P, 'artScale', true); rng('pArtY', P, 'artY', true);
  rng('bgCount', S.bg, 'count'); rng('bgSoft', S.bg, 'soft'); rng('bgScale', S.bg, 'scale'); rng('bgGrain', S.bg, 'grain');
  $('bgDrift').checked = S.bg.drift; $('bgDrift').onchange = () => { S.bg.drift = $('bgDrift').checked; saveSoon(); };
  $('bgSeed').onclick = () => { S.bg.seed = Math.floor(Math.random() * 1e4); S.bg.moved = {}; saveSoon(); };
  $('bgReset').onclick = () => { S.bg.moved = {}; saveSoon(); };
  $('pPNG').onclick = doExportPNG; $('pSVG').onclick = doExportSVG;
}
let rl = 0;
function relayout() { clearTimeout(rl); rl = setTimeout(() => { buildPoster(); saveSoon(); }, 200); }

// ---------- catalogue ----------
// the hand-drawn rose (2D only) is offered as a catalogue item next to the downloaded species
function catalogueItems() {
  const items = species().map(sp => ({ id: sp.id, kind: sp.kind, name: sp.name.replace(/-/g, ' '), sp }));
  if (S.engine === '2d') items.unshift({ id: ROSE, kind: 'bloom', name: 'hand-drawn rose', sp: null });
  return items;
}
function roseThumb(cw) {
  const c = document.createElement('canvas'); c.width = c.height = 88;
  const g = c.getContext('2d'), B = g2.canvasBackend(g);
  g2.cc = { red: cw.flower, blue: cw.stem, line: cw.line, text: cw.type, vein: cw.bg };
  g2.rose(B, 44, 40, 30, 0, { ph1: 1, ph2: 2.5, turns: 2.2 }, 4000, null);
  return c.toDataURL();
}
function setSelection(ids, msg) {
  S.species[S.recipe[S.engine]] = ids;
  renderCatalogue(); applyLook({ regrow: true });
  if (msg) toast(msg);
}
function renderCatalogue() {
  const cw = colourway(S.cw), sel = new Set(selected()), r = recipeDef(S.engine, S.recipe[S.engine]);
  $('drawerFor').textContent = `Species growing in “${r.label}” (${S.engine.toUpperCase()}). Tap to add or remove; the garden regrows with your selection.`;
  const root = $('catalogue'); root.innerHTML = '';
  const items = catalogueItems();
  for (const [kind, title] of [['bloom', 'Blooms'], ['leaf', 'Leaves & fungi'], ['critter', 'Critters']]) {
    const list = items.filter(it => it.kind === kind), on = list.filter(it => sel.has(it.id)).length;
    const sec = document.createElement('div'); sec.className = 'cat'; sec.innerHTML = `<h4>${title} <span class="muted">· ${on} of ${list.length}</span></h4><div class="tiles"></div>`;
    for (const it of list) {
      const b = document.createElement('button'); b.className = 'tile'; b.setAttribute('aria-pressed', String(sel.has(it.id)));
      b.innerHTML = `<img alt="" src="${it.sp ? thumb(it.sp, cw) : roseThumb(cw)}"><span>${it.name}</span>`;
      b.title = it.sp ? `${it.sp.name} · ${it.sp.license}` : 'Hand-drawn rose (Type Garden style)';
      b.onclick = () => { const cur = new Set(selected()); const was = cur.has(it.id); was ? cur.delete(it.id) : cur.add(it.id); setSelection([...cur], `${was ? 'Removed' : 'Added'} ${it.name} · regrowing`); };
      sec.querySelector('.tiles').appendChild(b);
    }
    root.appendChild(sec);
  }
}
// one random bloom, one leaf, one critter
function randomize() {
  const items = catalogueItems(), pick = k => { const l = items.filter(i => i.kind === k); return l[Math.floor(Math.random() * l.length)]; };
  const chosen = ['bloom', 'leaf', 'critter'].map(pick).filter(Boolean);
  setSelection(chosen.map(c => c.id), 'Randomized: ' + chosen.map(c => c.name).join(' · '));
}
$('randBtn').onclick = randomize; $('catRandom').onclick = randomize;
function setDrawer(open) {
  $('drawer').hidden = !open; document.body.toggleAttribute('data-drawer', open);
  $('catBtn').setAttribute('aria-pressed', String(open));
  if (open) { renderCatalogue(); setSheet(false); }
}
$('catBtn').onclick = () => setDrawer($('drawer').hidden);
$('drawerClose').onclick = () => setDrawer(false);
// phone: the poster editor is a bottom sheet
function setSheet(open) { document.body.toggleAttribute('data-sheet', open); $('sheetHandle').setAttribute('aria-expanded', String(open)); }
$('sheetHandle').onclick = () => { const open = !document.body.hasAttribute('data-sheet'); setSheet(open); if (open) setDrawer(false); };
$('catReset').onclick = () => { delete S.species[S.recipe[S.engine]]; renderCatalogue(); applyLook({ regrow: true }); toast('Recipe defaults restored'); };
$('catAll').onclick = () => setSelection(catalogueItems().map(i => i.id), 'All species selected');
$('catNone').onclick = () => setSelection([], 'No species: base flora only');
$('reseedBtn').onclick = () => { if (S.mode === 'poster') { S.poster.seed = Math.floor(Math.random() * 1e5); buildPoster(); } else eng().reseed(); };
for (const [btn, menu] of [['weightBtn', 'weightMenu'], ['setBtn', 'setMenu']]) $(btn).onclick = e => { e.stopPropagation(); $(menu).hidden = !$(menu).hidden; };
addEventListener('pointerdown', e => { for (const m of ['weightMenu', 'setMenu']) if (!$(m).contains(e.target) && !e.target.closest('.pop')) $(m).hidden = true; });

// ---------- export ----------
function toast(msg) { const t = $('toast'); t.textContent = msg; t.setAttribute('data-show', ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.removeAttribute('data-show'), 2600); }
const fname = ext => `butterfly-type-${(S.poster.words || 'poster').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 24)}-${S.poster.format}-${S.cw}.${ext}`;
// Renders the print PNG for the current poster and returns the Blob (no download).
async function renderPNG(onProgress) {
  const P = S.poster, cw = colourway(S.cw), frameT = P.frame * loopT();
  let art;
  if (S.engine === '3d') {
    g3.posterFrame(frameT);
    art = (ctx, { x, y, w, h, b, tw, th }) => {
      // intersect this tile with the trim area and render that part of the 3D view
      const ix = Math.max(x, b), iy = Math.max(y, b), ex = Math.min(x + w, b + tw), ey = Math.min(y + h, b + th);
      if (ex <= ix || ey <= iy) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      g3.renderTile(tw, th, ix - b, iy - b, ex - ix, ey - iy, th / (PH * pScale), ctx, ix - x, iy - y);
      ctx.restore();
    };
  } else art = ctx => g2.posterDraw(g2.canvasBackend(ctx), frameT);
  exporting = true;
  try { return await exportPNG({ format: P.format, bleed: P.bleed, cw, bg: S.bg, poster: P, frameT, art, onProgress }); }
  finally { exporting = false; if (S.engine === '3d') sizePoster(); }
}
async function doExportPNG() {
  const P = S.poster, btn = $('pPNG'), frameT = P.frame * loopT();
  P.playing = false; syncUI();
  btn.disabled = true; $('pStatus').textContent = 'Rendering tiles…';
  try {
    const blob = await renderPNG(f => { $('pStatus').textContent = `Rendering ${Math.round(f * 100)}%`; });
    download(blob, fname('png'));
    $('pStatus').textContent = `Saved ${P.format} PNG · frame ${(frameT / 1000).toFixed(1)}s · ${(blob.size / 1e6).toFixed(1)} MB`;
    toast('PNG exported');
  } catch (err) { console.error(err); $('pStatus').textContent = 'Export failed: ' + err.message; }
  btn.disabled = false;
}
function doExportSVG() {
  if (S.engine !== '2d') return;
  const P = S.poster, cw = colourway(S.cw), frameT = P.frame * loopT(), parts = [];
  g2.posterDraw(g2.svgBackend(parts), frameT);
  download(new Blob([exportSVG({ format: P.format, bleed: P.bleed, cw, bg: S.bg, poster: P, frameT, artSVG: parts.join('') })], { type: 'image/svg+xml' }), fname('svg'));
  $('pStatus').textContent = 'Saved SVG (type and garden as outlines)'; toast('SVG exported');
}

// formation particles leave from the background blobs that are currently on screen
g3.blobSource = () => {
  const cw = colourway(S.cw), poster = S.mode === 'poster';
  const W = poster ? PW : typeView.clientWidth, H = poster ? PH : typeView.clientHeight, M = Math.max(W, H);
  const t = (poster ? posterTime(performance.now()) : performance.now()) / 1000;
  return blobs(S.bg, cw).map(b => { const [u, v] = blobAt(b, t, S.bg.drift); return { u, v, ru: b.r * M / W, rv: b.r * M / H, col: b.col }; });
};
// the poster lives in a popup over the garden
$('posterBtn').onclick = () => setMode('poster');
$('dockClose').onclick = $('posterClose').onclick = () => setMode('type');
addEventListener('keydown', e => { if (e.key === 'Escape' && S.mode === 'poster' && !/INPUT|TEXTAREA/.test(e.target.tagName)) { if (!$('drawer').hidden) setDrawer(false); else setMode('type'); } });

// ---------- boot ----------
// re-fit whenever the content area changes size (window, side panels, phone sheet)
let rz = 0, lastBox = '';
const onResize = () => { clearTimeout(rz); rz = setTimeout(() => {
  if (S.mode === 'type') { sizeType(); return; }
  const r = $('pstage').getBoundingClientRect(), key = Math.round(r.width) + 'x' + Math.round(r.height);
  if (key === lastBox) return; lastBox = key; sizePoster(); buildPoster();
}, coarse ? 180 : 60); };
addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(typeView);
new ResizeObserver(onResize).observe($('pstage'));
new ResizeObserver(() => { lastBox = ''; onResize(); }).observe(document.querySelector('.dock'));
(async () => {
  await Promise.all([loadFonts(), loadSpecies(), loadButterflySprite(), loadPosterImages()]);
  document.body.dataset.engine = S.engine;
  engineOpts();
  sizeType(); mountType();
  bindPanel(); syncUI();
  eng().setText(S.text || '');
  hint();
  $('loading').setAttribute('data-done', '');
  requestAnimationFrame(tick);
  window.__bt = { S, g2, g3, renderPNG };
})();
