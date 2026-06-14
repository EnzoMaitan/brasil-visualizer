# Worker Template

Use this directory as the starting point for any new country worker.

## Adding a new country — quick start

```bash
# 1. Copy this template
cp -r apps/workers/_template apps/workers/{country_name}

# 2. Edit main.py
#    - Set COUNTRY_CODE (ISO 3166-1 alpha-2, e.g. "US", "AR", "DE")
#    - Set REGION_TYPE  ("state" | "province" | "department" | ...)
#    - Implement fetch() — all country logic lives here

# 3. Add a compose override
cp docker-compose.brazil.yml docker-compose.{country}.yml
# Edit the new file: change service name and build path

# 4. Run your worker alongside the core stack
docker compose -f docker-compose.yml -f docker-compose.{country}.yml up --build
```

## What fetch() must return

A `List[RegionData]`. Each object covers one administrative region with:

| Field | Required | Notes |
|---|---|---|
| `country_code` | ✅ | ISO 3166-1 alpha-2 |
| `region_type` | ✅ | Match `REGION_TYPE` class attr |
| `region_code` | ✅ | Short identifier |
| `region_name` | ✅ | Native language display name |
| `source` | ✅ | Primary data source name |
| `geometry` | ✅ | GeoJSON Polygon or MultiPolygon |
| `indicators` | ✅ | At least one; use shared vocabulary |

## Shared indicator vocabulary

Use these keys so the frontend can display indicators consistently across countries:

| Key | Unit | Description |
|---|---|---|
| `population` | people | Total population |
| `population_density` | people/km² | Population density |
| `gdp_usd` | USD | GDP in US dollars |
| `gdp_per_capita_usd` | USD | GDP per capita |
| `gini_coefficient` | 0–1 | Income inequality |
| `literacy_rate` | % | Adult literacy rate |
| `urbanization_rate` | % | Share of urban population |
| `unemployment_rate` | % | Unemployment rate |
| `hdi` | 0–1 | Human Development Index |
| `hospital_beds_per_1k` | beds/1k | Hospital beds per 1,000 people |

If your source has an indicator not in this list, add it here **and** in CLAUDE.md §13.

## Finding data sources for a new country

Most countries have open data portals. Some good starting points:

| Country | Primary source |
|---|---|
| USA | census.gov, data.gov, bea.gov |
| Argentina | indec.gob.ar, datos.gob.ar |
| Germany | destatis.de, govdata.de |
| France | insee.fr, data.gouv.fr |
| India | mospi.gov.in, data.gov.in |
| Any | World Bank API (api.worldbank.org/v2) |

The World Bank API is a useful cross-country fallback for GDP, population, and HDI when
a country's own API is difficult to work with.

## Rules

- All country-specific logic stays inside `fetch()`.
- Never modify the backend, frontend, MongoDB schema, or RabbitMQ config.
- Use `add_indicator()` — don't manipulate `self.indicators` directly.
- Store API tokens in env vars; never hard-code them.
