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

## Data is synthetic placeholder — swap point is isolated

`src/data/synthetic.ts` generates seeded, region-biased illustrative values for all
27 states across 2010/2016/2022. **No real API is wired up** — the "Illustrative data"
badge in the top bar says so. When the NestJS `/countries` pipeline lands, replace the
`BR_DATA` export in that one module with a live feed; everything else stays as-is.

Real, non-synthetic data: `src/data/states-meta.ts` (names, capitals, IBGE codes,
areas) and `src/data/br-states.geo.ts` (IBGE borders).

## Layout of `src/`

- `data/` — geometry, state metadata, synthetic indicators, shared types.
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
- User prefs (lang, mode, year, tweaks) persist to `localStorage` under `bv.*`.
