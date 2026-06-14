# Visualization Design Reference
## Brasil Visualizer — Indicators, Map Modes & Architecture Decisions

> This document aggregates planning decisions made before implementation began.
> It is intended as context for Claude Code when updating CLAUDE.md or scaffolding
> new worker/backend/frontend code. Treat every decision here as already agreed upon.

---

## 1. Core Design Philosophy — "Paradox Map Modes"

The visualization is modeled after the **map mode** pattern used in Paradox grand-strategy
games (Victoria 3, Europa Universalis). Each map mode is a discrete choropleth lens that
recolors every state (and later every municipality) around a single question:
*"Which states are industrializing?" / "Where is the standard of living highest?"*

**Key UX implications:**
- The map has a **mode switcher** (tab or dropdown). One mode is active at a time.
- Hovering a state shows a **summary tooltip** (1–2 key metrics for the active mode).
- Clicking a state opens a **sidebar panel** with the full breakdown for that mode.
- Each mode has its own color scale (diverging for ratios/inequality, sequential for totals).
- Modes that are **not available at municipality level** should visually indicate this when
  the user is zoomed in (grey out the mode button, show a "state-level only" label).

---

## 2. Geographic Levels & Zoom Behavior

The map supports two zoom levels. The schema, API, and worker are all designed around
the concept of `level` as a first-class field from day one.

### Level definitions

| Level | Label | IBGE Code | GeoJSON Endpoint | Scope |
|-------|-------|-----------|-----------------|-------|
| UF | State | `N3` | `/malhas/paises/BR?resolucao=UF&formato=application/vnd.geo+json` | 27 states |
| Municipio | Municipality | `N6` | `/malhas/estados/{UF}?resolucao=5&formato=application/vnd.geo+json` | ~5,570 municipalities |

### Zoom interaction

1. **Default view:** All 27 UFs rendered. Active map mode colors the states.
2. **User clicks a state:** Map zooms into that state. Municipality polygons load from
   a second GeoJSON call. Municipality-level indicators replace state-level data in the
   sidebar. Map modes unavailable at N6 are greyed out.
3. **User clicks background or "back" button:** Returns to full UF view.

### NestJS API endpoints (two levels, same schema)

```
GET /states                          # all UF GeoJSON + indicators
GET /states/:uf                      # single state full detail
GET /states/:uf/municipalities       # all municipalities within a state
GET /states/:uf/municipalities/:code # single municipality full detail
```

### Implementation phases

- **Phase 1:** UF level only. All 4 themes. This is the portfolio deliverable.
- **Phase 2:** Municipality level for Demographics, Wealth, Public Services
  (all IBGE SIDRA N6 + DataSUS + Portal da Transparência natively support N6).
- **Phase 3:** Municipality level for Infrastructure (requires GeoPandas spatial join
  between ANEEL plant coordinates and IBGE municipality polygons — most complex, defer).

---

## 3. Data Model — Time-Series Ready From Day One

### Core principle

The schema treats `period` as a first-class key so that adding a new year's data
is an insert, not an update or migration. The UI currently shows a single "latest"
snapshot; a year slider can be added later without schema changes.

### MongoDB collections

#### `geometries` — static, rarely changes

```json
{
  "level": "UF",
  "code": "35",
  "uf": "SP",
  "name": "São Paulo",
  "geometry": { "type": "MultiPolygon", "coordinates": [] }
}
```

Kept separate from indicator data so polygons are not duplicated across periods.
Index on `{ level: 1, code: 1 }` (unique).

#### `snapshots` — grows over time

```json
{
  "level": "UF",
  "code": "35",
  "uf": "SP",
  "period": "2022",
  "fetched_at": "2024-01-15T00:00:00Z",
  "indicators": {
    "demographics": { ... },
    "wealth":       { ... },
    "infrastructure": { ... },
    "public_services": { ... }
  }
}
```

Index on `{ level: 1, code: 1, period: 1 }` (unique).
Index on `{ level: 1, period: 1 }` for map-wide queries.

### Period conventions

| Source | Period format | Example |
|--------|--------------|---------|
| IBGE Census | Year string | `"2022"` |
| IBGE SIDRA annual | Year string | `"2022"` |
| SICONFI | Year string | `"2023"` |
| SICONFI bimonthly (RREO) | Year + period | `"2023-P1"` |
| ANEEL SIGA | Date of CSV download | `"2024-01-15"` |
| DataSUS | Year + month | `"2023-06"` |

The worker should normalize all periods to these conventions before publishing
to RabbitMQ. The backend stores `period` as a plain string — do not use Date objects.

---

## 4. Themes & Indicators

### Scope constraint (non-negotiable)

**In scope:** Demographics, Wealth & Economy, Infrastructure, Public Services.
**Out of scope:** Political parties, electoral results, ideological alignment.
All political data is excluded for this project's lifetime.

---

### Theme 1 — Demographics
*Paradox equivalent: Population panel, age pyramid, cultural composition map mode.*
*Default map mode — shown on first load.*

| Indicator | Source | SIDRA Table | N3 (UF) | N6 (Municipio) |
|-----------|--------|-------------|---------|----------------|
| Total population | IBGE SIDRA | 9514 | ✅ | ✅ |
| Population density (hab/km²) | IBGE SIDRA | 1301 | ✅ | ✅ |
| Age structure (pyramid data) | IBGE SIDRA | 9906 | ✅ | ✅ |
| Urbanization rate (%) | IBGE SIDRA | 1378 | ✅ | ✅ |
| Literacy rate (%) | IBGE SIDRA | 9543 | ✅ | ✅ |
| Birth rate (‰) | IBGE SIDRA | 2612 | ✅ | ✅ |
| Death rate (‰) | IBGE SIDRA | 2612 | ✅ | ✅ |

**Derived metrics (computed in Python worker):**
- `taxa_crescimento_natural` = birth rate − death rate
- `razao_dependencia` = (population < 15 + population > 64) / population 15–64

Demographics is the only theme where **every indicator is available at N6**, making it
the natural first layer to implement for the municipality zoom.

---

### Theme 2 — Wealth & Economy
*Paradox equivalent: GDP screen, trade goods per province, income distribution, treasury.*

| Indicator | Source | SIDRA Table / Endpoint | N3 (UF) | N6 (Municipio) |
|-----------|--------|----------------------|---------|----------------|
| GDP total (R$) | IBGE SIDRA | 5938 | ✅ | ⚠️ Verify — PIB Municipal may use a different table; check `/agregados/5938/metadados` |
| GDP by sector: agriculture / industry / services (%) | IBGE SIDRA | 5938 | ✅ | ⚠️ Same caveat |
| Average household income (R$) | IBGE SIDRA | 7435 | ✅ | ✅ |
| Gini coefficient | IBGE SIDRA | 7435 | ✅ | ⚠️ May be state-level only — verify |
| Employed workers by sector | IBGE SIDRA | 6461 | ✅ | ✅ |
| Companies by sector (CEMPRE) | IBGE SIDRA | 6450 | ✅ | ✅ |
| Bolsa Família: beneficiaries as % of population | Portal da Transparência | `/bolsa-familia-por-municipio` | ✅ (aggregated) | ✅ (native) |
| Federal transfers received (R$) | SICONFI | `/rreo` | ✅ | ❌ State only |
| Fiscal autonomy ratio (derived, %) | SICONFI | `/rreo` | ✅ | ❌ State only |
| Public debt per capita (R$) | SICONFI | `/rgf` | ✅ | ❌ State only |

**Derived metrics (computed in Python worker):**
- `razao_autonomia_fiscal` = own revenue / total revenue × 100
  (measures how transfer-dependent a state is — many northern states exceed 80%)
- `pib_per_capita` = GDP / total population
- `cobertura_bolsa_familia` = beneficiaries / population × 100

**Portfolio note:** The fiscal autonomy ratio is one of the most impactful derived metrics
in the project. Some states (AM, AC, RR) are ~85% dependent on federal transfers — this
is immediately surprising to non-specialists and showcases the analytical depth of the
worker's pandas pipeline.

---

### Theme 3 — Infrastructure
*Paradox equivalent: Development level per province, fort network, resource extraction buildings.*

| Indicator | Source | System / Dataset | N3 (UF) | N6 (Municipio) |
|-----------|--------|-----------------|---------|----------------|
| Hospital beds per 100k | DataSUS | CNES group `LT` | ✅ | ✅ |
| Physicians per 100k | DataSUS | CNES group `PF` | ✅ | ✅ |
| Installed energy capacity (MW) | ANEEL | SIGA CSV (`siga-empreendimentos-geracao`) | ✅ | ⚠️ Phase 3 — requires spatial join |
| Energy mix: % hydro | ANEEL | SIGA CSV, grouped by `tipo_combustivel` | ✅ | ⚠️ Phase 3 |
| Energy mix: % solar | ANEEL | SIGA CSV | ✅ | ⚠️ Phase 3 |
| Energy mix: % wind | ANEEL | SIGA CSV | ✅ | ⚠️ Phase 3 |
| Energy mix: % thermal | ANEEL | SIGA CSV | ✅ | ⚠️ Phase 3 |

**ANEEL access pattern (not a REST API — CSV download):**
```python
# Step 1: get latest CSV URL
GET https://dadosabertos.aneel.gov.br/api/3/action/package_show?id=siga-empreendimentos-geracao

# Step 2: download and parse CSV with pandas
df = pd.read_csv(url, encoding='latin-1', sep=';')

# Step 3: group by state for N3
summary = df.groupby('sig_uf').agg(
    capacidade_mw=('mdaPotenciaFiscalizadaKw', 'sum'),
    # ... by tipo_combustivel for energy mix
)
```

**Phase 3 spatial join note (municipality level):**
SIGA has `NumCoordNEmpreendimento` and `NumCoordEEmpreendimento` (lat/lon).
Use GeoPandas to join plants to municipality polygons from IBGE malhas.
This is the most technically complex piece in the project — defer to Phase 3.

**Redis TTL for ANEEL:** 86400s (24h). SIGA is updated daily but changes slowly.

---

### Theme 4 — Public Services
*Paradox equivalent: Education tech spread, welfare laws, healthcare building coverage.*

| Indicator | Source | System | N3 (UF) | N6 (Municipio) |
|-----------|--------|--------|---------|----------------|
| Infant mortality rate (‰) | DataSUS | SIM + SINASC | ✅ | ✅ |
| Vaccination coverage (%) | DataSUS | SI-PNI | ✅ | ✅ |
| Social program beneficiaries (%) | IBGE SIDRA | 9920 | ✅ | ✅ |
| Public social spending (R$) | IBGE SIDRA | 9922 | ✅ | ⚠️ Verify at N6 |
| Federal public servants density | Portal da Transparência | `/servidores?ufExercicio={UF}` | ✅ | ✅ |

**Derived metrics (computed in Python worker):**
- `taxa_mortalidade_infantil` = (deaths < 1yr / live births) × 1000
  (requires joining SIM + SINASC data in pandas)
- `indice_cobertura_servicos` = composite of vaccination + hospital beds + infant mortality
  (normalized 0–100, the "Standard of Living"-equivalent for this theme)

**Portfolio note:** Infant mortality is the single most legible "public services are
working or not" metric — it is simultaneously the product of healthcare quality,
nutrition, sanitation, and household income. It is also universally understood.
It should be prominently displayed in the Public Services mode tooltip.

---

## 5. Map Modes Summary

| Mode | Paradox Equivalent | Primary Source | Choropleth Variable | N6 Available |
|------|--------------------|---------------|---------------------|--------------|
| Demographics | Population map mode | IBGE SIDRA | Population density | ✅ |
| Standard of Living | SoL map mode (Vic3) | IBGE + DataSUS | Composite index | ✅ |
| Economic Profile | Building slots / GDP | IBGE SIDRA 5938 | Dominant sector % | ⚠️ Verify |
| Workforce Structure | Pop breakdown (Vic3) | IBGE SIDRA 6461 | Sector employment % | ✅ |
| Fiscal Health | Treasury / budget | SICONFI RREO+RGF | Fiscal autonomy ratio | ❌ UF only |
| Energy Matrix | Trade goods (EU4) | ANEEL SIGA | Capacity MW / mix % | ⚠️ Phase 3 |
| Public Health | Mortality / pop growth | DataSUS | Infant mortality rate | ✅ |
| Social Coverage | Welfare laws (Vic3) | Transparência + IBGE | Bolsa Família % | ✅ |

---

## 6. Worker Implementation Notes

### Source-specific constraints

| Source | Rate Limit | Auth | Key Notes |
|--------|-----------|------|-----------|
| IBGE SIDRA | None documented — be respectful | None | Verify table IDs via `/agregados/{table}/metadados` before wiring |
| SICONFI | **1 req/sec — strict** | None | Worker must `time.sleep(1)` between every call |
| ANEEL | None documented | None | CSV download, not REST; parse with pandas + `encoding='latin-1'` |
| DataSUS | None documented | None | Use `pysus` library; DBC binary format |
| Portal da Transparência | Not documented — be careful | `chave-api-dados` header | Paginated — loop until empty result |

### SICONFI entity codes

SICONFI uses IBGE UF codes as `id_ente`. Build a mapping at startup via `GET /entes`:

```
SP = 35 | RJ = 33 | MG = 31 | BA = 29 | RS = 43
PR = 41 | PE = 26 | CE = 23 | PA = 15 | MA = 21
```

### Pagination (Portal da Transparência)

All Portal da Transparência endpoints are paginated starting at `pagina=1`.
Loop until the response is an empty array. For Bolsa Família per state,
query all municipality IBGE codes for that UF and aggregate in pandas.

### Worker responsibilities (what it must NOT do)

- The worker only **publishes** to RabbitMQ. It never writes to MongoDB directly.
- The worker must **validate SIDRA table IDs** via `/metadados` before publishing
  any data — IBGE periodically renumbers tables.
- Derived metrics (`razao_autonomia_fiscal`, `taxa_mortalidade_infantil`, composites)
  are computed in the worker's pandas pipeline and published as pre-computed fields.
  The backend stores them as-is; it does not re-derive anything.

### RabbitMQ message envelope

```json
{
  "level": "UF",
  "code": "35",
  "uf": "SP",
  "period": "2022",
  "theme": "demographics",
  "data": { ... },
  "fetched_at": "2024-01-15T12:00:00Z"
}
```

Publishing per theme (one message per state per theme) keeps messages small and allows
the backend to upsert individual theme blocks without rewriting the whole snapshot document.

---

## 7. Frontend Map Mode UI Conventions

- **Mode switcher:** Top-left panel with icon + label per mode. Active mode highlighted.
- **Tooltip on hover:** State name + 2 key metrics for active mode (e.g. "SP — R$ 4.200 / Gini 0.54").
- **Sidebar on click:** Full breakdown panel with all indicators for active mode + mini charts.
- **Unavailable modes:** When zoomed into municipalities, UF-only modes (Fiscal Health)
  show a greyed button with tooltip "Disponível apenas por estado / Available at state level only."
- **Color scales:**
  - Sequential (blue→red): for ranked indicators (income, capacity, population)
  - Diverging (red→white→green): for ratios where a midpoint matters (fiscal balance, growth rate)
- **Legend:** Always visible bottom-left, updates with active mode.
- **Language:** All mode labels and legends respect the react-i18next toggle (PT-BR / EN).
  Underlying data field names (IBGE names in PT-BR) are never exposed in the UI.
