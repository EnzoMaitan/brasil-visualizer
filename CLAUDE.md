# CLAUDE.md

Project guide for AI coding assistants and human contributors. Read this file fully
before making any changes. Per-app CLAUDE.md files extend this with service-specific
conventions — always read the nearest one first, then this root file for the full picture.

---

## 1. Project Overview

**What it is:** A portfolio web platform that scrapes public open-data APIs for any
country, analyzes the data, and visualizes it on an interactive map. Each country's
administrative regions (states, provinces, departments, etc.) are clickable and hoverable,
surfacing demographic, economic, financial, health, and energy indicators.

**Current countries implemented:** Brazil (IBGE, Tesouro Nacional, DataSUS, ANEEL).

**Deployment context:** Portfolio / local-only. Anyone reviewing it runs the whole stack
with `docker compose up --build`. Every decision should optimize for "clone and run,"
not for cloud scale or uptime.

**Key qualities to showcase:**
- Polyglot architecture (Python workers + Node/NestJS backend).
- Plugin-style country workers — adding a country means adding a worker, nothing else.
- Async processing via a message queue.
- Caching strategy (Redis).
- Geospatial data handling (GeoJSON).
- Internationalization (PT-BR / EN, extensible).
- Containerization (Docker Compose).

---

## 2. Core Principle — The Most Important Rule

> **Country-specific knowledge lives ONLY in the workers.**
> The backend, the database schema, and the frontend must contain ZERO country-specific
> logic. If you find yourself writing `if country === "BR"` anywhere outside a worker,
> STOP — that logic belongs in the worker or in the database document.

Corollaries:
- The backend never imports country names, region lists, or indicator definitions.
- The frontend discovers available countries and indicators from the API at runtime.
- A new country is supported by writing a new worker only. No other service changes.

---

## 3. Architecture

```
Python Worker (BR) \
Python Worker (US)  -> RabbitMQ (topic exchange) -> NestJS -> MongoDB / Redis -> Vite + React
Python Worker (XX) /    routing: country.{CODE}.region          |                    |
                                                          country-agnostic      Leaflet.js
                                                          REST API              dynamic map
```

**Data flow:**
1. A **Python worker** fetches data from country-specific public APIs, cleans and
   analyzes it with pandas, and publishes `RegionData` messages to RabbitMQ using the
   routing key `country.{ISO_CODE}.region`.
2. **NestJS** consumes ALL country messages via a wildcard subscription (`country.#`),
   upserts records into **MongoDB**, and invalidates or updates the **Redis** cache.
3. **Frontend (Vite + React)** calls `/countries` on load, lets the user pick a country,
   then fetches GeoJSON + indicators from the NestJS API and renders them with
   **Leaflet.js**.

---

## 4. Folder Structure

```
geodata-platform/
  apps/
    frontend/                  # Vite + React
      src/
        locales/
          en/translation.json
          pt-BR/translation.json
    backend/                   # NestJS
      src/
        i18n/
          en/messages.json
          pt-BR/messages.json
    workers/
      _template/               # copy this to add a new country
        main.py
        requirements.txt
        Dockerfile
        README.md
      brazil/                  # implemented
        main.py
        requirements.txt
        Dockerfile
      usa/                     # future
  packages/
    worker-sdk/                # Python base classes — imported by every worker
      worker_sdk/
        __init__.py
        base_worker.py
        models.py
    contracts/                 # JSON schemas for queue messages (language-neutral)
      region.schema.json
      country-registry.schema.json
    shared-types/              # TypeScript types (frontend + backend)
      src/
        region.ts
        country.ts
  docker-compose.yml           # core stack (no workers)
  docker-compose.brazil.yml    # extends base, adds brazil worker
  docker-compose.usa.yml       # future
  package.json                 # pnpm workspace root
  CLAUDE.md                    # this file
  README.md
```

---

## 5. Tech Stack

### Frontend
| Tech | Role |
|---|---|
| Vite + React | App bundler and UI framework |
| Leaflet.js | Interactive map — renders GeoJSON regions dynamically |
| OpenStreetMap tiles | Free map background, no API key |
| react-i18next | PT-BR / EN language switching (extensible) |
| axios | Calls the NestJS API |

**Map rules:**
- Never hardcode a country's GeoJSON. Load it from `/countries/:code/regions`.
- Never hardcode indicator names in components. Read them from `/countries/:code/indicators`.
- If an indicator has no i18n key, fall back to the raw key name — never crash.
- Do NOT use Google Maps. Leaflet + OSM is free, needs no key, and reads GeoJSON natively.

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
| worker-sdk | Internal base package (see packages/worker-sdk) |
| httpx / requests | HTTP calls to public APIs |
| pandas | Data cleaning and analysis |
| pika | RabbitMQ publisher |

### Data & Infra
| Tech | Role |
|---|---|
| MongoDB | Stores RegionData documents + country registry |
| Redis | Caches API responses; TTL 3600s default |
| RabbitMQ | Topic exchange; routing key `country.{ISO}.region` |
| Docker Compose | Runs the full stack locally |

---

## 6. Worker SDK

Every worker inherits from `BaseWorker` in `packages/worker-sdk`. The SDK handles
RabbitMQ connection, serialization, and publishing. A worker only implements `fetch()`.

```python
# packages/worker-sdk/worker_sdk/base_worker.py (abbreviated)

class BaseWorker(ABC):
    @abstractmethod
    def fetch(self) -> List[RegionData]:
        """Fetch, clean, and return all region data for this country."""
        ...

    def run(self):
        data = self.fetch()
        self._publish(data)          # handled by SDK
```

```python
# A complete country worker — only fetch() is country-specific
class BrazilWorker(BaseWorker):
    COUNTRY_CODE = "BR"

    def fetch(self) -> List[RegionData]:
        # call IBGE, DataSUS, ANEEL, etc.
        # return a list of RegionData objects
        ...

BrazilWorker(rabbitmq_url=os.getenv("RABBITMQ_URL")).run()
```

**RegionData fields** (defined in `packages/contracts/region.schema.json`):

| Field | Type | Example |
|---|---|---|
| `country_code` | str | `"BR"` (ISO 3166-1 alpha-2) |
| `region_type` | str | `"state"` / `"province"` / `"department"` |
| `region_code` | str | `"SP"` |
| `region_name` | str | `"São Paulo"` |
| `source` | str | `"IBGE"` |
| `scraped_at` | ISO datetime | `"2024-01-01T00:00:00Z"` |
| `geometry` | GeoJSON dict | `{ "type": "Polygon", ... }` |
| `indicators` | dict of IndicatorValue | see below |

**IndicatorValue fields:**

| Field | Type | Example |
|---|---|---|
| `value` | float | `46000000` |
| `unit` | str | `"people"` / `"%"` / `"USD"` |
| `year` | int | `2022` |
| `source` | str | `"IBGE Census 2022"` |

```json
{
  "indicators": {
    "population":    { "value": 46000000, "unit": "people", "year": 2022, "source": "IBGE" },
    "gdp_usd":       { "value": 900000000, "unit": "USD",   "year": 2021, "source": "IBGE" },
    "literacy_rate": { "value": 96.8,      "unit": "%",     "year": 2022, "source": "IBGE" }
  }
}
```

---

## 7. MongoDB Schema

### regions collection
```json
{
  "country_code": "BR",
  "region_type": "state",
  "region_code": "SP",
  "region_name": "São Paulo",
  "source": "IBGE",
  "scraped_at": "2024-01-01T00:00:00Z",
  "geometry": { "type": "Polygon", "coordinates": [] },
  "indicators": {
    "population": { "value": 46000000, "unit": "people", "year": 2022 }
  }
}
```

Indexes:
```
{ country_code: 1 }
{ country_code: 1, region_code: 1 }   // unique
```

### countries collection (registry)
```json
{
  "country_code": "BR",
  "country_name": "Brasil",
  "region_type": "state",
  "available_indicators": ["population", "gdp_usd", "literacy_rate"],
  "workers": ["ibge", "datasus", "aneel"],
  "last_scraped": "2024-01-01T00:00:00Z"
}
```

The backend upserts this document whenever a worker message arrives, keeping it current.
The frontend reads it to know what indicators to show — no frontend hardcoding.

**Important:** Store raw IBGE and other source data under the original field names in the
source language. Translate only UI labels on the frontend via i18n keys.

---

## 8. RabbitMQ — Topic Exchange

Exchange name: `geodata`
Exchange type: `topic`
Routing key pattern: `country.{ISO_CODE}.region`

```
country.BR.region   <- Brazil worker publishes here
country.US.region   <- future USA worker
country.AR.region   <- future Argentina worker
```

NestJS subscribes to `country.#` to receive all countries in one consumer. If you need
country-specific consumers later, subscribe to `country.BR.#` separately — the routing
key structure supports it without any schema change.

---

## 9. NestJS API — Country-Agnostic Endpoints

```
GET /countries                            # list all available countries
GET /countries/:code                      # country metadata + available indicators
GET /countries/:code/regions              # all regions with GeoJSON + indicators
GET /countries/:code/regions/:region      # single region detail
GET /countries/:code/indicators           # indicator list for this country
```

No endpoint path, controller, or service contains a country name or hardcoded region list.
`:code` drives everything. The frontend calls these without knowing which country is active.

---

## 10. Frontend — Dynamic Map Pattern

```tsx
// On mount: discover available countries
const { data: countries } = useQuery('/countries');

// On country select: load GeoJSON + data
const { data: regions } = useQuery(`/countries/${selectedCode}/regions`);

// Render
L.geoJSON(regions, {
  onEachFeature: (feature, layer) => {
    layer.on({ mouseover: highlight, mouseout: reset, click: showPanel });
  }
}).addTo(map);
```

The indicator panel reads from `/countries/:code/indicators` — never from a hardcoded list.
i18n keys for indicators live under the `indicators` namespace; fall back to the raw key
if a translation is missing.

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
- Indicator key names (e.g. `"population"`) are data, not i18n keys — translate them
  under `indicators.population` in the translation files.
- If a translation key is missing, fall back silently — never throw or display a raw key
  path to the user.

---

## 12. Docker Compose Strategy

```bash
# Full stack + Brazil worker
docker compose -f docker-compose.yml -f docker-compose.brazil.yml up --build

# Core stack only (no workers — useful for backend development)
docker compose up --build

# Future: add USA worker
docker compose -f docker-compose.yml -f docker-compose.brazil.yml -f docker-compose.usa.yml up --build
```

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
RABBITMQ_URL=amqp://rabbitmq:5672
```

Worker env vars:
```
RABBITMQ_URL=amqp://rabbitmq:5672
WORKER_LANG=pt-BR          # or en, for log language
```

---

## 13. Adding a New Country — Step by Step

1. Copy `apps/workers/_template/` to `apps/workers/{country_name}/`.
2. Set `COUNTRY_CODE` to the ISO 3166-1 alpha-2 code.
3. Set `REGION_TYPE` to the administrative division type for that country.
4. Implement `fetch()` — call the country's public APIs, return `List[RegionData]`.
5. Map source indicator names to the shared indicator vocabulary (see below).
6. Add `docker-compose.{country}.yml` following the existing Brazil example.
7. Add i18n translations for any new indicator keys in `en` and `pt-BR`.
8. Update `README.md` to list the new country and its data sources.

**No changes needed in:** backend, frontend, MongoDB schema, RabbitMQ config, Redis.

### Shared indicator vocabulary
Use consistent snake_case keys across all countries so the frontend can compare indicators
cross-country in the future:

| Key | Meaning | Unit |
|---|---|---|
| `population` | Total population | people |
| `population_density` | People per km² | people/km² |
| `gdp_usd` | GDP in USD | USD |
| `gdp_per_capita_usd` | GDP per capita | USD |
| `gini_coefficient` | Income inequality | 0–1 |
| `literacy_rate` | Adult literacy | % |
| `urbanization_rate` | Urban population share | % |
| `unemployment_rate` | Unemployment | % |
| `hdi` | Human Development Index | 0–1 |
| `hospital_beds_per_1k` | Hospital beds per 1,000 people | beds/1k |

Add new keys when a worker has genuinely new data. Document them here.

---

## 14. Brazil Worker — Data Sources Reference

All free. Portal da Transparência requires a free Gov.br token stored in env vars.

### IBGE — no key required
Base: `https://servicodados.ibge.gov.br/api/v3/`

```
# State GeoJSON boundaries
GET /malhas/paises/BR?resolucao=UF&formato=application/vnd.geo+json

# Municipalities for a state
GET /localidades/estados/{UF}/municipios
```

SIDRA aggregate tables (verify IDs at `servicodados.ibge.gov.br/api/docs/agregados?versao=3`):

| Indicator | Table |
|---|---|
| Population 2022 Census | 9514 |
| Population by age/sex | 9906 |
| Literacy rate | 9543 |
| Urbanization rate | 1378 |
| Average household income | 7435 |
| Population density | 1301 |
| Birth/death rates | 2612 |
| GDP by sector (PIB) | 5938 |
| Industrial production index | 3653 |
| Agricultural production (PAM) | 1612 |
| Livestock production (PPM) | 3939 |
| Companies by sector (CEMPRE) | 6450 |
| Employed workers per industry | 6461 |
| Gini coefficient | 7435 |
| HDI components | 9818 |

> ⚠️ SIDRA table IDs drift over time. Always verify a table ID against the live API
> before wiring a new indicator. The 2022 census moved data to new tables vs. 2010.

### Tesouro Nacional / Siconfi — no key required
```
http://apidatalake.tesouro.gov.br/docs/siconfi/
```
State budget execution, public debt, revenue vs expenditure. JSON output.

### Portal da Transparência — free Gov.br token required (store in env var)
```
https://portaldatransparencia.gov.br/api-de-dados
```
Bolsa Família, federal spending, contracts, public servants.

### DataSUS (health) — no key required
```
http://tabnet.datasus.gov.br
```
Hospital beds, mortality rates, disease incidence, vaccination coverage.

### ANEEL (energy) — no key required
```
https://dadosabertos.aneel.gov.br
```
Power plant locations, generation capacity, energy mix (solar, hydro, wind).

### dados.gov.br (meta-directory) — free token required
```
https://dados.gov.br/swagger-ui/index.html
```
Directory of hundreds of additional government datasets.

---

## 15. Conventions for AI Assistants

**Always do:**
- Read the nearest `CLAUDE.md` (per-app) before the root one.
- Keep the backend and frontend 100% country-agnostic.
- Use the shared indicator vocabulary when mapping new data fields.
- Add i18n keys for both `en` and `pt-BR` at the same time.
- Verify SIDRA table IDs against the live IBGE API — never trust them from memory.
- Keep API keys and tokens in env vars; never hard-code them.
- Read Redis before MongoDB on all read paths.

**Never do:**
- Write `if country === "BR"` (or any country code) outside a worker.
- Hardcode a list of states, provinces, or regions in the backend or frontend.
- Hardcode indicator names or units in React components.
- Reintroduce Google Maps — Leaflet + OSM only.
- Add cloud infra, auth providers, or deployment config unless explicitly asked.
- Trust a SIDRA table ID from training data — always verify live.
