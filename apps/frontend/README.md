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

The app calls the **live NestJS API** ([`src/data/dataset.ts`](src/data/dataset.ts)):
it discovers the country/level/periods from `/countries`, fetches `/regions`, and adapts
the nested-by-theme payload into the flat record the map modes use. Set `VITE_API_URL` to
point at the backend (default `http://localhost:3000`). The top-bar badge shows **"Live ·
IBGE"** when connected.

If the API is unreachable it falls back to the bundled **synthetic** data
([`src/data/synthetic.ts`](src/data/synthetic.ts)) so the UI still runs standalone — the
badge flips to "Illustrative data". Today the IBGE worker feeds **Demographics** and
**Economic Profile**; the other modes are greyed until their source workers land. Map
geometry is the bundled IBGE outline (real borders deferred).

To see live data: run the backend (`apps/backend`, needs the seeded `mongo` container),
then `npm run dev`.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Type-check then production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
