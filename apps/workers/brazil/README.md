# Brazil Worker

Scrapes Brazilian public open-data APIs, computes derived metrics with pandas, and
publishes one geometry message plus per-theme indicator messages per region to RabbitMQ
(see root [`CLAUDE.md`](../../../CLAUDE.md) §3 and §6).

## Status — Phase 1: IBGE

Implemented: **IBGE** collection at **UF (state)** level for three themes —
**demographics**, **wealth**, and **public_services** — for all 27 UFs.

Not yet wired (later passes): SICONFI (fiscal), DataSUS (health), ANEEL (energy),
Portal da Transparência (social programs), and the municipality (N6) level. Each is added
inside `fetch()` without touching the SDK, backend, or frontend.

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
| public_services | `water_supply_rate` | IBGE Censo 2022 (SIDRA 10099) | ✅ |
| public_services | `sewage_adequate_rate` | IBGE Censo 2022 (SIDRA 10099) | ✅ |
| public_services | `garbage_collection_rate` | IBGE Censo 2022 (SIDRA 10099) | ✅ |

> Each indicator carries its own true reference `year` (e.g. PIB 2021, Gini 2024) while
> the snapshot is labelled period `"2022"` — the Censo year that anchors the portfolio's
> "latest" view (design reference §3). All table/variable IDs are verified against the live
> IBGE `/metadados` endpoint at runtime, never trusted from memory (CLAUDE.md §14).

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
