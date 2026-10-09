# Butterfly Type — plan

A nature type generator, and later a poster generator, for the Novo 2026 / butterfly-motion world. As you type, flora grows over the letters (moss, blossoms, creepers, illustrated vines) and brand butterflies and other insects come to visit. Posters are composed on a brand-locked gradient-blob background and exported for print.

Starting points: `prompt.md` (Type Garden mechanics), `example-1.js/.css` (WebGL moss/blossom generator, dock UI), and the poster side panel the user pasted (motions, palette cards, export block).

---

## 1. Locked decisions (grilling session, 2026-10-07)

| # | Topic | Decision |
|---|---|---|
| 1 | Renderer | **Two engines, switchable**: a 3D engine (Three.js/WebGL) and a 2D engine (Canvas, Type Garden style), behind one shared shell |
| 2 | Palette | **Brand base + natural accents.** Backgrounds use brand tokens only; blossoms use pink/lilac/cyan; curated greens only for foliage and moss |
| 3 | Typeface | **Novo only.** Bold is the default for 3D, Regular for 2D, and users can switch Light–Bold. The UI is set in Novo too. No Playfair or DM Mono |
| 4 | Butterflies | **Ecosystem.** They arrive after growth, land on blossoms or letters, and others drift through. Count slider 0–12. 3D uses `src/butterflies.js`; 2D uses the PNG cut-outs |
| 5 | Interaction | **Type mode (phase 1) → Poster mode (phase 2)** |
| 6 | Export | **High-res PNG (print, tiled)** for both engines, plus **SVG** for the 2D engine. No video and no transparent PNG |
| 7 | Formats | **Print A-series portrait only**: A4, A3 and A2 at 300 dpi, with an optional 3 mm bleed |
| 8 | Audience | **Internal designers**, on a static site behind a password or SSO. Never public, because the brand guide is confidential |
| 9 | Catalogue | **Rich species library** of flora and insects (butterflies, dragonflies, caterpillars…). Presets are *recipes* that mix species |
| 10 | Asset method | **Hybrid.** Bases are procedural (moss, branches, vines, stems, leaves); hero species are illustrated SVGs; butterflies are the existing glass assets |
| 11 | Art source | **Claude draws a first pass of ~15 species in code**, following a strict swappable spec so an illustrator can replace them later |
| 12 | Stack | **Vite + vanilla JS** in `butterfly-type/`, importing the parent `src/butterflies.js`, `wing.js` and `rand.js` |
| 13 | Poster motion | The 7 motions from the panel are **editor preview only**. Export stays a still, frozen at a frame the user picks |
| 14 | Background | **Brand-locked gradient blob generator.** The panel's palette cards become brand colourways |

---

## 2. Architecture

```
butterfly-type/
  index.html
  vite.config.js            # fs.allow: ['..'] so ../src and ../assets can be imported
  src/
    main.js                 # boot, mode switch (type ↔ poster), engine switch (2D ↔ 3D)
    state.js                # single serialisable state {text, weight, engine, recipe, colourway, bg, seed, motion, t}
    rand.js → ../../src/rand.js (re-export, seeded)
    glyphs/
      font.js               # loads Novo (TTF/WOFF converted from woff2, see §8), opentype.js
      sample.js             # glyph → outline polylines, stroke skeleton (medial axis), area samples, normals
      layout.js             # line breaking, tracking, fit-to-frame
    species/
      spec.md               # the species contract (§3)
      registry.js           # id → {kind, forms: {svg?, proc2d?, proc3d?}, palette slots, growth}
      svg/*.svg             # illustrated species (rose, peony, daisy, wisteria, cherry, monstera,
                            #   fern, ivy, dandelion, dragonfly, caterpillar, ladybird, bee, moth, snail)
      proc/                 # moss.js, branch.js, vine.js, stem.js, leaf.js (procedural generators)
    recipes/
      moss.js  blossom.js  jungle.js  vines2d.js     # v1 presets = weighted species mixes
    engines/
      Engine.js             # interface: init(canvas), setScene(state), grow(letterIdx), wither(letterIdx),
                            #   frame(t), renderTile(rect, scale) → ImageData, toSVG()? , dispose()
      engine2d/             # Canvas 2D: Type Garden growth and drawing, SVG species drawn as Path2D
      engine3d/             # Three.js: moss shell/fur, instanced blossoms/leaves, SVG→card meshes, butterflies
    fauna/
      butterflies3d.js      # wraps ../../src/butterflies.js (landing targets, drift paths)
      butterflies2d.js      # glass-butterfly / wings-pair PNG sprites, per-wing scaleX flap
      insects.js            # dragonfly hover, caterpillar crawl along strokes, ladybird walk, bee hop
    background/
      blobs.js              # shared blob model (seeded positions, radii, colours from colourway)
      blobs2d.js  blobs3d.glsl  blobsSvg.js
    motion/
      presets.js            # breathe, growWither, typed, gust, reach, scatter, visitor; f(t, seed) analytic
    poster/
      templates.js          # A4/A3/A2 grids: headline, subline, art band, lockup, URL
      compose.js            # layers bg + art + type + lockup
    export/
      tiled.js              # tiled renderer + stitcher (PNG via OffscreenCanvas / toBlob per tile)
      png.js  svg.js
    ui/
      dock.js  panel.js  styles.css   # example-1 dock + the pasted poster panel, re-skinned in Novo
```

**Shared shell, two back-ends.** Everything outside `engines/` is engine-agnostic. Each engine takes the same `state` and the same glyph samples and returns pixels (or SVG). Switching engines keeps the text, seed and colourway.

**Determinism.** As in the film repo, all growth and motion is analytic in `t` and seeded (`rand.js`), and nothing uses `Math.random()` or timers inside the simulation. That's what lets the print export reproduce exactly the frame the user picked, at 300 dpi.

---

## 3. Species spec (the swappable contract)

Every illustrated species is one SVG file plus a small JS descriptor:

- **SVG rules**: a `viewBox` with the **anchor at (0,0)**, the point where the species attaches to a stroke. It grows along the +Y axis by convention. Named groups: `#stem`, `#leaf-*`, `#petal-*`, `#center`, `#wing-l`, `#wing-r`, `#body`, `#detail`. Fills use `var(--c1)`…`var(--c4)` only, never hard-coded colours. No filters, text or raster images.
- **Descriptor**: `{ id, kind: 'flower'|'leaf'|'insect'|'base', attach: 'tip'|'stroke'|'surface'|'free', sizeRange, growth: [{part:'#stem', t0, t1}, …], palette: {c1:'bloomA', c2:'bloomB', …}, motion: {sway, flap?, crawl?} }`
- **2D engine** parses the SVG once into `Path2D`s per part, then animates part transforms along the growth timeline. It also exports to SVG directly.
- **3D engine** turns each part into a flat card mesh (ShapeGeometry from the SVG paths, with a slight bend). Flowers and leaves are instanced. Insects get simple rigs (wing hinge, body segments).
- **Palette slots** map to the active colourway, so one drawing serves every colourway.

**v1 catalogue (~15 SVG + 5 procedural):**
- *Flowers*: rose (the Type Garden spiral), peony, daisy, wisteria raceme, cherry blossom, dandelion
- *Foliage*: monstera, fern frond, ivy leaf
- *Insects*: dragonfly, caterpillar, ladybird, bee, moth, snail
- *Procedural*: moss shell, branch skeleton, vine/creeper with curls, stem, generic leaf
- *Butterflies*: existing brand assets (not redrawn)

---

## 4. Engines

### 4.1 2D engine (Type Garden lineage)
- Port the growth logic from `prompt.md`: stems sprout from stroke samples and curl with tendrils, flowers open at the tips, **space** cuts the stems so the next word starts a new garden, **backspace** withers, **enter** clears.
- Rendering: flat fills with Novo Regular letters under the vines. Vines weave over and under using a per-segment depth flag, as in ref 1.
- `toSVG()`: every element is already a path, so letters (opentype paths), vines, species and blob background (`feGaussianBlur`) are emitted as one SVG.

### 4.2 3D engine (example-1 lineage)

#### How example-1 actually works (reverse-engineered from `example-1.js` lines ~34000–38385)
`example-2.js` is React DOM and `example-3.js` is the Claude Design runtime; neither holds any rendering logic. Everything worth taking is in example-1:

| Feature | Technique | Where |
|---|---|---|
| Glyph geometry | Bundled opentype.js parser: `charToGlyph` → `getPath(0,0,1)` → `toShapes()` → shallow `ExtrudeGeometry` (letter body) | ~34053–34097, `Wy()` ~36640 |
| Placement | An area sampler on the glyph shapes, with `sampleFace` (front surface) and `sampleRim` (side walls) returning `{pos, normal}`. Instance count = `area·a + perimeter·b`, so density stays constant across letters | sampler ~35432, `c.point()/count()` ~36645 |
| Everything is instanced | Each layer (moss, twig, big/small blossom, sprig, leaf) is one `InstancedBufferGeometry` with `iPos, iDir, iData(scale, rot, delay, seed), iExtra, iColA/B/C`, generated by a preset's `build(ctx)` with a seeded rng and shuffled | `Hy`, `Gy`, `Wy` ~36600–36690 |
| Grow-in | Vertex shader `growth(delay) = easeOutBack((uTime − uBirth − delay·uDelayScale)/uGrowDur)`. Delay = distance from glyph centre + jitter, so flora spreads outward from each letter's centre. Flower heads pop open right behind their stems | `Pv`, `Gv` ~34643, ~34851 |
| Backspace / clear | `survival()`: backspace shrinks outer instances first (`1−d²`). Clear dissolves with a screen-space dither (`ign()` interleaved-gradient noise + `discard`) | ~34652–34709 |
| Wind | `windSway()`: two snoise fields scrolling over time, plus a periodic **gust** (`pow(sin(...)^10)`) travelling in x, so gusts roll across the letters as waves. Weighted by height² so tips move and roots stay put | ~34668 |
| **Hover reaction** | Raycast pointer → plane at letter depth → `uPointer` uniform. Every vertex shader adds `pointerPush()`, a Gaussian falloff pushing away from the pointer (r≈0.35). Moss, stems, flower heads and leaves all bend. Pointer *speed* is tracked and decays with `exp(−8t)` | shader ~34679, `bindPointer` ~37446 |
| **Petals flowing** | A GPU particle ring buffer (420 instances: `iSpawn, iVel, iLife(birth, life, size, seed), iCol`). Motion is analytic in age: velocity + `uWind·0.12·age²` drift + sine flutter + slight gravity + tumbling `rotAxis`, then fade in/out. Emitted (a) continuously at `preset.petals.rate` from 120 precomputed `emitPoints` per glyph, and (b) **in bursts when the pointer moves fast near a glyph**, flung away from the cursor | `Zy` ~36820, `updatePetals` ~37517 |
| Petal shading | Petal discs with `aR` (0 centre → 1 tip): colour lerps inner→edge, the centre disc is pollen. Petals "breathe" open and closed with a slow sine | `Gv/Kv` ~34836 |
| Moss look | Instanced tufts with height attribute `aH`: base→mid→tip gradient, fake AO at the root, fake subsurface glow at the tips, snoise shimmer | `Bv/Vv` ~34714 |
| Atmosphere | Spore/pollen `Points` drifting upward, with point size and softness from distance to a focus plane (bokeh) | `Yv/Xv` ~34942 |
| Camera feel | `EffectComposer`: render pass → **tilt-shift** H+V blur with a focus band sized to the line count → output pass | ~37184 |
| Presets | Data objects: `{layers:[{id, label, base()→geometry, material, category}], petals:{rate, colors, size}, build(ctx)}`. 20+ presets (Moss, Lichen, Fern, Daisies, Big/Small blossoms, Violets, Branches, Crystals…) | ~36400+ |
| Perf | `trackFps` lowers `quality`, which reduces counts and blur; build queue per glyph | ~37565 |
| Export | Screen-res `canvas.toBlob` PNG + MediaRecorder WebM (we replace this with tiled print, §8) | ~37584, ~37638 |
| **Butterflies** | **None.** Example-1 has no insects at all. Ours come from `../src/butterflies.js` | — |

#### What this means for us
- **Adopt the architecture almost 1:1**: glyph → extrude + area sampler → per-layer instanced buffers → one shared shader prelude (`growth`, `survival`, `windSway`, `pointerPush`) included by every layer shader. That one prelude gives every species growth, wither, wind and hover for free.
- **Species become layers.** A species' 3D form is a `base()` geometry: SVG parts → `ShapeGeometry` cards with an `aR`/`aH` attribute so the shared shading works. Recipes (§3) are exactly example-1's `build(ctx)` with our species ids.
- **Novo fonts**: the bundled parser reads TTF/OTF/WOFF but **not WOFF2** (`wOFF` only, line ~9312). That confirms the build-time conversion of `assets/Novo-*.woff2` → `.woff`/`.ttf` (§8).
- **Butterflies plug into the same uniform world.** `butterflies.js` is already instanced and shader-driven (`makeWings`, `applyInstances`, iridescent `wingMaterial`). Feed it the same `uTime/uWind/uPointer`:
  - **Land**: pick blossom instances' `iPos` (tip = stem point at h=1) as perch targets; on landing, wing flap slows to an open/close "breathing" at ~0.5 Hz.
  - **Hover**: a butterfly within the pointer radius takes off (pointer speed > threshold), fleeing along `pointerPush` direction, then loops back to another perch.
  - **Drift**: idle flyers follow `windSway` + a curl-noise path; gusts carry them visibly.
- **Other insects** use the same pattern with their own small rigs: dragonflies hover-dart between perches, caterpillars crawl along stems/strokes (path param in `t`), ladybirds walk the letter face (`sampleFace` points), bees hop flower to flower.
- **Petal stream gets brand colours**: emission colours from the colourway's bloom slots. Butterfly takeoffs also emit a small petal puff.
- **Poster motions map onto existing uniforms**, so they're cheap:
  - Breathe → `uBreath`
  - Gust → `uWind` boost + gust phase
  - Grow & wither → animate `uBirth`/`uDeath`
  - Reach → `uPointer` driven along a path as a "light", with a negative push (attract)
  - Scatter → reseeded delays + petal burst
  - Typed → per-glyph birth schedule
  - Visitor → a scripted butterfly perch path
- **Tilt-shift and spores stay**, retuned to the film style guide (shallow DOF, high bloom threshold). Spores tint pink/cyan like the wing glitter in `refs/luminous.mp4`.
- **Determinism fix.** Example-1 uses `Math.random()` for petal emission and a real-time accumulator. For a **still** export this is harmless: time is frozen, and every tile renders the same particle buffer. We still swap in the seeded rng so "regrow" and the PNG metadata seed reproduce the same poster.

#### v1 presets, built on this
- **Moss**: moss tufts (`aH` shader) + tiny 5-petal flowers + stray leaves. Ref 2.
- **Blossom clusters**: twig layer as the dark branch skeleton (rim and face samples) + big/small blossom discs + leaves. This is literally example-1's blossom preset, recoloured to the brand. Refs 3–4.
- **Jungle creepers**: new vine layer (tube along a seeded curve that starts on the rim and hangs under a gravity bias) + monstera/fern/ivy cards + the dropping-petal stream as falling leaves.
- Butterflies on every preset (count slider), landing on blossoms.

---

## 5. Type mode (phase 1)

- Full-screen stage, with the example-1 dock at the top: recipe chips, Novo weight menu, engine toggle (2D/3D), colourway, reseed, butterfly count, and "→ Poster".
- Live typing with the Type Garden mechanics, multi-line. Clicking a letter re-grows just that letter with a new sub-seed.
- A **Mixer** drawer for custom recipes: species list with density sliders, plus base type (moss / branch / vine / none). Recipes are saved as JSON in `localStorage` and can be imported or exported as files.

---

## 6. Poster mode (phase 2)

A side panel modelled on the pasted panel, re-skinned in Novo on Lasting Blue/near-black:

| Section | Contents |
|---|---|
| Header | "Poster" · current format (e.g. `A3 · 297×420 mm · 300 dpi`) |
| Words | Text input + **Regrow garden** (new seed) |
| Motion *(preview only)* | 7 cards: **Breathe** (slow sway, 3s), **Grow & wither** (bloom then back, 6s), **Typed** (type, cut, repeat, 5s), **Gust** (wind sweeps through, 4s), **Reach** (stems follow a light, 6s), **Scatter** (random bloom, fade, 6s), **Visitor** (a butterfly drops by, 7s). A **frame scrubber** below picks the moment to freeze for export |
| Palette | **Colourway cards** in the same visual pattern as the panel (bg swatch + 2 dots + "Aa"), with brand-only content. Draft set: **Lasting** (Lasting Blue bg, pink/cyan bloom, white type), **Dawn** (`#2A1FA8→#6E4FD0→#E7A6D6` blobs, white type), **Lilac** (deep violet, lilac/peach bloom), **Glass** (Lasting Blue, cyan/white bloom, iridescent butterflies), **Paper** (`#F6EEF2` panel white bg, Lasting Blue type, pink/lilac bloom), **Fern** (Lasting Blue, curated greens + pink). Each card sets bg blobs, flora slots and type colour together |
| Background | Gradient blob generator (§7) |
| Layout | Format A4/A3/A2, bleed on/off, headline and subline (Novo), art scale/offset. The lockup (`assets/novo-lockup-tagline-white.png`) and `novonordisk.com` stay fixed in the brand positions |
| Export | **PNG (print)** · **SVG** (2D engine only) · progress/status line |

**Template grammar** (from `refs/brand` and `out/poster.png`): headline top-left in Novo, the flora type art as the hero in the middle band, the lockup bottom-right and the URL bottom-left. White type on blue. On the Paper colourway, type switches to Lasting Blue, but only if the brand guide allows it; this needs checking against `refs/brand` (§9).

---

## 7. Gradient blob generator

- Model: `{ base, blobs: [{x, y, r, colourSlot, drift}], blur, grain, seed }`, with 3–7 blobs and colours limited to the active colourway's brand tokens (`#00008F`, `#2A1FA8`, `#6E4FD0`, `#E7A6D6`, `#F4B4D6`, `#9FE3EE`, `#F6EEF2`).
- Controls: count, blur, scale, grain amount, seed re-roll, and direct drag of blob handles on the canvas.
- Render: a fullscreen fragment shader in 3D, `filter: blur()` layers on an offscreen canvas in 2D, and `<circle>` elements with `feGaussianBlur` plus an `feTurbulence` grain layer in SVG.
- Motion: blobs drift slowly (analytic in `t`) in preview, in step with the selected motion card.
- Print: grain is always on at a low amount so 300 dpi gradients don't band.

---

## 8. Export (print, tiled)

- Target sizes at 300 dpi: A4 2480×3508, A3 3508×4961, A2 4961×7016 (+35 px per side for 3 mm bleed).
- These exceed WebGL max drawing-buffer sizes and the Safari canvas-area cap (~16.7 MP), so **both engines render in tiles**:
  - 3D: `camera.setViewOffset(fullW, fullH, x, y, tileW, tileH)` per tile at a fixed `t`, then `readPixels`.
  - 2D: `ctx.setTransform` per tile.
  - Tiles are stitched into a PNG encoder that writes row by row (a small streaming PNG writer such as UPNG/pako), so the full image is never one canvas.
- Blur and grain are computed in **poster space, not tile space**, with a blur-radius overlap margin per tile to avoid seams.
- SVG (2D only): the same scene graph serialised. Novo glyphs are converted to outlines, so there are no font licence or embedding issues.
- Metadata: format, colourway, seed and recipe go into a PNG `tEXt` chunk, so any poster can be regenerated.

**Font loading note**: opentype.js can't read woff2 directly. Either convert `assets/Novo-*.woff2` to TTF at build time (fonttools, a script in `scripts/`), or decompress with `wawoff2` at runtime. Build-time conversion is the plan.

---

## 9. Open questions to confirm later (not blocking)

1. **Type Garden attribution**: the mechanics and the rose drawing derive from Akshat Agarwal's Type Garden. Add a credit line in the UI's about/credits, even for an internal tool.
2. **Brand rule check**: is dark-on-light (the Paper colourway) allowed, or only white on blue? Check against `refs/brand/p*.txt`/`.jpg` before shipping Paper.
3. **Greens**: get brand/design sign-off on the curated foliage greens (Q2's "natural accents").
4. **Hosting/gate**: Vercel password protection vs. company SSO. Who owns the deploy?
5. **Illustrator handover**: when, and who replaces the first-pass SVGs?

---

## 10. Milestones

| M | Scope | Done when |
|---|---|---|
| **M0 Setup** | Vite package, parent imports, Novo TTF conversion, glyph sampling + debug view | Typing shows Novo outlines with stroke skeleton and samples overlaid |
| **M1 2D engine** | Type Garden port (grow, cut, wither, clear), rose + vine + leaf, Novo Regular, dock UI | Matches ref 1's feel on Lasting Blue with brand colours |
| **M2 Species system** | Spec, registry, 15 first-pass SVGs, recipe model, Mixer drawer, 2D insects + PNG butterflies | Any species can be mixed into a recipe; swapping an SVG file needs no code change |
| **M3 3D engine** | Port example-1's core (glyph extrude + area sampler, instanced layers, shared prelude: growth/survival/wind/pointerPush, petal particles, spores, tilt-shift), then moss, blossom and creeper presets, SVG→card meshes, `butterflies.js` perch/flee/drift on the same uniforms, engine toggle | All 4 v1 presets look right, and a 2D↔3D switch keeps text, seed and colourway |
| **M4 Background** | Blob generator in 2D/3D/SVG, colourway cards | Colourway change re-tints bg, flora and type together |
| **M5 Poster mode** | Panel, templates A4/A3/A2, lockup/URL, 7 preview motions, frame scrubber | Poster composes live; motions loop smoothly in preview |
| **M6 Export** | Tiled PNG (both engines), SVG (2D), bleed, metadata | A2 PNG with no seams or banding; SVG opens cleanly in Illustrator |
| **M7 Ship** | Gated deploy, credits, perf pass (instancing budgets, 60 fps on M1 for preview) | Designers can log in and export |

**Quality loop**, the same as the film repo: after each milestone, render stills with Playwright (`scripts/render.mjs`-style) into `out/type/`, compare them with refs 1–4 and the brand pages, and log fixes in the README.

---

## 11. Implementation status (2026-10-07)

Built and running locally (`npm run dev`, see README.md). M0–M6 are implemented in a first pass; M7 (credits, password gate, hosting) is left to the owner.

Changes from the plan:
- **Species art**: instead of drawing ~15 SVGs by hand, the library uses ~47 free SVGs. Microsoft Fluent Emoji Flat (MIT) supplies the colour illustrations; game-icons.net (CC BY 3.0, credit required) supplies the silhouettes. They are recoloured into the colourways at runtime. The catalogue drawer toggles species per recipe.
- **No GLB models**: the free CC0/CC-BY low-poly packs (Quaternius, Poly Pizza) were checked but not used. Their faceted style clashes with the references, and SVG cards fit the instanced pipeline better.
- **2D recipes**: Vines & roses, Meadow (Fluent), Silhouettes (game-icons).
- **3D recipes**: Moss, Blossom, Timber, Jungle, Ocean (2D also has Ocean).
- **Poster motions** run in both engines, as preview only, with a frame scrubber.
- **Export**: tiled PNG at 300 dpi for both engines; SVG for 2D only.
- **opentype.js** is pinned to 1.3.4 (2.0.0 produces NaN glyph points).

---

## 12. Ocean recipe (grilling session, 2026-10-09)

| # | Topic | Decision |
|---|---|---|
| 1 | Engines | **Both**: a procedural 3D recipe and a card-based 2D recipe, both called **Ocean** |
| 2 | 3D letters | **A procedural reef**: porous rock base, zones of brain-coral crust, sand on the up-facing ledges, varying inside each letter |
| 3 | Cast | Kelp, sea grass, branching coral, anemones · seastars, urchins, shells · seahorses, fish schools, jellyfish (in place of the butterflies) · bubbles and marine snow (in place of petals and pollen) |
| 4 | Colour | **Follows the colourway**: life uses the bloom ramp, kelp the foliage greens shifted to olive; rock and sand get a fixed natural set tinted to the background; fish get small fixed accents; caustics on the letters only (background stays brand-locked) |
| 5 | Interaction | Click a letter: sea life grows (no flowers) and bubbles burst · empty water: a current surge · pointer: anemones close, fish dart off · tilt: kelp is buoyant and floats up · shake: sand billows |
| 6 | 2D art | Extend the fetch script (Fluent + game-icons sea sets) and draw the gaps in code (`scripts/draw-sea.mjs`); the new species are in the catalogue for every recipe |
| 7 | 2D look | Kelp ribbons instead of vines, drawn anemones/coral fans at the tips, fish instead of butterflies, rising bubbles, a stippled rock/sand texture on the letters |
| 8 | Settings | The same sliders, relabelled in Ocean: *Sea life*, *Bubbles*, *Marine snow*. No glass butterflies in Ocean |
| 9 | Posters | *Typed* ends with a fish school swimming by, *Visitor* is a jellyfish drifting up, *Gust* is *Current*; the lockup is unchanged; export stays a still |
| 10 | Not now | Freshwater plants (frogbit, lily pads, duckweed, reeds) stay out of Ocean; a separate **Pond** recipe is a candidate for later |
