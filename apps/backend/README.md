# Backend — NestJS read API

Country-agnostic REST API over the `geodata` MongoDB. It serves the registry, indicator
snapshots, and geometry that workers collect — `:code`, `level`, and `period` drive
everything; no route or service contains a country name or a hardcoded region list
(root [`CLAUDE.md`](../../CLAUDE.md) §2, §9).

## Status — first iteration (reads only)

- ✅ Read endpoints over MongoDB (the IBGE data loaded by the Brazil worker's seeder).
- ⏳ Not yet: the RabbitMQ consumer (data is loaded via `apps/workers/brazil/seed_mongo.py`
  for now), Redis read-through cache, and `nestjs-i18n` translated responses. `REDIS_URL` /
  `RABBITMQ_URL` are already wired in Compose for when those land.
- Geometry is **empty by decision** (real borders deferred — design reference §2), so
  `/geometries` returns an empty `FeatureCollection`.

## Endpoints (CLAUDE.md §9)

| Method & path | Returns |
|---|---|
| `GET /countries` | registry list (all countries) |
| `GET /countries/:code` | one country's registry (levels, themes, indicators, periods) |
| `GET /countries/:code/themes` | themes + indicators + **per-level availability** (computed from stored data) |
| `GET /countries/:code/geometries?level=UF` | GeoJSON `FeatureCollection` (empty for now) |
| `GET /countries/:code/periods?level=UF` | available periods, newest first |
| `GET /countries/:code/regions?level=UF&period=latest` | all regions' snapshots at a level/period |
| `GET /countries/:code/regions/:region?level=UF&period=latest` | one region's snapshot |
| `GET /countries/:code/regions/:region/children?level=municipio&period=latest` | child regions |
| `GET /` · `GET /health` | service info / healthcheck |

`level` defaults to the country's first registered level; `period` defaults to (or `latest`
resolves to) the newest stored period. List endpoints return `[]` when a scope has no data;
single-resource lookups (`/:code`, `/regions/:region`) return `404`.

## Run it

```bash
# Local dev (needs the mongo container up + data seeded):
docker compose up -d mongo                                   # from repo root
(cd ../workers/brazil && python seed_mongo.py --fetch --drop)  # load IBGE data
npm install
npm run start:dev          # http://localhost:3000  (MONGO_URL defaults to localhost)

# Full stack in Docker (builds the image, starts mongo + backend):
docker compose up -d --build backend                          # from repo root
curl http://localhost:3000/countries/BR/regions/35 | jq .
```

Env: `MONGO_URL` (default `mongodb://localhost:27017/geodata`), `PORT` (default `3000`).
CORS is enabled for all origins (dev) so the Vite frontend can call it directly.

## Layout

```
src/
  main.ts              # bootstrap (CORS, port)
  app.module.ts        # ConfigModule + Mongoose connection (autoIndex off — read-only)
  app.controller.ts    # GET / and /health
  countries/
    countries.controller.ts  # the §9 routes
    countries.service.ts     # level/period resolution, availability aggregation
    schemas/                 # snapshots · countries · geometries (strict:false, lean reads)
```
