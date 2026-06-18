"""
Brazil-specific reference data for the IBGE worker.

Per the project's core principle (root CLAUDE.md §2) country-specific knowledge lives
ONLY inside the worker — this module is exactly that place. It holds:

  * ``UFS``        — the 27 federative units (code / abbrev / name / macro-region).
  * ``SIDRA_QUERIES`` — the verified IBGE SIDRA table + variable + classification IDs
    that feed each indicator.

Every table and variable ID below was verified against the live IBGE metadata endpoint
(``GET /agregados/{table}/metadados``) — never trusted from memory — as required by
CLAUDE.md §14. The frozen dataclasses keep the catalog self-documenting and type-safe.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class UF:
    """One Brazilian federative unit (state / Distrito Federal)."""

    code: str       # IBGE numeric UF code, e.g. "35"
    abbrev: str     # postal sigla, e.g. "SP"
    name: str       # display name, e.g. "São Paulo"
    region: str     # macro-region, e.g. "Sudeste"


# The 27 UFs. Names are authoritative fallbacks — the worker still prefers the names the
# IBGE localities endpoint returns at runtime, falling back to these if it is unavailable.
UFS: tuple[UF, ...] = (
    UF("11", "RO", "Rondônia", "Norte"),
    UF("12", "AC", "Acre", "Norte"),
    UF("13", "AM", "Amazonas", "Norte"),
    UF("14", "RR", "Roraima", "Norte"),
    UF("15", "PA", "Pará", "Norte"),
    UF("16", "AP", "Amapá", "Norte"),
    UF("17", "TO", "Tocantins", "Norte"),
    UF("21", "MA", "Maranhão", "Nordeste"),
    UF("22", "PI", "Piauí", "Nordeste"),
    UF("23", "CE", "Ceará", "Nordeste"),
    UF("24", "RN", "Rio Grande do Norte", "Nordeste"),
    UF("25", "PB", "Paraíba", "Nordeste"),
    UF("26", "PE", "Pernambuco", "Nordeste"),
    UF("27", "AL", "Alagoas", "Nordeste"),
    UF("28", "SE", "Sergipe", "Nordeste"),
    UF("29", "BA", "Bahia", "Nordeste"),
    UF("31", "MG", "Minas Gerais", "Sudeste"),
    UF("32", "ES", "Espírito Santo", "Sudeste"),
    UF("33", "RJ", "Rio de Janeiro", "Sudeste"),
    UF("35", "SP", "São Paulo", "Sudeste"),
    UF("41", "PR", "Paraná", "Sul"),
    UF("42", "SC", "Santa Catarina", "Sul"),
    UF("43", "RS", "Rio Grande do Sul", "Sul"),
    UF("50", "MS", "Mato Grosso do Sul", "Centro-Oeste"),
    UF("51", "MT", "Mato Grosso", "Centro-Oeste"),
    UF("52", "GO", "Goiás", "Centro-Oeste"),
    UF("53", "DF", "Distrito Federal", "Centro-Oeste"),
)

UF_BY_CODE: dict[str, UF] = {uf.code: uf for uf in UFS}

# IBGE geographic levels (the "nivel" the SIDRA API expects). See data-sources-reference §1.
LEVEL_UF_NIVEL = "N3"        # Unidade da Federação (states)
LEVEL_MUNI_NIVEL = "N6"      # Município

# The division-level names we publish (opaque strings the backend/frontend never branch on).
LEVEL_NAME = "UF"
LEVEL_MUNI_NAME = "municipio"


@dataclass(frozen=True)
class LevelConfig:
    """One geographic level: the SIDRA ``nivel`` to query and the level name we publish."""

    nivel: str        # SIDRA locality level, e.g. "N3" / "N6"
    level_name: str   # published division name, e.g. "UF" / "municipio"


UF_LEVEL = LevelConfig(LEVEL_UF_NIVEL, LEVEL_NAME)
MUNI_LEVEL = LevelConfig(LEVEL_MUNI_NIVEL, LEVEL_MUNI_NAME)


@dataclass(frozen=True)
class SidraQuery:
    """
    A single, verified SIDRA query.

    ``classification`` pins specific classification categories (``{class_id: category_id}``);
    every classification NOT listed here is automatically pinned to its "Total" category by
    the client, so a query with an empty ``classification`` returns the grand total. The
    period is intentionally omitted from queries — the client takes the latest non-null
    period the API returns, so the worker always publishes the freshest available value.
    """

    table: str
    variables: tuple[str, ...]
    classification: dict[str, str] = field(default_factory=dict)


# --- Raw SIDRA queries, grouped by the role each plays in the pipeline ---------------
# All IDs verified via /agregados/{table}/metadados (see commit notes / data-sources doc).

# Demographics -------------------------------------------------------------------------
Q_POPULATION = SidraQuery("9514", ("93",))            # Censo 2022 — população residente
Q_AREA = SidraQuery("1301", ("615",))                 # Área territorial (km²)
Q_LITERACY = SidraQuery("9543", ("2513",))            # Taxa de alfabetização 15+ (%)
Q_LIVE_BIRTHS = SidraQuery("2612", ("218",))          # Registro Civil — nascidos vivos
Q_RESIDENTS_TOTAL = SidraQuery("9922", ("382",))      # Moradores (total)
Q_RESIDENTS_URBAN = SidraQuery("9922", ("382",), {"1": "1"})  # Moradores em área Urbana

# Wealth & Economy ---------------------------------------------------------------------
# 5938 — PIB dos Municípios. var 37 = PIB total; the VA vars feed sector shares.
GDP_TABLE = "5938"
GDP_VAR_TOTAL = "37"        # Produto Interno Bruto a preços correntes (Mil Reais)
GDP_VAR_VA_TOTAL = "498"    # Valor adicionado bruto total
GDP_VAR_VA_AGRO = "513"     # VA agropecuária
GDP_VAR_VA_INDUSTRY = "517"  # VA indústria
GDP_VAR_VA_SERVICES = "6575"  # VA serviços (exceto administração pública)
GDP_VAR_VA_PUBLIC = "525"   # VA administração, defesa, saúde e educação públicas
Q_GDP = SidraQuery(
    GDP_TABLE,
    (
        GDP_VAR_TOTAL,
        GDP_VAR_VA_TOTAL,
        GDP_VAR_VA_AGRO,
        GDP_VAR_VA_INDUSTRY,
        GDP_VAR_VA_SERVICES,
        GDP_VAR_VA_PUBLIC,
    ),
)
Q_GINI = SidraQuery("7435", ("10681",))               # PNAD Contínua — Índice de Gini

# Public Services (Censo 2022 household services, table 10099) --------------------------
# var 381 = domicílios particulares permanentes ocupados. The numerators below pin one
# service category; the shared denominator is the grand total (empty classification).
HH_TABLE = "10099"
HH_VAR = "381"
Q_HOUSEHOLDS_TOTAL = SidraQuery(HH_TABLE, (HH_VAR,))
Q_HOUSEHOLDS_WATER = SidraQuery(HH_TABLE, (HH_VAR,), {"2037": "73830"})   # rede geral água
Q_HOUSEHOLDS_SEWAGE = SidraQuery(HH_TABLE, (HH_VAR,), {"11558": "77577"})  # rede/fossa séptica
Q_HOUSEHOLDS_GARBAGE = SidraQuery(HH_TABLE, (HH_VAR,), {"67": "73827"})    # coleta de lixo
