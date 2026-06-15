"""
The IBGE data pipeline: fetch → clean/derive (pandas) → ``RegionData``.

This module owns all of Brazil's IBGE-specific knowledge for three themes —
**demographics**, **wealth**, and **public_services** — as mandated by CLAUDE.md §2
(country logic lives only in the worker). It:

  1. Pulls each verified SIDRA query (see ``reference.py``) for all 27 UFs.
  2. Assembles them into a single pandas frame and computes the derived metrics the design
     reference asks the worker to pre-compute (population density, PIB per capita, GDP
     sector shares, crude birth rate, urbanization, household-service coverage).
  3. Emits one ``RegionData`` per UF with indicators grouped under the four-theme
     vocabulary, ready for the SDK to publish (or for the snapshot serializer to dump).

Infrastructure is intentionally absent: at UF level it comes from ANEEL/DataSUS, not IBGE,
and belongs to a later pass. Each query is fetched defensively — a single source failing
degrades that indicator to "absent" rather than aborting the whole run.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import pandas as pd

from worker_sdk import RegionData

from . import reference as ref
from .client import Observation, SidraClient, SidraError

logger = logging.getLogger(__name__)

# Snapshot period label. The Censo 2022 anchors the portfolio's "latest" view; each
# IndicatorValue still carries its own true source year (e.g. PIB 2021, Gini 2024), so the
# data stays honest while living under one queryable period (design reference §3).
SNAPSHOT_PERIOD = "2022"
COUNTRY_CODE = "BR"
PRIMARY_SOURCE = "IBGE"


@dataclass(frozen=True)
class IndicatorSpec:
    """Maps one assembled frame column to a published indicator."""

    theme: str
    key: str
    column: str       # column in the assembled frame holding the value
    year_column: str  # column holding the value's true reference year
    unit: str
    source: str
    precision: int    # decimal places; 0 → integer


# The published indicator catalogue. Order is presentation-friendly (matches the themes).
INDICATORS: tuple[IndicatorSpec, ...] = (
    # --- Demographics ---
    IndicatorSpec("demographics", "population", "population", "population_year",
                  "pessoas", "IBGE Censo Demográfico 2022", 0),
    IndicatorSpec("demographics", "population_density", "population_density", "population_year",
                  "hab/km²", "IBGE (Censo 2022 ÷ área territorial)", 1),
    IndicatorSpec("demographics", "literacy_rate", "literacy", "literacy_year",
                  "%", "IBGE Censo Demográfico 2022", 2),
    IndicatorSpec("demographics", "urbanization_rate", "urbanization_rate", "residents_year",
                  "%", "IBGE Censo Demográfico 2022", 2),
    IndicatorSpec("demographics", "birth_rate", "birth_rate", "births_year",
                  "‰", "IBGE Estatísticas do Registro Civil (derivado)", 2),
    # --- Wealth & Economy ---
    IndicatorSpec("wealth", "gdp_total", "gdp_total", "gdp_year",
                  "R$", "IBGE PIB dos Municípios", 0),
    IndicatorSpec("wealth", "pib_per_capita", "pib_per_capita", "gdp_year",
                  "R$", "IBGE PIB dos Municípios ÷ Censo 2022 (derivado)", 2),
    IndicatorSpec("wealth", "gdp_share_agriculture", "gdp_share_agriculture", "gdp_year",
                  "%", "IBGE PIB dos Municípios (derivado)", 2),
    IndicatorSpec("wealth", "gdp_share_industry", "gdp_share_industry", "gdp_year",
                  "%", "IBGE PIB dos Municípios (derivado)", 2),
    IndicatorSpec("wealth", "gdp_share_services", "gdp_share_services", "gdp_year",
                  "%", "IBGE PIB dos Municípios (derivado)", 2),
    IndicatorSpec("wealth", "gini_coefficient", "gini", "gini_year",
                  "índice", "IBGE PNAD Contínua", 3),
    # --- Public Services ---
    IndicatorSpec("public_services", "water_supply_rate", "water_supply_rate", "households_year",
                  "%", "IBGE Censo Demográfico 2022", 2),
    IndicatorSpec("public_services", "sewage_adequate_rate", "sewage_adequate_rate", "households_year",
                  "%", "IBGE Censo Demográfico 2022", 2),
    IndicatorSpec("public_services", "garbage_collection_rate", "garbage_collection_rate", "households_year",
                  "%", "IBGE Censo Demográfico 2022", 2),
)


def _values(obs: dict[str, Observation]) -> dict[str, float]:
    return {code: value for code, (_year, value) in obs.items()}


def _years(obs: dict[str, Observation]) -> dict[str, int]:
    return {code: year for code, (year, _value) in obs.items()}


class IbgePipeline:
    """Fetches IBGE data and turns it into ``RegionData`` for the 27 UFs."""

    def __init__(self, client: SidraClient) -> None:
        self._client = client

    # ------------------------------------------------------------------ #
    # Fetching
    # ------------------------------------------------------------------ #

    def _safe_fetch(self, query: ref.SidraQuery) -> dict[str, dict[str, Observation]]:
        """Run one query, degrading to empty results (not an exception) on failure."""
        try:
            return self._client.fetch(query)
        except SidraError as exc:
            logger.error("Skipping SIDRA table %s: %s", query.table, exc)
            return {var: {} for var in query.variables}

    def _resolve_names(self) -> dict[str, str]:
        """UF code → name, preferring the live IBGE list, falling back to the static table."""
        names = {uf.code: uf.name for uf in ref.UFS}
        try:
            names.update(self._client.localities(ref.Q_POPULATION.table))
        except SidraError as exc:
            logger.warning("Could not fetch live UF names, using static table: %s", exc)
        return names

    def _assemble_frame(self) -> pd.DataFrame:
        """Fetch every query and build the per-UF frame with raw + derived columns."""
        population = self._safe_fetch(ref.Q_POPULATION)[ref.Q_POPULATION.variables[0]]
        area = self._safe_fetch(ref.Q_AREA)[ref.Q_AREA.variables[0]]
        literacy = self._safe_fetch(ref.Q_LITERACY)[ref.Q_LITERACY.variables[0]]
        births = self._safe_fetch(ref.Q_LIVE_BIRTHS)[ref.Q_LIVE_BIRTHS.variables[0]]
        residents_total = self._safe_fetch(ref.Q_RESIDENTS_TOTAL)[ref.Q_RESIDENTS_TOTAL.variables[0]]
        residents_urban = self._safe_fetch(ref.Q_RESIDENTS_URBAN)[ref.Q_RESIDENTS_URBAN.variables[0]]
        gdp = self._safe_fetch(ref.Q_GDP)
        gini = self._safe_fetch(ref.Q_GINI)[ref.Q_GINI.variables[0]]
        hh_total = self._safe_fetch(ref.Q_HOUSEHOLDS_TOTAL)[ref.HH_VAR]
        hh_water = self._safe_fetch(ref.Q_HOUSEHOLDS_WATER)[ref.HH_VAR]
        hh_sewage = self._safe_fetch(ref.Q_HOUSEHOLDS_SEWAGE)[ref.HH_VAR]
        hh_garbage = self._safe_fetch(ref.Q_HOUSEHOLDS_GARBAGE)[ref.HH_VAR]

        df = pd.DataFrame(index=[uf.code for uf in ref.UFS])

        # Raw values + their true reference years.
        df["population"] = pd.Series(_values(population))
        df["population_year"] = pd.Series(_years(population))
        df["area"] = pd.Series(_values(area))
        df["literacy"] = pd.Series(_values(literacy))
        df["literacy_year"] = pd.Series(_years(literacy))
        df["births"] = pd.Series(_values(births))
        df["births_year"] = pd.Series(_years(births))
        df["residents_total"] = pd.Series(_values(residents_total))
        df["residents_urban"] = pd.Series(_values(residents_urban))
        df["residents_year"] = pd.Series(_years(residents_total))
        df["gini"] = pd.Series(_values(gini))
        df["gini_year"] = pd.Series(_years(gini))
        df["gdp_total_mil"] = pd.Series(_values(gdp.get(ref.GDP_VAR_TOTAL, {})))
        df["gdp_year"] = pd.Series(_years(gdp.get(ref.GDP_VAR_TOTAL, {})))
        df["va_total"] = pd.Series(_values(gdp.get(ref.GDP_VAR_VA_TOTAL, {})))
        df["va_agro"] = pd.Series(_values(gdp.get(ref.GDP_VAR_VA_AGRO, {})))
        df["va_industry"] = pd.Series(_values(gdp.get(ref.GDP_VAR_VA_INDUSTRY, {})))
        df["va_services"] = pd.Series(_values(gdp.get(ref.GDP_VAR_VA_SERVICES, {})))
        df["va_public"] = pd.Series(_values(gdp.get(ref.GDP_VAR_VA_PUBLIC, {})))
        df["households_total"] = pd.Series(_values(hh_total))
        df["households_year"] = pd.Series(_years(hh_total))
        df["households_water"] = pd.Series(_values(hh_water))
        df["households_sewage"] = pd.Series(_values(hh_sewage))
        df["households_garbage"] = pd.Series(_values(hh_garbage))

        # Derived metrics — pre-computed in the worker, never re-derived downstream.
        df["population_density"] = df["population"] / df["area"]
        df["birth_rate"] = df["births"] / df["population"] * 1000
        df["urbanization_rate"] = df["residents_urban"] / df["residents_total"] * 100
        df["gdp_total"] = df["gdp_total_mil"] * 1000  # Mil Reais → R$
        df["pib_per_capita"] = df["gdp_total"] / df["population"]
        df["gdp_share_agriculture"] = df["va_agro"] / df["va_total"] * 100
        df["gdp_share_industry"] = df["va_industry"] / df["va_total"] * 100
        df["gdp_share_services"] = (df["va_services"] + df["va_public"]) / df["va_total"] * 100
        df["water_supply_rate"] = df["households_water"] / df["households_total"] * 100
        df["sewage_adequate_rate"] = df["households_sewage"] / df["households_total"] * 100
        df["garbage_collection_rate"] = df["households_garbage"] / df["households_total"] * 100

        return df

    # ------------------------------------------------------------------ #
    # Building RegionData
    # ------------------------------------------------------------------ #

    @staticmethod
    def _round(value: float, precision: int) -> float:
        rounded = round(float(value), precision)
        return int(rounded) if precision == 0 else rounded

    def build_regions(self, limit: int | None = None) -> list[RegionData]:
        """Return one ``RegionData`` per UF (optionally capped to ``limit`` for testing)."""
        df = self._assemble_frame()
        names = self._resolve_names()

        ufs = ref.UFS[:limit] if limit else ref.UFS
        regions: list[RegionData] = []

        for uf in ufs:
            row = df.loc[uf.code]
            region = RegionData(
                country_code=COUNTRY_CODE,
                level=ref.LEVEL_NAME,
                code=uf.code,
                name=names.get(uf.code, uf.name),
                period=SNAPSHOT_PERIOD,
                parent_code=None,
                abbrev=uf.abbrev,
                source=PRIMARY_SOURCE,
            )

            added = 0
            for spec in INDICATORS:
                value = row.get(spec.column)
                if value is None or pd.isna(value):
                    continue
                year_raw = row.get(spec.year_column)
                year = int(year_raw) if pd.notna(year_raw) else int(SNAPSHOT_PERIOD)
                region.add_indicator(
                    theme=spec.theme,
                    key=spec.key,
                    value=self._round(value, spec.precision),
                    unit=spec.unit,
                    year=year,
                    source=spec.source,
                )
                added += 1

            if added == 0:
                logger.warning("UF %s (%s): no indicators resolved, skipping", uf.code, uf.abbrev)
                continue

            logger.info("UF %s (%s): %d indicators", uf.code, uf.abbrev, added)
            regions.append(region)

        return regions
