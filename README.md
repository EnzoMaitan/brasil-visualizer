# 🇧🇷 Brasil Visualizer

**An interactive, game-inspired map of Brazil's open public data.**

Brasil Visualizer scrapes Brazil's public open-data APIs, analyzes them with pandas, and
paints the results onto an interactive map — where every state (and later every
municipality) can be explored through swappable **map modes**, the way you'd explore a
country in a Paradox grand-strategy game.

> Portfolio project. Local-only — clone it and run the whole stack with one command.

---

## The idea — "Paradox map modes" for real data

If you've played **Victoria 3** or **Europa Universalis**, you know the *map mode* button:
one click recolors the entire world to answer a single question — *where is population
densest? where is the standard of living highest? who's industrializing?*

Brasil Visualizer brings that interaction to **real Brazilian open data**. Each map mode is
a choropleth lens over one theme. You switch modes, hover a state for a quick summary, and
click to open a full breakdown — then zoom into a state to see the same lenses at the
municipality level.

The data is real, the analysis is honest, and the framing makes dry government statistics
genuinely fun to explore.

### Four themes (politics deliberately excluded)

| Theme | The question it answers | Headline metric | Sources |
|---|---|---|---|
| 🧑‍🤝‍🧑 **Demographics** | Who lives where? | Population density | IBGE SIDRA |
| 💰 **Wealth & Economy** | Where is the money — and who's dependent? | Fiscal autonomy ratio | IBGE · SICONFI · Transparência |
| 🏗️ **Infrastructure** | What's built and powered? | Energy mix / hospital beds | DataSUS · ANEEL |
| 🏥 **Public Services** | Are services actually working? | Infant mortality rate | DataSUS · IBGE · Transparência |

The standout derived metric is the **fiscal autonomy ratio** (own revenue ÷ total
revenue): some northern states are ~85% dependent on federal transfers — surprising at a
glance, and a showcase of the worker's analytical pipeline.

### Two zoom levels

| Zoom | View | IBGE level | Count |
|---|---|---|---|
| Default | All states | `N3` (UF) | 27 |
| Click a state | Its municipalities | `N6` | ~5,570 |

The data model treats **`period` (year) as a first-class key**, so adding a new year of
data is an insert — never a migration. A year slider is a later UI addition over data
that's already shaped for it.

---

## Architecture

A polyglot, message-driven pipeline. Country- and source-specific logic is fully isolated
inside Python workers; the backend and frontend are generic.

```
Python Worker (Brazil) ─┐
  IBGE · SICONFI · ANEEL │   RabbitMQ topic exchange "geodata"
  DataSUS · Transparência ├─► country.{CODE}.geometry ─► NestJS ─► MongoDB  ┐
                          │   country.{CODE}.region              geometries  │
(future) Worker (XX) ─────┘                                      snapshots ──┼─► Redis cache
                                                                 countries   │
                                                                             └─► Vite + React
                                                                                 + inline SVG
```

1. **Workers (Python + pandas)** fetch, clean, and analyze data, compute derived metrics,
   and publish small per-theme messages to RabbitMQ. Geometry is published separately from
   indicators so polygons are never duplicated across years.
2. **Backend (NestJS)** consumes everything via one wildcard subscription, upserts into
   MongoDB (one theme block at a time), keeps a country registry current, and caches reads
   in Redis.
3. **Frontend (React + inline SVG)** joins geometry with indicator data by `code`, projects
   the GeoJSON to SVG paths with a small custom equirectangular projection, and renders the
   active map mode as an SVG choropleth. *(Built — Phase 1 UI; today it runs on bundled
   synthetic data and will discover levels/themes/indicators from the API once the backend
   exists.)*

**Why it's built this way (the portfolio angle):** polyglot services, async messaging,
a plugin architecture (a new country = a new worker, nothing else), time-series-ready
schema design, geospatial handling, derived analytics, caching, i18n, and one-command
containerization.

---

## Tech stack

| Layer | Tech |
|---|---|
| **Frontend** | Vite · React · TypeScript · inline SVG · custom equirectangular projection · custom oklch color scales · pointer-based zoom/pan · custom i18n *(d3 / TanStack Query optional later)* |
| **Backend** | NestJS · Mongoose · cache-manager + ioredis · RabbitMQ consumer · nestjs-i18n |
| **Workers** | Python 3.12 · pandas · httpx/requests · pysus · geopandas (Phase 3) · pika |
| **Data & infra** | MongoDB · Redis · RabbitMQ · Docker Compose |

No paid APIs, no map provider, no basemap tiles, no cloud dependencies — the map is plain
inline SVG built from IBGE GeoJSON, and every data source is free (one source needs a free
Gov.br token).

---

## Quick start

```bash
# The map UI (runnable today — no backend needed, data is bundled synthetic)
cd apps/frontend && npm install && npm run dev   # → http://localhost:5173

# Core stack: MongoDB + Redis + RabbitMQ (runnable today)
docker compose up --build
```

| Service | URL / Port |
|---|---|
| Frontend | http://localhost:5173 *(runnable now — `npm run dev` in `apps/frontend`)* |
| Backend API | http://localhost:3000 *(once built)* |
| RabbitMQ management UI | http://localhost:15672 (guest / guest) |
| MongoDB | `localhost:27017` |
| Redis | `localhost:6379` |

```bash
# Full stack + Brazil worker (once docker-compose.brazil.yml is added; the worker itself
# already runs standalone — see apps/workers/brazil/README.md)
docker compose -f docker-compose.yml -f docker-compose.brazil.yml up --build
```

> The `backend` and `frontend` service blocks live in `docker-compose.yml`, commented out
> until those apps are scaffolded — so `up --build` works for the infrastructure today.

---

## Project structure

```
brasil-visualizer/
  apps/
    frontend/          Vite + React + TS + inline SVG     ✓ (Phase 1 UI; live API + synthetic fallback)
    backend/           NestJS read API over MongoDB      ◑ read API done; queue consumer + Redis planned
    workers/
      _template/       copy-me scaffold for a new source  ✓
      brazil/          Brazil worker (UF)                 ◑ IBGE + ANEEL + SICONFI done;
                                                            DataSUS/Transparência blocked (worker README)
  packages/
    worker-sdk/        Python BaseWorker + models         ✓
    contracts/         JSON schemas for queue messages    ✓
    shared-types/      TypeScript types (FE + BE)         (planned)
  infra/
    rabbitmq/          local RabbitMQ config              ✓
  docs/                deep reference documentation       ✓
  docker-compose.yml   core stack (mongo/redis/rabbitmq)  ✓
  CLAUDE.md · GEMINI.md  AI/contributor project guides    ✓
```

---

## Documentation

This README is the front door. Deeper, topic-specific docs live in [`docs/`](docs/):

| Document | What's in it |
|---|---|
| [CLAUDE.md](CLAUDE.md) / [GEMINI.md](GEMINI.md) | Full project guide for contributors and AI assistants — architecture, schema, conventions, roadmap. Twin files kept in sync. |
| [docs/visualization-design-reference.md](docs/visualization-design-reference.md) | The agreed design: map modes, the four themes, every indicator, the data model, and the phased plan. |
| [docs/data-sources-reference.md](docs/data-sources-reference.md) | Every external API — endpoints, parameters, auth, and rate limits (IBGE, SICONFI, ANEEL, DataSUS, Portal da Transparência). |
| [docs/agent-teams-reference.md](docs/agent-teams-reference.md) | How to run Claude Code agent teams against this repo. |
| [apps/workers/CLAUDE.md](apps/workers/CLAUDE.md) | Worker-specific conventions and how to add a new country/source. |
| [apps/frontend/CLAUDE.md](apps/frontend/CLAUDE.md) · [README](apps/frontend/README.md) | Frontend conventions, layout, the synthetic-data swap point, and how to run it. |

---

## Data sources

All free; all official Brazilian government open data.

| Source | Data | Auth |
|---|---|---|
| **IBGE** (SIDRA + malhas) | Demographics, GDP, income, Gini, employment, map geometry | None |
| **SICONFI** (Tesouro Nacional) | State budgets, transfers, public debt | None (1 req/s limit) |
| **DataSUS** | Hospital beds, physicians, mortality, vaccination | None |
| **ANEEL** | Power generation capacity & energy mix | None |
| **Portal da Transparência** | Bolsa Família, federal public servants | Free Gov.br token |

---

## Roadmap

- **Phase 1 — States (UF), all four themes.** The portfolio deliverable: map-mode
  switching and the detail sidebar working end to end over the highest-impact indicators.
- **Phase 2 — Municipalities** for Demographics, Wealth, and Public Services. Same schema
  and zoom interaction; a second scraping pass at the `N6` level.
- **Phase 3 — Municipal Infrastructure.** A GeoPandas spatial join assigning ANEEL power
  plants to municipality polygons — the most technically interesting piece.

---

## Project status

🚧 **Foundation + frontend + first worker.** In place: the Python worker SDK, the
language-neutral message contracts, the core Docker Compose stack, the full design/data-source
documentation, and the **Phase 1 frontend** — the full map UI (all 8 modes, hover tooltip,
click→detail sidebar with mini-charts, state search, year slider, EN⇄PT-BR, free zoom/pan,
Tweaks panel), running on clearly-labeled **synthetic** data over real IBGE geometry.

The **Brazil worker** is implemented (`apps/workers/brazil`): live **IBGE** (demographics,
wealth, public services), **ANEEL** (energy), and **SICONFI** (fiscal) across all 27 UFs,
with derived metrics in pandas, a contract-valid snapshot, and a MongoDB loader.

The **NestJS backend** (`apps/backend`) is a first-iteration country-agnostic read API over
the `geodata` MongoDB (`/countries`, `/countries/:code/regions`, `/themes`, …), in Docker.

The **frontend** is wired to that live API: **Demographics, Economic Profile, Fiscal Health,
and Energy Matrix** render real data; the remaining modes are greyed until their workers
land. Not yet built: **DataSUS** (health) and **Portal da Transparência** (social) — both
externally blocked (pysus 2.x is an impractical async rewrite; Transparência needs a Gov.br
token); the municipality level; and the backend's RabbitMQ consumer + Redis cache (data is
loaded via the worker's `seed_mongo.py` for now). Real map geometry is **deferred** (see the
geometry decision in the design reference). See the roadmap above and [CLAUDE.md](CLAUDE.md).

---

## License & credits

A personal portfolio project. Government data belongs to its respective Brazilian agencies
(IBGE, Tesouro Nacional, DataSUS, ANEEL, CGU/Portal da Transparência) and is used under
their open-data terms — attribution required per Brazilian open-data legislation
(Decreto nº 8.777/2016). Map boundaries are IBGE malhas GeoJSON, rendered as inline SVG.
