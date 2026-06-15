# Worker Template

Use this directory as the starting point for any new country worker.

## Adding a new country — quick start

```bash
# 1. Copy this template
cp -r apps/workers/_template apps/workers/{country_name}

# 2. Edit main.py
#    - Set COUNTRY_CODE (ISO 3166-1 alpha-2, e.g. "US", "AR", "DE")
#    - Implement fetch() — all country logic lives here

# 3. Add a compose override
cp docker-compose.brazil.yml docker-compose.{country}.yml
# Edit the new file: change service name and build path

# 4. Run your worker alongside the core stack
docker compose -f docker-compose.yml -f docker-compose.{country}.yml up --build
```

## What fetch() must return

A `List[RegionData]` — one object **per region per period**. Each object covers one
administrative region at one level and period:

| Field | Required | Notes |
|---|---|---|
| `country_code` | ✅ | ISO 3166-1 alpha-2 |
| `level` | ✅ | Division level name, e.g. `"state"` / `"UF"` / `"municipio"` |
| `code` | ✅ | Region code at this level |
| `name` | ✅ | Native-language display name |
| `period` | ✅ | Reference period as a **string**, e.g. `"2022"` |
| `parent_code` | — | Parent region code for sub-regions (e.g. UF code for a municipio) |
| `abbrev` | — | Short display code, e.g. `"SP"` |
| `source` | ✅ | Primary data source name |
| `geometry` | — | GeoJSON Polygon/MultiPolygon; published once, separately |
| `indicators` | ✅ | At least one, added via `add_indicator(theme, …)` |

Add indicators grouped by theme:

```python
region.add_indicator("demographics", "population", 44_400_000, "people", 2022, "IBGE")
```

The SDK turns each `RegionData` into a geometry message (`country.{CODE}.geometry`) plus
one indicator message per theme (`country.{CODE}.region`).

## Themes & indicator vocabulary

Indicators are grouped under four themes. Use consistent snake_case keys; the full
vocabulary and per-level availability live in the root `CLAUDE.md` §13 and
`docs/visualization-design-reference.md`.

| Theme | Example keys |
|---|---|
| `demographics` | `population`, `population_density`, `urbanization_rate`, `literacy_rate` |
| `wealth` | `gdp_total`, `gdp_share_agriculture`/`_industry`/`_services`, `pib_per_capita`, `household_income_avg`, `gini_coefficient`, `fiscal_autonomy_ratio` |
| `infrastructure` | `hospital_beds_per_100k`, `physicians_per_100k`, `energy_capacity_mw` |
| `public_services` | `infant_mortality_rate`, `vaccination_coverage`, `federal_servants_density`, `water_supply_rate`, `sewage_adequate_rate`, `garbage_collection_rate` |

If your source has an indicator not yet listed, add it under the right theme here **and**
in CLAUDE.md §13.

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
