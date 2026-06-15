# CLAUDE.md — Backend (NestJS)

Per-app guide. Read the root [`../../CLAUDE.md`](../../CLAUDE.md) for the full picture
(especially §2, §7, §9), then this file.

## What this is

A **country-agnostic** read API over the `geodata` MongoDB (`countries`, `snapshots`,
`geometries`). See [`README.md`](README.md) for endpoints and run instructions.

## The one rule

`level`, `period`, `theme`, and indicator keys are **opaque data** the API stores and
returns — it must never branch on their values. No country name, region list, theme list,
or indicator key is ever hardcoded:

- Discover everything from the data: the registry (`countries`) and aggregations over
  `snapshots`. `/themes` availability is computed from stored documents, not a constant.
- `:code` / `level` / `period` are the only knobs. `level` defaults to the country's first
  registered level; `period=latest` (or unset) resolves to the newest stored period.
- If you ever find yourself writing `if (code === 'BR')` or listing UF codes — stop. That
  knowledge belongs in a worker, not here.

## Conventions

- **Reads only, for now.** Mongoose runs with `autoIndex: false`; the worker/loader owns
  writes and indexes. Use `.lean()` and project out `_id`/`__v` (the `STRIP` const).
- Schemas use `strict: false` so documents written by the Python worker/loader (which may
  carry extra fields) read cleanly without modelling every key. `indicators` is an opaque
  theme-keyed object — pass it through untouched.
- List endpoints return `[]` for an empty scope; only single-resource lookups `404`.
- Keep the surface aligned with CLAUDE.md §9. The design reference's friendly routes
  (`/states`, `/states/:uf/municipalities`) map onto these generic ones — don't add
  country-named routes.

## Not yet wired (add behind the same generic surface)

- **RabbitMQ consumer** (`@golevelup/nestjs-rabbitmq`, wildcard `country.#`) → upsert one
  theme block at a time into `snapshots`, refresh `countries`. Today `seed_mongo.py` stands
  in for this; the read API doesn't change when it lands.
- **Redis** read-through cache (`@nestjs/cache-manager` + ioredis) — read cache before Mongo.
- **`nestjs-i18n`** for translated error/response messages (`Accept-Language` / `x-lang`).
- **Geometry**: deferred by decision — `/geometries` returns an empty `FeatureCollection`
  until real borders are reintroduced (design reference §2).
