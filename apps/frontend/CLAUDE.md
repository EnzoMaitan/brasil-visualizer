# CLAUDE.md — Frontend (Vite + React + TypeScript)

Per-app guide. Read the root [`../../CLAUDE.md`](../../CLAUDE.md) for the full picture,
then this file for frontend-specific conventions.

## What this is

The **Brasil Visualizer** map UI: a Paradox-game-style interactive choropleth of
Brazil's 27 states (UFs). Eight map modes across the four themes, hover tooltip,
click→detail sidebar with mini-charts, state search, year slider, EN⇄PT-BR toggle,
live legend, free zoom/pan, and a Tweaks panel. Ported from the Claude Design
prototype (`Brasil Visualizer.html`) into a real Vite + React + TS app.

## Run it

```bash
npm install        # from apps/frontend
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit + vite build
npm run typecheck
```

## Map rendering — inline SVG, no map library

Per the root CLAUDE.md §5, the map is **inline SVG** — no tile-based map library, no
basemap, no API key. `src/viz/projection.ts` projects real IBGE GeoJSON to SVG paths once
at load using a small custom equirectangular projection (with cos-latitude aspect
correction) rather than `d3-geo`; pan/zoom and choropleth scales are likewise hand-rolled
(`src/viz/modes.ts`) to keep the dependency footprint minimal. The result works fully
offline and gives crisp, highlightable, freely-zoomable state borders — the Victoria 3 /
EU-style border highlighting the brief asked for. Geometry is real IBGE data; only the
indicator values are synthetic (see below).

## Data — live API, with synthetic fallback

`src/data/dataset.ts` is the data layer and **the one swap point**. On load it calls the
NestJS API (`VITE_API_URL`, default `http://localhost:3000`), discovers the country/level/
periods from `/countries`, fetches `/countries/:code/regions`, and **adapts the API's
nested-by-theme shape into the flat `StateRecord`** the modes consume (renaming
`pib_per_capita`→`gdp_per_capita`, `gdp_share_*`→`sector_*`, converting GDP to millions,
deriving `dominant_sector`). `BR_DATA.source` is `"live"` or `"synthetic"`.

If the API is unreachable it falls back to `src/data/synthetic.ts` (seeded illustrative
values for 2010/2016/2022) so the UI still runs standalone; `BR_DATA.source` records
whether `"live"` or `"synthetic"` is active (no UI badge).

**Coverage is partial by design.** The IBGE worker feeds Demographics + Economic Profile
today; the other six modes are **greyed out** (`isModeAvailable` in `viz/modes.ts`) until
their source workers (SICONFI/DataSUS/ANEEL/Transparência) land. Missing indicator rows
render "—".

**Geometry stays bundled.** Real borders are deferred (root §10 geometry decision), so the
API serves no geometry; the map keeps rendering `src/data/br-states.geo.ts`. Real,
non-synthetic reference data: `states-meta.ts` (names/capitals/codes/areas) + the geometry.

**Municipality borders (optional layer).** A topbar toggle overlays all 5,570 municipalities,
each filled with its **parent state's** choropleth color (so there is zero color mismatch —
`muni.code.slice(0,2)` → state record → `scale.colorOf`) plus thin borders. The mesh
(`src/data/br-municipalities.geo.ts`, ~2.8MB, real IBGE borders) is **generated** by
`scripts/build-municipalities-geo.mjs` and **lazy-imported** by `src/data/municipalities.ts`
(its own Vite chunk) only when the toggle is first enabled — initial load is unaffected. The
overlay is non-interactive (`pointer-events: none`); hover/selection/tooltips stay at state
level (Phase 1 has no municipality-level data). The `MunicipalityLayer` is `React.memo`'d so
it never re-renders on hover/pan/zoom. To regenerate: `node scripts/build-municipalities-geo.mjs`.

## Layout of `src/`

- `data/` — geometry (states bundled; municipalities lazy-loaded via `municipalities.ts`),
  state metadata, synthetic indicators, shared types.
- `i18n/` — flat dot-keyed EN / PT-BR strings + `makeT` (falls back EN → raw key, never throws).
- `viz/` — `modes.ts` (map-mode defs, palettes, color scales, formatting), `projection.ts` (GeoJSON→SVG).
- `context/` — `VizContext` (t, locale, tweaks) + stats/rank helpers.
- `components/` — `BrazilMap`, `panels` (Legend/Tooltip/Detail/Overview), `controls`
  (top bar + mode switcher), `charts` (RankBar/MiniRange/StackedBar/Sparkline),
  `tweaks/` (panel shell + `useTweaks`).
- `App.tsx` — root state, layout, tooltip positioning, Tweaks wiring.

## Conventions

- **Indicator/theme/mode keys are data, not i18n keys** — translated under the
  `ind.` / `theme.` / `mode.` / `cat.` namespaces. Missing keys fall back to the raw key.
- Add every new user-facing string to **both** `en` and `pt-BR` in `i18n/strings.ts`.
- The mode/scale/palette system in `viz/modes.ts` is the one place choropleth logic
  lives — sequential, diverging (with a meaningful midpoint), and categorical scales.
- **Metric override:** clicking an indicator row in the detail panel recolors the whole map
  by that metric. `App` holds `metricProp`; when set it derives an "effective mode"
  (sequential scale on that prop) passed to the map/legend/tooltip/overview. Clicking the
  active row toggles back to the mode default; switching modes clears it. Rows for indicators
  with no data are non-clickable.
- User prefs (lang, mode, year, tweaks) persist to `localStorage` under `bv.*`.
