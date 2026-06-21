# CLAUDE.md — Brazil Worker

Per-app guide. Read [`../CLAUDE.md`](../CLAUDE.md) (workers) and the root
[`../../../CLAUDE.md`](../../../CLAUDE.md) for the full picture, then this file.

## What this is

The Brazil data worker. Implements **IBGE** collection for **demographics**, **wealth**, and
**public_services** at three levels — **regiao** (N2, 5 macro-regions), **UF** (N3, 27 states),
and **municipio** (N6, 5,570 municipalities) — plus ANEEL (energy) and SICONFI (fiscal) at UF
only. See [`README.md`](README.md) for the indicator table and run instructions.

**Level selection.** `IbgePipeline.build_regions(level=…)` takes a `LevelConfig`
(`REGION_LEVEL` / `UF_LEVEL` / `MUNI_LEVEL` in `ibge/reference.py`); the SIDRA `nivel`
(N2/N3/N6) is threaded through `client.fetch(query, nivel)`. `main.py` / `seed_mongo.py` accept
`--level {uf,municipio,regiao,all}` (default `uf`). **Only N6** skips gini (no N6 data) and live
births (request times out) and splits the multi-variable GDP query (the combined query 500s at
N6); N2/N3 fetch the full set in single calls. Only a municipality has a `parent_code` (its UF);
states and macro-regions are top-level. Seed extra levels into the running Mongo with e.g.
`python seed_mongo.py --fetch --level regiao` — `seed_mongo` **merges** the registry, so each
level adds to the others without clobbering existing data.

## The one rule

All Brazil-specific knowledge stays in this directory — `fetch()` in `main.py` delegates to
one sub-package per data source. Never push country logic into `worker-sdk`, the backend,
or the frontend (root CLAUDE.md §2).

## How it's organized

One sub-package per source; each is `client.py` (HTTP/transport) + `pipeline.py`
(fetch → pandas → indicators). `fetch()` builds a shared `{code: RegionData}` map: IBGE
creates the regions, then ANEEL and SICONFI **enrich** them (adding theme blocks). Sources
fail independently (`BrazilWorker._enrich` swallows per-source errors).

- `ibge/` — base source. `reference.py` is the **single source of truth** for Brazil facts:
  the 27 UFs + the verified SIDRA `SidraQuery` catalogue (also exports `COUNTRY_CODE`,
  `LEVEL_NAME`, and `pipeline.SNAPSHOT_PERIOD` that the other sources import). `client.py` is
  generic SIDRA mechanics; `pipeline.py` builds RegionData (demographics/wealth/public_services).
- `aneel/` — energy (infrastructure). `client.py` resolves + downloads the SIGA CSV via CKAN
  search (package id is **not** hardcoded — it drifts); `pipeline.py` aggregates capacity +
  energy mix per UF and enriches.
- `siconfi/` — fiscal (wealth). `client.py` is a **≤1 req/s throttled** REST client;
  `pipeline.py` derives `fiscal_autonomy_ratio` / `own_revenue` / `federal_transfers` from
  the RREO and enriches. ~30s for all 27 UFs.
- (planned) `datasus/`, `transparencia/` — see README "Remaining sources" for the blockers.
- `snapshot.py` / `main.py` — serialize to the JSON artifact / CLI (`snapshot` | `publish`).
- `seed_mongo.py` — **dev/bootstrap only**: loads the snapshot into the local `mongo`
  container (`snapshots` + `countries`, §7 schema). It is *not* part of the worker: the
  worker never writes to MongoDB — the NestJS backend will. Keep Mongo logic out of `fetch()`.

## Conventions specific to this worker

- **Verify SIDRA IDs against `/metadados`** — the client does this at runtime and raises on
  a bad table/variable. If you hard-add an ID, confirm it live first; IBGE renumbers tables.
- **Group indicators by the four themes** using the snake_case vocabulary in root §13.
  New keys (e.g. `gdp_share_*`, `water_supply_rate`) must also be added to the root §13
  table and to both i18n dictionaries when the frontend consumes them.
- **Fetch defensively** — one failing source degrades that indicator to absent, never
  aborts the run (see `IbgePipeline._safe_fetch`).
- **Periods stay strings**; each `IndicatorValue.year` is the true source year even when the
  snapshot period label differs (currently `"2022"`).
- Geometry is intentionally **not** collected here (the frontend bundles IBGE borders; the
  `/malhas` per-UF feed is a separate, later concern).

## Extending to new sources

Add the source's fetch logic to a new sub-package (mirroring `ibge/`), wire it into
`BrazilWorker.fetch()`, append its indicators to the relevant themes, and update the
README table. SICONFI must throttle to ≤1 req/s; Transparência paginates until empty.
