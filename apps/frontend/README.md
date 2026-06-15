# Brasil Visualizer — Frontend

Interactive, Paradox-game-style choropleth of Brazil's 27 states. Built with
**Vite + React + TypeScript**, ported from the Claude Design prototype.

## Quick start

```bash
npm install
npm run dev      # → http://localhost:5173
```

## Features

- **Custom SVG map** of Brazil's 27 UFs from real IBGE borders — fully offline, no tiles.
- **8 map modes** across 4 themes (Demographics, Wealth & Economy, Infrastructure,
  Public Services) with sequential, diverging, and categorical color scales.
- **Hover tooltip**, **click → detail sidebar** (headline + national rank, breakdown
  bars, indicator ranges, year-trend sparkline), **state search**, **live legend**,
  and a **year slider** (2010 / 2016 / 2022).
- **EN ⇄ PT-BR** toggle across the whole UI.
- **Free zoom & pan** — mouse-wheel zooms toward the cursor, drag to pan, on-map +/−/⟲.
- **Tweaks panel** (gear button): border thickness, hover glow, color palette,
  light/dark, label density.

## Data

All numeric values are **clearly-labeled synthetic placeholders** (the "Illustrative
data" badge flags this) — seeded and region-biased so the map reads true to Brazil's
geography. The geometry is genuine IBGE data. To wire real data, replace `BR_DATA` in
[`src/data/synthetic.ts`](src/data/synthetic.ts) with a feed from the NestJS API.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Type-check then production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
