# Brazil Worker

Scrapes Brazilian public open-data APIs, computes derived metrics with pandas, and
publishes one geometry message plus per-theme indicator messages per region to RabbitMQ
(see root [`CLAUDE.md`](../../../CLAUDE.md) §3 and §6).

## Status — Phase 1

Implemented and verified live at **UF (state)** level, for all 27 UFs:

| Source | Theme(s) | Lights up mode | Auth |
|---|---|---|---|
| **IBGE** SIDRA | demographics, wealth, public_services | Demographics, Economic Profile | none |
| **ANEEL** SIGA | infrastructure (energy) | Energy Matrix | none |
| **SICONFI** RREO | wealth (fiscal) | Fiscal Health | none |

**Not yet wired — external blockers (see [§ Remaining sources](#remaining-sources)):**
DataSUS (health) and Portal da Transparência (social programs), plus the municipality (N6)
level. Each is added inside `fetch()` without touching the SDK, backend, or frontend.

## Indicators collected

| Theme | Indicator key | Source | Derived? |
|---|---|---|---|
| demographics | `population` | IBGE Censo 2022 (SIDRA 9514) | — |
| demographics | `population_density` | SIDRA 9514 ÷ area (SIDRA 1301) | ✅ |
| demographics | `literacy_rate` | IBGE Censo 2022 (SIDRA 9543) | — |
| demographics | `urbanization_rate` | IBGE Censo 2022 (SIDRA 9922) | ✅ |
| demographics | `birth_rate` | Registro Civil (SIDRA 2612) ÷ population | ✅ |
| wealth | `gdp_total` | IBGE PIB Municípios (SIDRA 5938) | — |
| wealth | `pib_per_capita` | SIDRA 5938 ÷ population | ✅ |
| wealth | `gdp_share_agriculture` | SIDRA 5938 (VA agropecuária ÷ VA total) | ✅ |
| wealth | `gdp_share_industry` | SIDRA 5938 (VA indústria ÷ VA total) | ✅ |
| wealth | `gdp_share_services` | SIDRA 5938 (VA serviços + adm. ÷ VA total) | ✅ |
| wealth | `gini_coefficient` | IBGE PNAD Contínua (SIDRA 7435) | — |
| wealth | `fiscal_autonomy_ratio` | SICONFI RREO ((corrente − transf.) ÷ corrente) | ✅ |
| wealth | `own_revenue` | SICONFI RREO (corrente − transferências) | ✅ |
| wealth | `federal_transfers` | SICONFI RREO (transf. correntes da União) | — |
| infrastructure | `energy_capacity_mw` | ANEEL SIGA (Σ operational MW) | ✅ |
| infrastructure | `energy_mix_hydro` / `_solar` / `_wind` / `_thermal` | ANEEL SIGA (share by source) | ✅ |
| public_services | `water_supply_rate` | IBGE Censo 2022 (SIDRA 10099) | ✅ |
| public_services | `sewage_adequate_rate` | IBGE Censo 2022 (SIDRA 10099) | ✅ |
| public_services | `garbage_collection_rate` | IBGE Censo 2022 (SIDRA 10099) | ✅ |

> Each indicator carries its own true reference `year` (e.g. PIB 2021, Gini 2024, fiscal
> 2025, energy 2026) while the snapshot is labelled period `"2022"` — the Censo year that
> anchors the portfolio's "latest" view (design reference §3). All IBGE table/variable IDs
> are verified against the live `/metadados` endpoint at runtime; the ANEEL package id is
> resolved via CKAN search (not hardcoded); SICONFI is throttled to ≤1 req/s.

## Remaining sources

These two documented sources are **not implemented** — each has a real external blocker, so
rather than ship code that can't be run/verified to the bar the others meet, they're left for
a follow-up. Both slot into `fetch()` as new sub-packages exactly like `aneel/` and `siconfi/`.

- **DataSUS** (health → `infant_mortality_rate`, `vaccination_coverage`, hospital beds /
  physicians; would light up *Public Health* + *Standard of Living*). The documented
  approach uses `pysus`, but `pysus` 2.x is a rewritten async/ducklake API that took **~27 s
  just to *list* one file** for one state — impractical and disrespectful across 27 states ×
  several record groups. Path forward: pin `pysus<2` (the documented sync `online_data` API)
  and accept the DBC download weight, or source the indicators from DataSUS TABNET CSV exports.
- **Portal da Transparência** (social → `bolsa_familia_coverage`, `federal_servants_density`;
  *Social Coverage*). Requires a **free Gov.br API token** (`TRANSPARENCIA_API_KEY`, see
  data-sources-reference §5) which isn't available here. Its API is also record-level, so
  state totals require paginating large result sets (or summing all municipalities) — design
  that in alongside the token.

## Run it

```bash
# 1. Install the internal SDK + this worker's deps (one-time, local dev)
pip install -e ../../../packages/worker-sdk
pip install -r requirements.txt

# 2. Write the JSON validation artifact to ./output/ (no RabbitMQ needed)
python main.py snapshot

# Quick check against just a few states
python main.py snapshot --limit 3

# 3. Once the backend/queue exist: fetch + publish to RabbitMQ
export RABBITMQ_URL=amqp://guest:guest@localhost:5672/
python main.py publish
```

The snapshot artifact (`output/snapshot-BR-ibge.json`) mirrors the backend's MongoDB
`countries` registry + `snapshots` collection, so it doubles as a fixture for backend
development before the worker is plugged into the live queue.

## Load into MongoDB (dev/bootstrap)

`seed_mongo.py` loads the snapshot into a local MongoDB — the `mongo` service in the repo's
[`docker-compose.yml`](../../../docker-compose.yml) (db `geodata`, port 27017). It writes the
`snapshots` and `countries` collections per root CLAUDE.md §7, upserting one theme block at a
time and creating the documented indexes.

> **This is a temporary stand-in for the NestJS backend**, which will own MongoDB writes once
> it exists. The worker itself never writes to Mongo — it only publishes to RabbitMQ
> (`python main.py publish`). See CLAUDE.md §6.

```bash
# A) One shot via Docker Compose — starts Mongo + fetches IBGE + loads it, then exits:
docker compose -f docker-compose.yml -f docker-compose.brazil.yml up --build ibge-seeder

# B) Or run Mongo in Docker and load from the host:
docker compose up -d mongo                       # from the repo root
python seed_mongo.py                             # loads ./output/snapshot-BR-ibge.json
python seed_mongo.py --fetch --drop              # re-fetch from IBGE, replace existing
MONGO_URL=mongodb://localhost:27017/geodata python seed_mongo.py   # custom URL

# Inspect what landed:
docker compose exec mongo mongosh geodata --quiet --eval \
  'db.snapshots.countDocuments(); db.snapshots.findOne({code:"35"}).indicators.demographics'
```

## Layout

```
brazil/
  main.py        # CLI: `snapshot` (default) | `publish`; defines BrazilWorker.fetch()
  snapshot.py    # serialize List[RegionData] → registry + snapshots JSON
  seed_mongo.py  # dev loader: snapshot → MongoDB (snapshots + countries collections)
  ibge/
    reference.py # 27 UFs + verified SIDRA table/variable/classification catalogue
    client.py    # retrying SIDRA HTTP client (metadata cache, Total-category resolution)
    pipeline.py  # fetch → pandas (raw + derived) → RegionData
  requirements.txt · Dockerfile · output/
```
