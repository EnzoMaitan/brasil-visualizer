# GEMINI.md

Project guide for AI coding assistants and human contributors. Read this file fully
before making any changes. Per-app GEMINI.md files extend this with service-specific
conventions — always read the nearest one first, then this root file for the full picture.

> **Companion documents (read these for depth):**
> - [`README.md`](README.md) — the front door: the idea, the stack, and how to run it.
> - [`docs/visualization-design-reference.md`](docs/visualization-design-reference.md) —
>   the agreed-upon design: map modes, themes, indicators, data model, roadmap.
>   **Treat every decision in that file as already settled.**
> - [`docs/data-sources-reference.md`](docs/data-sources-reference.md) — every external
>   API (IBGE, SICONFI, ANEEL, DataSUS, Portal da Transparência): endpoints, auth, limits.
> - [`docs/agent-teams-reference.md`](docs/agent-teams-reference.md) — how to run Claude
>   Code agent teams on this project.

---

## 1. Project Overview

**What it is:** **Brasil Visualizer** is a portfolio web platform that scrapes Brazilian
public open-data APIs, analyzes the data with pandas, and visualizes it on an interactive
map. Every state (UF) — and later every municipality — is clickable and hoverable,
surfacing demographics, wealth, infrastructure, and public-services indicators.

**The idea — "Paradox map modes":** The UX is modeled on the *map mode* pattern from
Paradox grand-strategy games (Victoria 3, EU4). Each map mode is a discrete choropleth
lens that recolors the whole country around a single question — *"Where is the standard
of living highest?"*, *"Which states are most transfer-dependent?"* The user switches
modes, hovers for a summary, and clicks for a full breakdown. See
[`docs/visualization-design-reference.md`](docs/visualization-design-reference.md) §1.

**Scope (non-negotiable):** Four themes only — **Demographics, Wealth & Economy,
Infrastructure, Public Services**. Political parties, electoral results, and ideological
data are permanently out of scope.

**Current data sources:** IBGE (SIDRA + malhas), Tesouro Nacional (SICONFI), DataSUS,
ANEEL, Portal da Transparência.

**Deployment context:** Portfolio / local-only. Anyone reviewing it runs the whole stack
with `docker compose up --build`. Every decision optimizes for "clone and run," not for
cloud scale or uptime.

**Key qualities to showcase:**
- Polyglot architecture (Python workers + Node/NestJS backend + React frontend).
- Plugin-style workers — country/source logic is fully isolated behind the worker SDK.
- Async processing via a message queue (RabbitMQ topic exchange).
- Time-series-ready data model — adding a new year is an insert, never a migration.
- Geospatial handling (GeoJSON, two zoom levels; later a GeoPandas spatial join).
- Derived analytics computed in pandas (fiscal autonomy ratio, infant mortality, composites).
- Caching strategy (Redis), internationalization (PT-BR / EN), containerization.

---

## 2. Core Principle — The Most Important Rule

> **Source- and country-specific knowledge lives ONLY in the workers.**
> The backend, the database schema, and the frontend stay generic. If you find yourself
> writing `if country === "BR"` (or branching on a specific indicator/source) anywhere
> outside a worker, STOP — that logic belongs in the worker or in the database document.

Corollaries:
- The backend never imports country names, region lists, or indicator definitions. It
  treats `country_code`, `level`, `period`, `theme`, and indicator keys as **opaque data**.
- The frontend discovers available countries, levels, themes, and indicators from the API
  at runtime — nothing is hardcoded in components.
- Brazil is the only country today, but the seams are real: a new country is a new worker.

**What is generic vs. what is data:** `level` (`"UF"` / `"municipio"`), `period`
(`"2022"`), `theme` (`"demographics"`), and indicator keys are all just **strings the
backend stores and the frontend renders**. They describe Brazil concretely, but no service
branches on their values. That is what keeps the platform country-agnostic in mechanism
while being Brazil-specific in content.

---

## 3. Architecture

```
Python Worker (Brazil) ─┐
  IBGE / SICONFI / ANEEL │   topic exchange: geodata
  DataSUS / Transparência │   routing keys:
                          ├─► RabbitMQ ──► NestJS ──► MongoDB (geometries + snapshots)
(future) Worker (XX) ─────┘   country.{CODE}.geometry      │          + countries registry
                              country.{CODE}.region        ├──► Redis (read-through cache)
                                                           └──► Vite + React + inline SVG
                                                                map modes · two zoom levels
```

**Data flow:**
1. A **Python worker** fetches data from public APIs, cleans/analyzes it with pandas,
   computes derived metrics, and publishes two kinds of messages to RabbitMQ:
   - **geometry messages** (`country.{CODE}.geometry`) — one per region per level, the
     GeoJSON polygon. Published rarely; polygons almost never change.
   - **indicator messages** (`country.{CODE}.region`) — one per region **per theme per
     period**, carrying just that theme's indicator block. Small, idempotent, upsertable.
2. **NestJS** consumes everything via a wildcard subscription (`country.#`). Geometry
   messages upsert the `geometries` collection; indicator messages upsert a theme block
   into the matching `snapshots` document and refresh the `countries` registry. It
   invalidates/updates the **Redis** cache on write.
3. **Frontend (Vite + React + inline SVG)** calls `/countries` on load, then fetches
   geometry (cached hard) and the latest snapshot per level, joins them by `code`, projects
   the GeoJSON with `d3-geo`, and renders the active **map mode** as an SVG choropleth.

---

## 4. Folder Structure

```
brasil-visualizer/
  apps/
    frontend/                  # Vite + React + inline SVG   (planned)
      src/locales/{en,pt-BR}/translation.json
    backend/                   # NestJS                    (planned)
      src/i18n/{en,pt-BR}/messages.json
    workers/
      GEMINI.md                # per-app worker guide
      _template/               # copy this to add a country/source   (done)
        main.py · requirements.txt · Dockerfile · README.md
      brazil/                  # IBGE/SICONFI/DataSUS/ANEEL/Transparência   (planned)
  packages/
    worker-sdk/                # Python base classes — imported by every worker (done)
      worker_sdk/{__init__,base_worker,models}.py
      pyproject.toml
    contracts/                 # language-neutral JSON schemas for queue messages (done)
      geometry.schema.json · region.schema.json · country-registry.schema.json
    shared-types/              # TypeScript types (frontend + backend)   (planned)
  infra/
    rabbitmq/rabbitmq.conf     # lifts guest loopback restriction for local stack (done)
  docs/                        # deep reference docs (see top of this file)
  docker-compose.yml           # core stack: mongo + redis + rabbitmq    (done)
  docker-compose.brazil.yml    # extends base, adds brazil worker        (planned)
  package.json                 # pnpm workspace root                     (planned)
  CLAUDE.md · GEMINI.md        # this guide (twin files, kept in sync)
  README.md                    # main documentation page
```

> Status tags reflect the current base. The foundation (worker SDK, contracts, core
> compose, docs) exists; the three services (brazil worker, backend, frontend) do not yet.

---

## 5. Tech Stack

### Frontend
| Tech | Role |
|---|---|
| Vite + React | App bundler and UI framework |
| Inline SVG (no map library) | The map is an `<svg>` of `<path>` regions — drives map modes, hover, click |
| d3-geo | Projects GeoJSON (lng/lat) into SVG path data (`geoMercator` + `geoPath`) |
| d3-scale + d3-scale-chromatic | Choropleth color scales (sequential / diverging) + legend |
| d3-zoom | Pan & zoom over the SVG via a `<g>` transform — no tile basemap |
| react-i18next | PT-BR / EN language switching (extensible) |
| axios + TanStack Query | Calls the NestJS API, caches client-side |

**Map rules:**
- Never hardcode GeoJSON. Load it from `/countries/:code/geometries?level=…`.
- Never hardcode indicator or map-mode names. Read them from `/countries/:code/themes`.
- If an indicator/mode has no i18n key, fall back to the raw key name — never crash.
- The map is **inline SVG only** — render regions as `<path>` elements projected with
  `d3-geo`. No tile-based map library (Leaflet, Mapbox), no Google Maps, no external
  basemap tiles, no API key. The choropleth polygons are the map; the background is plain.

### Backend
| Tech | Role |
|---|---|
| NestJS | REST API, queue consumer, business logic |
| @nestjs/mongoose | MongoDB integration |
| @nestjs/cache-manager + ioredis | Redis caching |
| @golevelup/nestjs-rabbitmq | RabbitMQ wildcard consumer |
| nestjs-i18n | Translated error messages / API responses |

### Workers (Python)
| Tech | Role |
|---|---|
| Python 3.12 | Scraping, cleaning, analysis |
| worker-sdk | Internal base package (see `packages/worker-sdk`) |
| httpx / requests | HTTP calls to public APIs |
| pandas | Data cleaning, aggregation, derived metrics |
| pysus | DataSUS access (DBC format) |
| geopandas | Phase 3 — spatial join of ANEEL plants to municipality polygons |
| pika | RabbitMQ publisher |

### Data & Infra
| Tech | Role |
|---|---|
| MongoDB | `geometries` (static) + `snapshots` (time-series) + `countries` registry |
| Redis | Read-through cache for API responses; default TTL 3600s (ANEEL 86400s) |
| RabbitMQ | Topic exchange `geodata`; keys `country.{CODE}.geometry` / `.region` |
| Docker Compose | Runs the full stack locally |

---

## 6. Worker SDK

Every worker inherits from `BaseWorker` in `packages/worker-sdk`. The SDK owns the
RabbitMQ connection, serialization, retry, and publishing. A worker implements `fetch()`.

```python
# A worker is just fetch() — all source-specific logic lives here and nowhere else.
class BrazilWorker(BaseWorker):
    COUNTRY_CODE = "BR"

    def fetch(self) -> list[RegionData]:
        # 1. pull geometry (IBGE malhas) for each level
        # 2. pull indicators (SIDRA, SICONFI, DataSUS, ANEEL, Transparência)
        # 3. compute derived metrics in pandas
        # 4. return RegionData objects; the SDK publishes geometry + per-theme messages
        ...

BrazilWorker(rabbitmq_url=os.getenv("RABBITMQ_URL")).run()
```

### Message model (evolved — time-series + themes + levels)

Workers emit two message shapes. Both are keyed by `country_code + level + code`.

**Geometry message** → routing key `country.{CODE}.geometry` → `geometries` collection:
```json
{
  "country_code": "BR",
  "level": "UF",
  "code": "35",
  "parent_code": null,
  "name": "São Paulo",
  "abbrev": "SP",
  "geometry": { "type": "MultiPolygon", "coordinates": [] }
}
```

**Indicator message** (one per region **per theme per period**) → routing key
`country.{CODE}.region` → upserts a theme block into the `snapshots` document:
```json
{
  "country_code": "BR",
  "level": "UF",
  "code": "35",
  "parent_code": null,
  "period": "2022",
  "theme": "demographics",
  "source": "IBGE",
  "fetched_at": "2024-01-15T12:00:00Z",
  "indicators": {
    "population":      { "value": 44400000, "unit": "people",      "year": 2022, "source": "IBGE Census 2022" },
    "population_density": { "value": 178.0, "unit": "people/km2",  "year": 2022, "source": "IBGE" },
    "literacy_rate":   { "value": 97.3,     "unit": "%",           "year": 2022, "source": "IBGE" }
  }
}
```

**IndicatorValue** = `{ value: float, unit: str, year: int, source: str }`.

Why per-theme messages: they stay small, let the backend upsert one theme without
rewriting the whole snapshot, and let slow sources (SICONFI at 1 req/s) publish
independently of fast ones.

> **Implementation status:** The SDK (`packages/worker-sdk/worker_sdk/models.py`,
> `base_worker.py`) and the contracts (`packages/contracts/geometry.schema.json`,
> `region.schema.json`, `country-registry.schema.json`) implement exactly this model.
> `RegionData.geometry_message()` and `.indicator_messages()` produce the two message
> shapes; `add_indicator(theme, key, …)` enforces the four-theme grouping.

---

## 7. MongoDB Schema

Three collections. Geometry is split from indicator data so large polygons are never
duplicated across periods, and `period` is first-class so new years are inserts.

### `geometries` — static, rarely changes
```json
{
  "country_code": "BR", "level": "UF", "code": "35",
  "parent_code": null, "name": "São Paulo", "abbrev": "SP",
  "geometry": { "type": "MultiPolygon", "coordinates": [] }
}
```
Index: `{ country_code: 1, level: 1, code: 1 }` (unique).
For municipalities, `level: "municipio"` and `parent_code` holds the UF code (e.g. `"35"`).

### `snapshots` — grows over time (one doc per region per period)
```json
{
  "country_code": "BR", "level": "UF", "code": "35",
  "parent_code": null, "period": "2022", "fetched_at": "2024-01-15T00:00:00Z",
  "indicators": {
    "demographics":    { "population": { "value": 44400000, "unit": "people", "year": 2022 } },
    "wealth":          { },
    "infrastructure":  { },
    "public_services": { }
  }
}
```
Indexes: `{ country_code: 1, level: 1, code: 1, period: 1 }` (unique);
`{ country_code: 1, level: 1, period: 1 }` (map-wide queries).
The backend upserts each arriving theme into `indicators.<theme>` — never overwrites the
whole document.

### `countries` — registry (one doc per country)
```json
{
  "country_code": "BR",
  "country_name": "Brasil",
  "levels": ["UF", "municipio"],
  "themes": ["demographics", "wealth", "infrastructure", "public_services"],
  "available_indicators": { "demographics": ["population", "literacy_rate"], "...": [] },
  "periods": ["2022"],
  "workers": ["ibge", "siconfi", "datasus", "aneel", "transparencia"],
  "last_scraped": "2024-01-15T00:00:00Z"
}
```
The backend upserts this whenever a message arrives. The frontend reads it to know which
levels, themes, indicators, and periods exist — no frontend hardcoding.

**Important:** Store raw source data under the original PT-BR field names. Translate only
UI labels on the frontend via i18n keys. `period` is always a **string** — never a Date.

---

## 8. RabbitMQ — Topic Exchange

Exchange `geodata`, type `topic`. Two routing-key suffixes per country:

```
country.BR.geometry   <- region polygons        -> geometries collection
country.BR.region     <- per-theme indicators    -> snapshots collection
country.US.region     <- future USA worker
```

NestJS subscribes to `country.#` to receive everything in one consumer and routes by the
suffix. Country-specific consumers (`country.BR.#`) remain possible without schema change.

---

## 9. NestJS API — Country-Agnostic, Level- & Period-Aware

```
GET /countries                                              # registry list
GET /countries/:code                                        # levels, themes, indicators, periods
GET /countries/:code/themes                                 # themes + indicators + per-level availability
GET /countries/:code/geometries?level=UF                    # GeoJSON FeatureCollection for a level
GET /countries/:code/periods?level=UF                       # available periods (powers the year slider)
GET /countries/:code/regions?level=UF&period=latest         # all regions' indicators at a level
GET /countries/:code/regions/:region?level=UF&period=latest # single region snapshot
GET /countries/:code/regions/:region/children?level=municipio&period=latest  # children of a region
```

`:code`, `level`, and `period` drive everything; `period=latest` resolves to the newest
stored period. No path, controller, or service contains a country name or hardcoded
region list. The frontend joins `/geometries` (cached hard) with `/regions` by `code`.

> **Mapping to the design reference:** `docs/visualization-design-reference.md` §2 sketches
> friendly routes like `/states` and `/states/:uf/municipalities`. Those map onto the
> generic routes above (`/regions?level=UF` and `/regions/:uf/children?level=municipio`).
> The generic form is canonical here to preserve §2; the design doc's names are the
> human-facing concepts the frontend presents.

---

## 10. Frontend — Dynamic Map & Map Modes

```tsx
const { data: country }   = useQuery('/countries/BR');                       // levels, themes
const { data: geometries } = useQuery('/countries/BR/geometries?level=UF');  // cached hard
const { data: regions }    = useQuery('/countries/BR/regions?level=UF&period=latest');

// Project once (fit the GeoJSON to the viewport), then render each region as an SVG
// <path>, joined to its indicators by `code` and colored by the active map mode.
const projection = geoMercator().fitSize([width, height], geometries);
const path = geoPath(projection);

<svg viewBox={`0 0 ${width} ${height}`}>
  <g>{/* d3-zoom transform target */}
    {geometries.features.map((f) => (
      <path
        key={f.properties.code}
        d={path(f)}
        fill={colorScale(regions[f.properties.code], activeMode)}
        onMouseOver={showTooltip}
        onMouseOut={reset}
        onClick={openSidebar}
      />
    ))}
  </g>
</svg>
```

**Map-mode UX** (full spec: design reference §5–§7):
- A **mode switcher** (one active mode at a time) recolors the whole map per theme/metric.
- **Hover** → tooltip with the region name + 1–2 key metrics for the active mode.
- **Click a state** → zoom in, load municipality geometry + `level=municipio` data, open
  the sidebar breakdown. **Click background / back** → return to the UF view.
- Modes unavailable at the current level (e.g. *Fiscal Health* at municipality level) are
  greyed out with a "state-level only" label — driven by the per-level availability from
  `/themes`, never hardcoded.
- **Color scales:** sequential for totals/ranks; diverging for ratios with a meaningful
  midpoint (growth rate, fiscal balance). Legend always visible, updates with the mode.

i18n keys for indicators and modes fall back to the raw key if a translation is missing.

---

## 11. i18n

Supported languages: **PT-BR (default/fallback)** and **EN**. Extensible to others.

| Layer | Tool | Detected via |
|---|---|---|
| React | react-i18next | Browser language + manual toggle |
| NestJS | nestjs-i18n | `Accept-Language` / `x-lang` header |
| Python worker | env var dict | `WORKER_LANG` env var (logs only) |

Rules:
- Add every new user-facing string to BOTH `en` and `pt-BR` files simultaneously.
- Never hard-code display text in React components.
- Indicator keys (`"population"`), theme keys (`"demographics"`), and map-mode keys are
  **data, not i18n keys** — translate them under the `indicators` / `themes` / `modes`
  namespaces. Raw source field names (IBGE PT-BR names) are never exposed in the UI.
- If a translation key is missing, fall back silently — never throw or show a raw key path.

---

## 12. Docker Compose Strategy

```bash
# Core stack only: mongo + redis + rabbitmq (runnable today)
docker compose up --build

# Full stack + Brazil worker (once the worker exists)
docker compose -f docker-compose.yml -f docker-compose.brazil.yml up --build
```

The core `docker-compose.yml` currently brings up the three infrastructure services with
healthchecks; `backend` and `frontend` service blocks are present but commented until
those apps are scaffolded. RabbitMQ mounts `infra/rabbitmq/rabbitmq.conf` so the default
`guest` user works across the Compose network.

Local ports:
| Service | Port |
|---|---|
| Frontend | 5173 |
| Backend | 3000 |
| MongoDB | 27017 |
| Redis | 6379 |
| RabbitMQ AMQP | 5672 |
| RabbitMQ UI | 15672 |

Backend env vars:
```
MONGO_URL=mongodb://mongo:27017/geodata
REDIS_URL=redis://redis:6379
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672/
```

Worker env vars:
```
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672/
WORKER_LANG=pt-BR                 # or en, for log language
TRANSPARENCIA_API_KEY=...         # Portal da Transparência token (Brazil worker only)
```

---

## 13. Adding a New Country & Indicator Vocabulary

### Steps
1. Copy `apps/workers/_template/` to `apps/workers/{country_name}/`.
2. Set `COUNTRY_CODE` (ISO 3166-1 alpha-2) and the level names for that country.
3. Implement `fetch()` — call public APIs, compute derived metrics, return `RegionData`.
4. Map source fields to the theme/indicator vocabulary below.
5. Add `docker-compose.{country}.yml` following the Brazil example.
6. Add i18n translations for any new indicator/theme keys in `en` and `pt-BR`.
7. Update `README.md` to list the new country and its data sources.

**No changes needed in:** backend, frontend, MongoDB schema, RabbitMQ config, Redis.

### Themes & indicator vocabulary

Indicators are grouped under four **themes**. Use consistent snake_case keys. This is the
canonical summary; full per-level (N3/N6) availability, SIDRA table IDs, and derived-metric
formulas live in [`docs/visualization-design-reference.md`](docs/visualization-design-reference.md) §4.

| Theme | Example indicator keys |
|---|---|
| `demographics` | `population`, `population_density`, `age_structure`, `urbanization_rate`, `literacy_rate`, `birth_rate`, `death_rate` |
| `wealth` | `gdp_total`, `gdp_by_sector`, `household_income_avg`, `gini_coefficient`, `employment_by_sector`, `companies_by_sector`, `bolsa_familia_coverage`, `fiscal_autonomy_ratio`, `public_debt_per_capita` |
| `infrastructure` | `hospital_beds_per_100k`, `physicians_per_100k`, `energy_capacity_mw`, `energy_mix_hydro`, `energy_mix_solar`, `energy_mix_wind`, `energy_mix_thermal` |
| `public_services` | `infant_mortality_rate`, `vaccination_coverage`, `social_program_beneficiaries`, `public_social_spending`, `federal_servants_density` |

**Derived metrics** (computed in the worker's pandas pipeline, published pre-computed —
the backend never re-derives): `fiscal_autonomy_ratio` (own revenue ÷ total revenue),
`infant_mortality_rate` (deaths <1yr ÷ live births × 1000, joining SIM + SINASC),
`pib_per_capita`, plus the standard-of-living composite. Add new keys here when a worker
has genuinely new data.

---

## 14. Brazil Worker — Data Sources

Full endpoints, parameters, auth, and rate limits:
[`docs/data-sources-reference.md`](docs/data-sources-reference.md). Quick map:

| Source | Auth | Rate limit | Provides | Level |
|---|---|---|---|---|
| **IBGE** SIDRA + malhas | none | none (be respectful) | demographics, GDP, income, Gini, employment, geometry | N3 + N6 |
| **SICONFI** (Tesouro) | none | **1 req/sec — strict** | budget, transfers, debt, fiscal autonomy | UF only |
| **DataSUS** (pysus) | none | none | hospital beds, physicians, infant mortality, vaccination | N3 + N6 |
| **ANEEL** SIGA | none | none (CSV download) | energy capacity + mix | UF now; N6 = Phase 3 spatial join |
| **Portal da Transparência** | **Gov.br token** | be careful | Bolsa Família, federal servants | native municipality |

IBGE geometry endpoints:
```
# State (UF / N3) boundaries
GET /malhas/paises/BR?resolucao=UF&formato=application/vnd.geo+json
# Municipality (N6) boundaries within a state
GET /malhas/estados/{UF}?resolucao=5&formato=application/vnd.geo+json
```

> ⚠️ SIDRA table IDs drift over time. Always verify a table ID against
> `GET /agregados/{table}/metadados` before wiring an indicator. Never trust a table ID
> from memory or training data.

---

## 15. Conventions for AI Assistants

**Always do:**
- Read the nearest `GEMINI.md` (per-app), then this root file, then the relevant `docs/`.
- Treat `docs/visualization-design-reference.md` decisions as settled.
- Keep the backend and frontend country-agnostic — `level`, `period`, `theme`, and
  indicator keys are opaque data they store and render, never branch on.
- Group indicators by the four themes; use the snake_case vocabulary in §13.
- Compute derived metrics in the worker (pandas); publish them pre-computed.
- Keep `period` a string and split geometry from indicator data.
- Add i18n keys for both `en` and `pt-BR` at the same time.
- Verify SIDRA table IDs against the live IBGE API — never trust them from memory.
- Throttle SICONFI to ≤1 req/sec; paginate Portal da Transparência until empty.
- Keep API keys/tokens in env vars; read Redis before MongoDB on read paths.

**Never do:**
- Write `if country === "BR"` (or branch on a level/theme/indicator value) outside a worker.
- Hardcode a list of states, municipalities, indicators, or map modes in backend/frontend.
- Add political-party, electoral, or ideological data — permanently out of scope.
- Overwrite a whole snapshot document — upsert one theme block at a time.
- Duplicate polygons per period — geometry lives in its own collection.
- Pull in a tile-based map library (Leaflet, Mapbox) or Google Maps — the map is inline
  SVG choropleth only, with no external basemap tiles.
- Add cloud infra, auth providers, or deployment config unless explicitly asked.

---

## 16. Map Modes

Each map mode is one choropleth lens (design reference §5 has the full table + UI rules):

| Mode | Primary source | Choropleth variable | Level |
|---|---|---|---|
| Demographics (default) | IBGE SIDRA | population density | N3 + N6 |
| Standard of Living | IBGE + DataSUS | composite index | N3 + N6 |
| Economic Profile | IBGE SIDRA 5938 | dominant sector % | N3 (N6 to verify) |
| Workforce Structure | IBGE SIDRA 6461 | sector employment % | N3 + N6 |
| Fiscal Health | SICONFI RREO + RGF | fiscal autonomy ratio | UF only |
| Energy Matrix | ANEEL SIGA | capacity MW / mix % | UF now; N6 Phase 3 |
| Public Health | DataSUS | infant mortality rate | N3 + N6 |
| Social Coverage | Transparência + IBGE | Bolsa Família % | N3 + N6 |

Per-level availability is served by `/countries/:code/themes` and drives which modes are
enabled at the current zoom — never hardcoded.

---

## 17. Implementation Roadmap

- **Phase 1 — UF level, all 4 themes.** The portfolio deliverable. Highest-impact,
  most-available indicators: population, literacy, average income, GDP by sector, hospital
  beds, energy mix, infant mortality. Map-mode switching + sidebar working end to end.
- **Phase 2 — Municipality (N6) level** for Demographics, Wealth, Public Services. Same
  schema and zoom interaction; mainly a second scraping pass and the children endpoint.
- **Phase 3 — Municipality Infrastructure (ANEEL).** GeoPandas spatial join of plant
  coordinates against IBGE municipality polygons — the most technically interesting piece.

Build order for the base: **Brazil worker (Phase 1 `fetch()`) → backend consumer + API →
frontend map.** Throttling and retry must be built into the worker from the start, not
bolted on — a full N6 pass touches ~5,570 municipalities.
