# Data Sources — Master Reference Guide

Reference for all external APIs and data portals used by the Brasil Visualizer project.
Each section covers base URLs, endpoints, authentication, parameters, available data, and integration notes.

---

## Table of Contents

1. [IBGE — Serviço de Dados Agregados (SIDRA)](#1-ibge--serviço-de-dados-agregados-sidra)
2. [Tesouro Nacional — SICONFI](#2-tesouro-nacional--siconfi)
3. [ANEEL — Dados Abertos de Energia](#3-aneel--dados-abertos-de-energia)
4. [DataSUS — TABNET](#4-datasus--tabnet)
5. [Portal da Transparência](#5-portal-da-transparência)

---

## 1. IBGE — Serviço de Dados Agregados (SIDRA)

**Docs:** https://servicodados.ibge.gov.br/api/docs/agregados?versao=3
**Base URL:** `https://servicodados.ibge.gov.br/api/v3/`
**Authentication:** None required — fully public.

### Key Endpoints

#### Geography (boundaries — two zoom levels)

```
# UF / N3 — all 27 state polygons
GET /malhas/paises/BR?resolucao=UF&formato=application/vnd.geo+json
```
Returns all 27 UF polygons as GeoJSON. Stored as-is and, on the frontend, projected with
`d3-geo` (`geoPath`) into SVG `<path>` data. This is the **default (UF) zoom level**.

```
# Municipio / N6 — all municipality polygons within one state
GET /malhas/estados/{UF}?resolucao=5&formato=application/vnd.geo+json
```
Returns the municipality polygons for a single state as GeoJSON. This is the
**second (municipality) zoom level**, loaded when the user clicks into a state.
`{UF}` accepts the IBGE numeric UF code (e.g. `35` for SP) or the abbreviation.
`resolucao=5` selects the municipal mesh resolution.

```
GET /localidades/estados/{UF}/municipios
```
Returns the list of municipalities within a state (codes + names, no geometry) — useful
for building the `code → name` lookup and for iterating N6 SIDRA queries.

```
GET /localidades/estados
```
Returns all states with IBGE codes, names, and region metadata.

#### Aggregates (SIDRA tables)

```
GET /agregados
```
Lists all aggregates grouped by research initiative.
Query params: `periodo`, `assunto`, `classificacao`, `periodicidade`, `nivel`

```
GET /agregados/{agregado}/metadados
```
Metadata for a specific table: variables, classifications, geographic levels available.

```
GET /agregados/{agregado}/periodos
```
All time periods covered by the table.

```
GET /agregados/{agregado}/localidades/{nivel}
```
Geographic localities for a table at a given level (e.g. `N3` = states).

```
GET /agregados/{agregado}/variaveis/{variavel}?localidades={localidades}
```
Data for a variable across localities — uses last 6 periods automatically.

```
GET /agregados/{agregado}/periodos/{periodos}/variaveis/{variavel}?localidades={localidades}
```
Data for a specific period range and variable.

### Geographic Level Codes (`nivel` / `localidades`)

| Code | Scope |
|------|-------|
| `N1` | Brazil |
| `N2` | Regions |
| `N3` | States (UF) |
| `N6` | Municipalities |
| `N7` | Mesoregions |
| `N8` | Microregions |

To get all states: `localidades=N3`
To get a specific state: `localidades=N3[35]` (SP = 35)

### Key SIDRA Tables for This Project

| Indicator | Table | Variable |
|-----------|-------|----------|
| Total population (Census 2022) | 9514 | — |
| Population by age/sex | 9906 | — |
| Literacy rate | 9543 | — |
| Urbanization rate | 1378 | — |
| Average household income | 7435 | — |
| Population density | 1301 | — |
| Birth/death rates | 2612 | — |
| GDP per state by sector (PIB) | 5938 | — |
| Industrial production index | 3653 | — |
| Agricultural production (PAM) | 1612 | — |
| Livestock production (PPM) | 3939 | — |
| Companies by sector (CEMPRE) | 6450 | — |
| Employed workers per industry | 6461 | — |
| Gini coefficient | 7435 | — |
| HDI components | 9818 | — |

> **Important:** IBGE periodically revises table IDs. Always verify a table ID against
> the live metadata endpoint before wiring it: `GET /agregados/{table}/metadados`

### Example Requests

```bash
# All UF polygons as GeoJSON
curl "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?resolucao=UF&formato=application/vnd.geo+json"

# Population (table 9514) for all states
curl "https://servicodados.ibge.gov.br/api/v3/agregados/9514/variaveis/93?localidades=N3"

# GDP (table 5938) metadata
curl "https://servicodados.ibge.gov.br/api/v3/agregados/5938/metadados"
```

### Integration Notes
- No API key, no rate limit documented — treat respectfully.
- GeoJSON from `/malhas` is stored in MongoDB as-is; the frontend projects it with `d3-geo`
  into SVG `<path>` data (no map library, no basemap tiles).
- Store IBGE data in PT-BR field names; translate only UI labels on the frontend.
- The Python worker should verify table IDs via `/metadados` before publishing to RabbitMQ.

---

## 2. Tesouro Nacional — SICONFI

**Docs:** http://apidatalake.tesouro.gov.br/docs/siconfi/
**Base URL:** `https://apidatalake.tesouro.gov.br/ords/siconfi/tt/`
**Authentication:** None — fully public.
**Rate limit:** **1 request per second maximum.**
**Response format:** JSON, default 5,000 items per page.
**Note:** STN does not provide technical support. Programming experience required.

### Endpoints

#### `/entes` — Federation Entities
```
GET /entes
```
Basic registration data for all federation entities. Use this to map IBGE entity codes (`id_ente`) to state names.

#### `/dca` — Annual Account Declarations
```
GET /dca?an_exercicio={year}&id_ente={ibge_code}[&no_anexo={attachment}]
```
Annual accounting declaration charts. Source for multi-year budget and accounting history.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `an_exercicio` | Long | Yes | Fiscal year (e.g. 2023) |
| `id_ente` | Integer | Yes | IBGE entity code |
| `no_anexo` | String | No | Report attachment filter |

#### `/rreo` — Budget Execution Summary Report
```
GET /rreo?an_exercicio={year}&nr_periodo={1-6}&co_tipo_demonstrativo={type}&id_ente={code}[&no_anexo={att}&co_esfera={sphere}]
```
Bimonthly budget execution data — revenue vs. expenditure per state.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `an_exercicio` | Long | Yes | Fiscal year |
| `nr_periodo` | Integer | Yes | Bimonthly period (1–6) |
| `co_tipo_demonstrativo` | String | Yes | Report type code |
| `id_ente` | Integer | Yes | IBGE entity code |
| `no_anexo` | String | No | Attachment filter |
| `co_esfera` | String | No | `M`=Municipalities, `E`=States/DF, `U`=Union, `C`=Consortium |

#### `/rgf` — Fiscal Management Report
```
GET /rgf?an_exercicio={year}&in_periodicidade={S|Q}&nr_periodo={n}&co_tipo_demonstrativo={type}&co_poder={branch}&id_ente={code}
```
Fiscal health indicators: debt, spending limits, personnel costs.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `an_exercicio` | Long | Yes | Fiscal year |
| `in_periodicidade` | String | Yes | `S`=semiannual, `Q`=quarterly |
| `nr_periodo` | Integer | Yes | Period within year |
| `co_tipo_demonstrativo` | String | Yes | Report type (simplified for municipalities <50k pop) |
| `co_poder` | String | Yes | `E`=Executive, `L`=Legislative, `J`=Judicial, `M`=MP, `D`=Defender |
| `id_ente` | Integer | Yes | IBGE entity code |
| `co_esfera` | String | No | Sphere filter |

#### `/msc_orcamentaria` — Budget Accounting Matrix
```
GET /msc_orcamentaria?id_ente={code}&an_referencia={year}&me_referencia={month}&co_tipo_matriz={MSCC|MSCE}&classe_conta={5|6}&id_tv={type}
```
Monthly budget approval and execution detail by account class.

#### `/msc_patrimonial` — Patrimonial Accounting Matrix
```
GET /msc_patrimonial?id_ente={code}&an_referencia={year}&me_referencia={month}&co_tipo_matriz={type}&classe_conta={1-4}&id_tv={type}
```
Assets, liabilities, and net worth variations per state.

#### `/msc_controle` — Control Accounting Matrix
```
GET /msc_controle?id_ente={code}&an_referencia={year}&me_referencia={month}&co_tipo_matriz={type}&classe_conta={n}&id_tv={beginning_balance|ending_balance|period_change}
```

#### `/extrato_entregas` — Delivery Summary
```
GET /extrato_entregas?id_ente={code}&an_referencia={year}
```
Which reports have been homologated/submitted by each entity.

### Matrix Type Codes

| Code | Meaning |
|------|---------|
| `MSCC` | Monthly / cumulative aggregate |
| `MSCE` | Fiscal year-end |

### Example Requests

```bash
# List all federation entities (get IBGE codes for states)
curl "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes"

# RREO for São Paulo (id_ente=35), 2023, period 1
curl "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo?an_exercicio=2023&nr_periodo=1&co_tipo_demonstrativo=RREO&id_ente=35"

# RGF for all states, 2023, semiannual period 1, Executive branch
curl "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rgf?an_exercicio=2023&in_periodicidade=S&nr_periodo=1&co_tipo_demonstrativo=RGF&co_poder=E&id_ente=35"
```

### Integration Notes
- **Rate limit is strict: 1 req/sec.** The Python worker must throttle with `time.sleep(1)`.
- Use `/entes` first to build a mapping of `id_ente` (IBGE code) to state abbreviation (UF).
- `id_ente` for states follows IBGE's UF codes (e.g. SP=35, RJ=33, MG=31).
- Best data for: state budget execution, public debt, revenue vs. expenditure, fiscal health.

---

## 3. ANEEL — Dados Abertos de Energia

**Portal:** https://dadosabertos.aneel.gov.br
**CKAN API Base:** `https://dadosabertos.aneel.gov.br/api/3/`
**Authentication:** None for read access — public data.
**Platform:** CKAN 2.x — standard CKAN API applies.
**License:** Open; attribution required (Decreto nº 8.777/2016).
**Contact:** dadosabertos@aneel.gov.br

### CKAN API Endpoints

```
GET /api/3/action/package_list
```
Returns all 73+ dataset identifiers.

```
GET /api/3/action/package_show?id={dataset-name}
```
Returns full metadata + resource list for a dataset (CSV/XML download URLs, data dictionary PDF).

```
GET /api/3/action/package_search?q={query}&rows={n}
```
Full-text search across datasets.

```
GET /api/3/action/resource_show?id={resource-id}
```
Metadata for a specific resource file.

### Key Datasets for This Project

| Dataset ID | Description | Formats |
|------------|-------------|---------|
| `siga-empreendimentos-geracao` | All power generation facilities — type, capacity, state, status, phase | CSV, XML (daily updated) |
| `capacidade-instalada-por-unidade-da-federacao` | Installed generation capacity by state | CSV |
| `geracao` | Generation output data | CSV |
| `usinas-termeletricas-por-tipo` | Thermoelectric plants by fuel type | CSV |
| `transmissao-e-distribuicao` | Transmission and distribution network data | CSV |
| `relacao-de-empreendimentos-de-geracao-distribuida` | Distributed micro/mini generation by consumer unit | CSV (11 files) |
| `tarifas-distribuidoras-energia-eletrica` | Electricity tariffs (TE + TUSD) by distributor | CSV, XML |
| `tarifa-social-de-energia-eletrica-beneficiarios` | Social tariff beneficiaries | CSV |
| `bandeiras-tarifarias` | Tariff flag history | CSV |
| `desempenho-das-concessionarias-de-transmissao` | Transmission concessionaire performance metrics | CSV |
| `interrupcoes-de-energia-eletrica-nas-redes-de-distribuicao` | Power interruptions by distribution network | CSV |
| `projetos-de-eficiencia-energetica` | Energy efficiency projects | CSV |
| `auto-de-infracao` | Regulatory infraction notices | CSV |

### Most Useful Dataset: SIGA

The **SIGA** dataset (`siga-empreendimentos-geracao`) is the primary source for the energy layer:

- **Daily CSV:** `siga-empreendimentos-geracao-diario.csv`
- **Full CSV:** `siga-empreendimentos-geracao.csv`
- **Fields include:** plant name, type (hydro/wind/solar/thermal/nuclear), state (UF), installed capacity (MW), phase (operational/construction/pre-authorization), concession dates
- **Data dictionary:** available as PDF resource in the package

```bash
# Get SIGA dataset metadata and download URLs
curl "https://dadosabertos.aneel.gov.br/api/3/action/package_show?id=siga-empreendimentos-geracao"

# Get installed capacity by state
curl "https://dadosabertos.aneel.gov.br/api/3/action/package_show?id=capacidade-instalada-por-unidade-da-federacao"

# Search for all generation-related datasets
curl "https://dadosabertos.aneel.gov.br/api/3/action/package_search?q=geracao&rows=20"
```

### Integration Notes
- Data is provided as **CSV/XML file downloads**, not a REST query API. The Python worker should:
  1. Call `package_show` to get the latest CSV resource URL.
  2. Download and parse the CSV with pandas.
  3. Group/aggregate by state (UF column) before publishing to RabbitMQ.
- SIGA data is updated daily — cache aggressively in Redis (TTL: 86400s / 24h).
- Energy mix per state (solar %, hydro %, wind %, thermal %) can be computed from SIGA by grouping `tipo_combustivel` and `sig_uf`.

---

## 4. DataSUS — TABNET

**Portal:** http://tabnet.datasus.gov.br
**Authentication:** None — public web interface.
**API:** No formal REST API. Data access is via:
  1. **TABNET web interface** — interactive query builder producing HTML tables.
  2. **Direct file downloads** — CSV/DBC exports from specific query URLs.
  3. **Third-party library** — `pysus` (Python) wraps DATASUS access patterns.

### Available Data Categories

| Category | Portuguese | Key Indicators |
|----------|-----------|----------------|
| Mortality | Mortalidade (SIM) | Deaths by cause, infant mortality, maternal mortality by state |
| Births | Nascimentos (SINASC) | Live births, birth rate, low birth weight |
| Hospital admissions | Internações (SIH/SUS) | Hospital beds, admission rates, procedures by state |
| Outpatient production | Produção Ambulatorial (SIA) | Outpatient visits, procedures |
| Immunization | Imunizações (SI-PNI) | Vaccination coverage by vaccine and state |
| Disease surveillance | Agravos (SINAN) | Notifiable disease incidence (dengue, TB, etc.) |
| Primary care | Atenção Básica (SIAB) | Primary care coverage, family health teams |
| Health infrastructure | CNES | Hospital units, beds, equipment, professionals by state |

### Recommended Access Pattern via `pysus`

`pysus` is the standard Python library for DataSUS. It handles the DBC binary format used by DataSUS and wraps TABNET queries.

```python
# Install
pip install pysus

# Example: mortality data
from pysus.online_data import SIM
df = SIM.download(states=["SP", "RJ", "MG"], years=[2022])

# Example: hospital admissions
from pysus.online_data import SIH
df = SIH.download(state="SP", year=2022, month=1)

# Example: CNES (health infrastructure)
from pysus.online_data import CNES
df = CNES.download(state="SP", year=2023, month=6, group="ST")  # ST = establishments
```

### Direct FTP / File Access

DataSUS also exposes data via FTP:
- **FTP:** `ftp://ftp.datasus.gov.br/dissemin/publicos/`
- Files are in DBC format (compressed DBF). Use `pysus` or `dbfread` + `blast-dbf` to decode.

### Key Indicators per State for This Project

| Indicator | DataSUS System | Notes |
|-----------|---------------|-------|
| Hospital beds per 100k | CNES | Group `LT` (leitos) |
| Infant mortality rate | SIM + SINASC | Deaths <1yr / live births × 1000 |
| Maternal mortality | SIM | CID-10 O00-O99 |
| Vaccination coverage | SI-PNI | % covered per vaccine |
| Dengue/TB incidence | SINAN | Cases per 100k |
| Physicians per 100k | CNES | Group `PF` (profissionais) |

### Integration Notes
- **No REST API** — the Python worker should use `pysus` for all DataSUS access.
- Add `pysus` to `worker/requirements.txt`.
- DBC files can be large; filter by state and year immediately after download.
- Cache processed results aggressively — DataSUS data is updated monthly at most.
- Data is in PT-BR encoding (latin-1 / ISO-8859-1). Decode explicitly: `pd.read_csv(..., encoding='latin-1')`.

---

## 5. Portal da Transparência

**Portal:** https://portaldatransparencia.gov.br/api-de-dados
**API Base:** `https://api.portaldatransparencia.gov.br/api-de-dados/`
**Authentication:** **Required — free Gov.br token.**
**Header:** `chave-api-dados: {YOUR_TOKEN}`
**Response format:** JSON.
**Rate limit:** Not publicly documented; treat with care (add delays between requests).

### Getting a Token

Register at: https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email
A token is emailed to your Gov.br registered address. Store in env var — never hard-code.

```
TRANSPARENCIA_API_KEY=your_token_here
```

### Available Data Categories

The API exposes federal spending, social programs, and public administration data. Key endpoint groups relevant to this project:

#### Bolsa Família / Auxílio Brasil
```
GET /api-de-dados/bolsa-familia-disponivel-por-municipio-por-competencia
  ?codigoIbge={ibge_code}&anoMesCompetencia={YYYYMM}&pagina={n}
```
Beneficiaries and total value transferred per municipality per month.

```
GET /api-de-dados/bolsa-familia-por-municipio
  ?codigoIbge={ibge_code}&anoMesReferencia={YYYYMM}&pagina={n}
```
Detailed Bolsa Família payments per municipality.

#### Federal Expenditure
```
GET /api-de-dados/despesas/por-ug
  ?codigoUg={code}&ano={year}&pagina={n}
```
Federal spending by budget unit.

```
GET /api-de-dados/despesas/recursos-recebidos
  ?codigoUf={UF}&ano={year}&pagina={n}
```
Federal resources received per state.

#### Public Servants
```
GET /api-de-dados/servidores
  ?ufExercicio={UF}&pagina={n}
```
Federal public servants by state of service.

#### Government Contracts & Procurement
```
GET /api-de-dados/contratos
  ?ufContratado={UF}&dataInicial={DD/MM/YYYY}&dataFinal={DD/MM/YYYY}&pagina={n}
```
Federal contracts by state.

### Common Parameters

| Param | Description |
|-------|-------------|
| `pagina` | Page number (starts at 1) — all endpoints are paginated |
| `codigoIbge` | IBGE municipality code (7 digits) |
| `codigoUf` / `ufExercicio` | State abbreviation (e.g. `SP`, `RJ`) |
| `ano` / `anoMesCompetencia` | Year or year-month reference period |

### Example Requests

```bash
# Bolsa Família for São Paulo state, January 2024 (paginated)
curl -H "chave-api-dados: $TRANSPARENCIA_API_KEY" \
  "https://api.portaldatransparencia.gov.br/api-de-dados/bolsa-familia-por-municipio?codigoIbge=3550308&anoMesReferencia=202401&pagina=1"

# Federal resources received by SP in 2023
curl -H "chave-api-dados: $TRANSPARENCIA_API_KEY" \
  "https://api.portaldatransparencia.gov.br/api-de-dados/despesas/recursos-recebidos?codigoUf=SP&ano=2023&pagina=1"
```

### Integration Notes
- Store token in `TRANSPARENCIA_API_KEY` env var; add to `docker-compose.yml` worker environment.
- All responses are paginated — the worker must loop through pages until an empty result.
- To aggregate Bolsa Família per state, sum across all municipality codes for that UF.
- IBGE municipality codes: 7-digit code. State codes follow IBGE UF conventions.
- For state-level totals, query all municipalities in a state and aggregate in pandas.

---

## Cross-Source Quick Reference

| Layer | Primary Source | Fallback / Complement |
|-------|---------------|----------------------|
| State boundaries (GeoJSON) | IBGE `/malhas` | — |
| Population & demographics | IBGE SIDRA | — |
| GDP & economic indicators | IBGE SIDRA (table 5938) | SICONFI RREO |
| State budget & fiscal health | SICONFI RREO / RGF | — |
| Public debt | SICONFI RGF | — |
| Social program coverage | Portal da Transparência | — |
| Federal spending per state | Portal da Transparência | SICONFI DCA |
| Hospital infrastructure | DataSUS CNES | — |
| Mortality & disease | DataSUS SIM / SINAN | — |
| Vaccination coverage | DataSUS SI-PNI | — |
| Power generation capacity | ANEEL SIGA | — |
| Energy mix per state | ANEEL SIGA (grouped by type) | — |
| Distributed solar/wind | ANEEL mini-geração dataset | — |

## Authentication Summary

| Source | Auth Required | Method |
|--------|--------------|--------|
| IBGE | No | — |
| SICONFI | No | — |
| ANEEL | No | — |
| DataSUS (via pysus/FTP) | No | — |
| Portal da Transparência | **Yes** | `chave-api-dados` header |

## Python Worker Dependencies

Add to `worker/requirements.txt`:

```
httpx
pandas
pika
pysus          # DataSUS access
```

## Environment Variables

```bash
# docker-compose.yml — worker service
RABBITMQ_URL=amqp://rabbitmq:5672
WORKER_LANG=pt-BR
TRANSPARENCIA_API_KEY=your_token_here   # Portal da Transparência only
```
