# Butterfly Type

Nature type generator + A-series poster generator for the Novo 2026 / Small Steps world.
Type and the letters overgrow with flora; the film's iridescent butterflies come to visit.

```bash
cd butterfly-type
npm install
npm run setup   # once: Novo woff2 → ttf, brand images, species SVG library (needs network)
npm run dev     # http://localhost:5178
```

## Using it
- **Type mode**: type to grow · space cuts the stems · ⌫ withers · enter clears · move the pointer through the garden (plants lean away, a fast flick throws petals, perched butterflies take off).
- **2D / 3D**: 2D = illustrated vines (Type Garden lineage, SVG-exportable). 3D = WebGL moss / blossom / jungle (example-1 lineage).
- **Recipes** (chips) × **Catalogue** (species on/off per recipe; in 2D the hand-drawn rose is a tile too) × **Colourways** (swatches) × **Novo weight**. Selected species are used in turn, so every one you pick shows up. **🎲 Randomize** picks one bloom, one leaf and one critter. ⚙ = density, butterflies, wind, petals, pollen, tilt-shift.
- **Click (3D, type mode)**: clicking a letter grows a new cluster of blooms (plus catalogue species) that ripples out from the click, bursts petals, sends a pulse through the flora and scatters nearby butterflies; clicking empty space sends a petal gust. Up to 8 clusters per letter.
- **Letter formation (3D, ⚙)**: each new letter starts as particles pulled out of the background blobs (in their colours). *Particles → letter* (default) condenses the letter where they land, then the flora grows; *Pop* scales it in. Formation time 0.5–3 s.
- **Layout**: the toolbar and content stay centred between the open panels (poster editor on the right, catalogue on the left inside the poster popup). On phones the toolbar is one swipeable row, the poster editor and catalogue are bottom sheets, and tapping the garden opens the keyboard.
- **Poster** (toolbar → *Make a poster*): opens as a popup over the garden, editor on the right, catalogue (if open) on the left; close with ✕ or Esc.
- **Poster editor**: words, headline/subline, 7 preview motions (default **Typed**: the words type out, then a glass butterfly drops by; *Typing speed* 0.4–3×, the loop length follows) + frame scrubber (pause on the frame you want printed), colourway cards, gradient-blob background (open *Background* to drag blobs), A4/A3/A2 + 3 mm bleed, export.
- **Export**: PNG at 300 dpi (tiled, so A2 works; 3D tiles reuse the preview's tilt-shift in full-image space) · SVG (2D engine, everything outlined).

## Password gate & Vercel deploy
The whole site sits behind a password pop-up (`auth/gate.js`), enforced on the server by Vercel Routing Middleware (`middleware.js`), so nothing (app, assets, brand images) is served without it. The password is never sent to the browser.
- **Env vars** (Vercel → Project → Settings → Environment Variables): `SITE_PASSWORD` (required; without it the deployment answers 503 instead of opening up) and optional `AUTH_SECRET` (rotate it to sign everyone out without changing the password).
- **Cookie**: `bt_auth`, HttpOnly, Secure, SameSite=Lax, 30 days; an HMAC of the password, so changing `SITE_PASSWORD` invalidates every session. Sign out: visit `/__logout`.
- **Local**: copy `.env.example` → `.env.local` and set `SITE_PASSWORD`; `npm run dev` / `npm run preview` then run the same gate. Without it, local dev stays open.
- **Vercel project settings**: Root Directory `butterfly-type`, framework preset Vite (build `npm run build`, output `dist`). Keep *Include files outside the root directory in the Build Step* enabled; the 3D butterflies import `../src/butterflies.js`, `../src/wing.js`, `../src/rand.js`. Commit `public/` (fonts, species, images produced by `npm run setup`) so the build doesn't need the setup step.

## Code
| | |
|---|---|
| `src/main.js` | shell: state (localStorage), dock, catalogue, mode/engine switching, export wiring |
| `src/garden2d.js` | 2D engine (port of Type Garden: growth, weave, roses, wither/cut, 7 poster motions) + species blooms/leaves/critters + glass butterfly sprites |
| `src/garden3d/` | 3D engine: `geometry.js` glyph extrude + area sampler + base meshes · `shaders.js` shared growth/wind/pointer prelude + layer shaders + tilt-shift · `recipes.js` moss/blossom/jungle · `flock.js` film butterflies (`../src/butterflies.js`) perch/flee/drift · `index.js` engine, petals, pollen, tiled render |
| `src/species.js` | species SVG parsing, colourway recolouring, 3D atlas |
| `src/background.js` | gradient blobs (radial gradients, seam-free), grain |
| `src/poster.js` | poster grammar/layout, overlay, tiled PNG + SVG export |
| `src/brand.js` | Novo tokens + colourways (Paper is flagged pending: dark type on light) |

## Assets & licences
- Novo fonts: SIL OFL (`public/fonts/OFL.txt`). Lockups + glass butterflies: brand assets, internal use only.
- Species: Microsoft Fluent Emoji Flat (MIT) and game-icons.net (CC BY 3.0, credit Lorc, Delapouite et al.). See `public/species/LICENSES.md`.
- Growth mechanics after Type Garden by Akshat Agarwal; 3D techniques after the example-1 generator.

## Known notes
- `opentype.js` is pinned to **1.3.4**: 2.0.0 returns NaN points for ~30–70 Novo glyphs per weight (broke SVG outlines and 3D letters).
- Motion is preview-only; export is a still of the scrubbed frame.
- Not yet done (owner: you): credits page, dark-type decision for *Paper*.
