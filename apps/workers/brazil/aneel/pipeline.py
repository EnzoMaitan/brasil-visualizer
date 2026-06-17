"""
ANEEL pipeline: SIGA generation CSV → installed capacity + energy mix per UF.

Computes, for each state's **operational** plants:
  * ``energy_capacity_mw``   — total fiscalized installed capacity (MW)
  * ``energy_mix_{hydro,solar,wind,thermal}`` — share of capacity by source (%)

all under the ``infrastructure`` theme (CLAUDE.md §13). It *enriches* the RegionData built
by the IBGE pipeline (keyed by IBGE code), mapping SIGA's UF abbreviation to that code.
"""

from __future__ import annotations

import logging

import pandas as pd

from worker_sdk import RegionData

from ibge import reference as ref
from ibge.pipeline import COUNTRY_CODE, SNAPSHOT_PERIOD
from .client import AneelClient

logger = logging.getLogger(__name__)

THEME = "infrastructure"
SOURCE = "ANEEL SIGA"

# SIGA "DscOrigemCombustivel" → the four energy-mix buckets the design uses. Anything not
# hydro/solar/wind (fossil, biomass, nuclear) is thermal/combustion-based.
ORIGIN_TO_MIX = {
    "Hídrica": "hydro",
    "Solar": "solar",
    "Eólica": "wind",
    "Fóssil": "thermal",
    "Biomassa": "thermal",
    "Nuclear": "thermal",
}
MIX_KEYS = ("hydro", "solar", "wind", "thermal")


def _parse_kw(raw: str) -> float:
    """Parse a Brazilian-formatted number ('1.234,50' / '1400' / ',00') to float."""
    try:
        return float(str(raw).strip().replace(".", "").replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


class AneelPipeline:
    def __init__(self, client: AneelClient) -> None:
        self._client = client

    def enrich(self, regions: dict[str, RegionData]) -> int:
        """Add energy indicators to ``regions`` (code → RegionData). Returns UFs touched."""
        df = self._client.fetch_siga()

        df["mw"] = df["MdaPotenciaFiscalizadaKw"].map(_parse_kw) / 1000.0
        operational = df[df["DscFaseUsina"].str.contains("Opera", na=False)].copy()
        operational["mix"] = operational["DscOrigemCombustivel"].map(ORIGIN_TO_MIX).fillna("thermal")

        # Reference year = the dataset's generation date (fallback: latest entry).
        year = _dataset_year(df)
        abbrev_to_code = {uf.abbrev: uf.code for uf in ref.UFS}

        touched = 0
        for sigla, group in operational.groupby("SigUFPrincipal"):
            code = abbrev_to_code.get(str(sigla))
            if code is None:
                continue
            total = float(group["mw"].sum())
            if total <= 0:
                continue

            region = regions.get(code) or _new_region(code)
            region.add_indicator(THEME, "energy_capacity_mw", round(total, 1), "MW", year, SOURCE)

            by_mix = group.groupby("mix")["mw"].sum()
            for key in MIX_KEYS:
                pct = float(by_mix.get(key, 0.0)) / total * 100.0
                region.add_indicator(
                    THEME, f"energy_mix_{key}", round(pct, 2), "%", year, f"{SOURCE} (derived)"
                )

            regions[code] = region
            touched += 1

        logger.info("ANEEL: enriched %d UFs with energy data (year %d)", touched, year)
        return touched


def _dataset_year(df: pd.DataFrame) -> int:
    try:
        return int(str(df["DatGeracaoConjuntoDados"].dropna().iloc[0])[:4])
    except (KeyError, IndexError, ValueError):
        from datetime import datetime, timezone

        return datetime.now(timezone.utc).year


def _new_region(code: str) -> RegionData:
    uf = ref.UF_BY_CODE[code]
    return RegionData(
        country_code=COUNTRY_CODE,
        level=ref.LEVEL_NAME,
        code=code,
        name=uf.name,
        period=SNAPSHOT_PERIOD,
        parent_code=None,
        abbrev=uf.abbrev,
        source=SOURCE,
    )
