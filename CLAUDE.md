# CLAUDE.md

Project guide for an AI coding assistant (and human contributors). This file describes
the architecture, tech stack, data sources, and conventions for the project. Read it
fully before making changes.

---

## 1. Project Overview

**What it is:** A portfolio web application that scrapes Brazilian public data (IBGE and
other open government sources), analyzes it, and visualizes it on an interactive map of
Brazil. Each **state (UF)** is clickable and hoverable, surfacing demographic, economic,
financial, health, and energy indicators.

**Deployment context:** This is a portfolio project. There is **no production/cloud
deployment** — anyone reviewing it runs the whole stack locally via Docker Compose. Make
choices that optimize for "clone and run," not for scale or uptime.

**Key qualities to showcase:**
- Polyglot architecture (Python worker + Node/NestJS backend).
- Async processing via a message queue.
- Caching strategy.
- Geospatial data handling (GeoJSON).
- Internationalization (PT-BR / EN).
- Containerization.

---

## 2. Architecture

```
Python Worker  ->  RabbitMQ  ->  NestJS Backend  ->  MongoDB / Redis  ->  Vite + React Frontend
     |                                                                          |
  Scrapes IBGE & other APIs                                          Leaflet.js interactive map
```

**Data flow:**
1. **Python worker** fetches data from IBGE and other open APIs, cleans/analyzes it with
   pandas, and publishes the result to **RabbitMQ**.
2. **NestJS backend** consumes the queue, stores processed data in **MongoDB**, and caches
   hot reads in **Redis**.
3. **Frontend (Vite + React)** calls the NestJS REST API, receives GeoJSON + indicator data,
   and renders clickable/hoverable states with **Leaflet.js**.

---

## 3. Tech Stack

### Frontend
| Tech | Role |
|---|---|
| Vite + React | App bundler and UI framework |
| Leaflet.js | Interactive map; renders clickable/hoverable states |
| OpenStreetMap tiles | Free map background, no API key |
| react-i18next | PT-BR / EN language switching |
| axios / fetch | Calls the NestJS API |

**Important:** Do **not** use the Google Maps API. Leaflet + OpenStreetMap is free, needs no
API key or billing setup, and renders GeoJSON natively — which is exactly what state
boundaries need.

### Backend
| Tech | Role |
|---|---|
| NestJS | REST API, queue consumer, business logic |
| @nestjs/mongoose | MongoDB integration |
| @nestjs/cache-manager + ioredis | Redis caching layer |
| @golevelup/nestjs-rabbitmq | RabbitMQ consumer |
| nestjs-i18n | Translated error messages / responses |

### Worker
| Tech | Role |
|---|---|
| Python 3.12 | Scraping, data cleaning, analysis |
| httpx / requests | HTTP calls to public APIs |
| pandas | Data cleaning and analysis |
| pika | RabbitMQ publisher |

### Data & Infra
| Tech | Role |
|---|---|
| MongoDB | Stores GeoJSON + indicator data per state |
| Redis | Caches API responses and job status |
| RabbitMQ | Async message queue (worker -> backend) |
| Docker Compose | Runs all services locally with one command |

---

## 4. Folder Structure

```
project/
  frontend/            # Vite + React
    src/
      locales/
        en/translation.json
        pt-BR/translation.json
  backend/             # NestJS
    src/
      i18n/
        en/messages.json
        pt-BR/messages.json
  worker/              # Python
    main.py
    requirements.txt
  docker-compose.yml
  CLAUDE.md
```

---

## 5. Data Sources / APIs

All sources below are **free**. Only the Portal da Transparência requires a free Gov.br token.

### IBGE (primary source) — no key required
Base: `https://servicodados.ibge.gov.br/api/v3/`

**Geography (state boundaries):**
```
GET /malhas/paises/BR?resolucao=UF&formato=application/vnd.geo+json   # all UF polygons as GeoJSON
GET /localidades/estados/{UF}/municipios                              # municipalities of a state
```

**Demographics (SIDRA aggregate tables, via /agregados/{table}/variaveis):**
| Data | SIDRA Table |
|---|---|
| Total population (Census 2022) | 9514 |
| Population by age/sex | 9906 |
| Literacy rate | 9543 |
| Urbanization rate | 1378 |
| Average household income | 7435 |
| Population density | 1301 |
| Birth/death rates | 2612 |

**Industrialization / Economy:**
| Data | SIDRA Table |
|---|---|
| GDP per state (PIB), by sector | 5938 |
| Industrial production index | 3653 |
| Agricultural production (PAM) | 1612 |
| Livestock production (PPM) | 3939 |
| Companies by sector (CEMPRE) | 6450 |
| Employed workers per industry | 6461 |

**Finances / Social:**
| Data | SIDRA Table |
|---|---|
| Average monthly income | 7435 |
| Gini coefficient | 7435 |
| Public expenditure per state | 9922 |
| Social program beneficiaries | 9920 |
| HDI components | 9818 |

> Note: SIDRA table IDs and variable codes should be **verified against the live API** before
> relying on them — IBGE periodically revises tables (e.g., 2022 census population moved to
> table 9514). Always confirm via the docs: `https://servicodados.ibge.gov.br/api/docs/agregados?versao=3`

### Tesouro Nacional — Siconfi (state finances) — no key required
```
http://apidatalake.tesouro.gov.br/docs/siconfi/
```
State budget execution, public debt, revenue vs. expenditure. JSON output, no auth.

### Portal da Transparência (federal spending) — free Gov.br token required
```
https://portaldatransparencia.gov.br/api-de-dados
```
Bolsa Família, public expenditures, federal contracts, procurement, public servants.

### DataSUS (health)
```
http://tabnet.datasus.gov.br
```
Hospital beds per state, mortality rates, disease incidence, vaccination coverage.

### ANEEL (energy / industrialization)
```
https://dadosabertos.aneel.gov.br
```
Power plant locations, generation capacity per state, energy mix (solar, hydro, wind).

### dados.gov.br (meta-directory)
```
https://dados.gov.br/swagger-ui/index.html
```
A directory API for discovering hundreds of other government datasets. Requires a free token.

### Suggested mapping of sources to map layers
| Layer | Source | Example metrics |
|---|---|---|
| Demographics | IBGE SIDRA | Population, density, urbanization |
| Economy | IBGE PIB + Siconfi | GDP, state budget, debt |
| Social | Portal Transparência | Bolsa Família coverage, public spending |
| Health | DataSUS | Hospital infrastructure, mortality |
| Energy | ANEEL | Generation capacity, energy mix |
| Geography | IBGE Malhas | State boundary polygons |

---

## 6. Data Modeling Conventions

**MongoDB document per state** — store raw IBGE data in PT-BR; translate only UI labels on
the frontend. Do **not** translate state names or IBGE field names (they are proper nouns).

```json
{
  "state": "SP",
  "name": "São Paulo",
  "geometry": { "type": "Polygon", "coordinates": [] },
  "data": {
    "populacao": 46000000,
    "pib": 2400000000
  }
}
```

GeoJSON is just JSON, so it stores naturally in MongoDB and feeds straight into Leaflet's
`L.geoJSON(...)`.

---

## 7. Internationalization (i18n)

Supported languages: **PT-BR (fallback/default)** and **EN**.

| Layer | Tool | Language detected via |
|---|---|---|
| React frontend | react-i18next | Browser language + manual toggle |
| NestJS backend | nestjs-i18n | `Accept-Language` (or `x-lang`) header |
| Python worker | simple dict | `WORKER_LANG` env var (logs only) |

Rule of thumb: translate **UI labels and API messages**, not the underlying dataset.

---

## 8. Running the Project

One command brings up the entire stack:
```bash
docker compose up --build
```

Local service ports:
| Service | Port |
|---|---|
| Frontend (Vite) | 5173 |
| Backend (NestJS) | 3000 |
| MongoDB | 27017 |
| Redis | 6379 |
| RabbitMQ (AMQP) | 5672 |
| RabbitMQ (management UI) | 15672 |

Backend environment variables:
```
MONGO_URL=mongodb://mongo:27017/ibge
REDIS_URL=redis://redis:6379
RABBITMQ_URL=amqp://rabbitmq:5672
```

Worker environment variables:
```
RABBITMQ_URL=amqp://rabbitmq:5672
WORKER_LANG=pt-BR
```

---

## 9. Conventions & Guidance for the Assistant

- **Maps:** Leaflet + OpenStreetMap only. Never reintroduce Google Maps.
- **Caching:** Read paths should check Redis before MongoDB; cache with a TTL (e.g. 3600s).
- **Queue:** The worker only *publishes*; the backend only *consumes*. Keep that direction.
- **Data freshness:** Treat SIDRA table IDs as potentially stale — verify against the live
  IBGE docs before wiring a new indicator.
- **API keys:** Only Portal da Transparência and dados.gov.br need tokens; keep them in env
  vars, never hard-coded.
- **i18n:** Add new user-facing strings to both `en` and `pt-BR` files; never hard-code
  display text in components.
- **Scope discipline:** This is a local-only portfolio project. Don't add cloud infra,
  auth providers, or deployment config unless explicitly asked.
