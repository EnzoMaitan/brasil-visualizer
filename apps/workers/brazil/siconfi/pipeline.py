"""
SICONFI pipeline: RREO revenue → fiscal-autonomy indicators per state (wealth theme).

Derives, from each state's realized year-to-date RREO (Anexo 01):
  * ``fiscal_autonomy_ratio`` = (current revenue − current transfers) / current revenue × 100
    — how self-funded a state is; northern states run well below 50% (design reference §4).
  * ``own_revenue``       — current revenue minus transfers (R$)
  * ``federal_transfers`` — current transfers received from the Union (R$)

Enriches the IBGE-built RegionData by IBGE code. Fiscal data is **UF-only**.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from worker_sdk import RegionData

from ibge import reference as ref
from ibge.pipeline import COUNTRY_CODE, SNAPSHOT_PERIOD
from .client import SiconfiClient, SiconfiError

logger = logging.getLogger(__name__)

THEME = "wealth"
SOURCE = "SICONFI"

# RREO Anexo 01 account codes (cod_conta) for the realized revenue lines.
ACC_CURRENT_REVENUE = "ReceitasCorrentes"
ACC_CURRENT_TRANSFERS = "TransferenciasCorrentes"
ACC_FEDERAL_TRANSFERS = "TransferenciasCorrentesDaUniaoEDeSuasEntidades"

# Reference state for probing the latest available fiscal year (SP — always reports).
PROBE_ENTE = 35


class SiconfiPipeline:
    def __init__(self, client: SiconfiClient) -> None:
        self._client = client

    def _latest_year(self) -> tuple[int | None, dict[str, float]]:
        """Find the most recent fiscal year with realized RREO data (probing SP)."""
        current = datetime.now(timezone.utc).year
        for year in (current - 1, current - 2, current - 3):
            try:
                data = self._client.rreo_revenue(year, PROBE_ENTE)
            except SiconfiError:
                continue
            if data.get(ACC_CURRENT_REVENUE):
                return year, data
        return None, {}

    def enrich(self, regions: dict[str, RegionData]) -> int:
        year, probe = self._latest_year()
        if year is None:
            logger.error("SICONFI: no recent year with RREO data; skipping")
            return 0
        logger.info("SICONFI: using fiscal year %d", year)

        touched = 0
        for uf in ref.UFS:
            data = probe if uf.code == str(PROBE_ENTE) else self._safe_revenue(year, uf)
            if not data:
                continue
            current = data.get(ACC_CURRENT_REVENUE)
            transfers = data.get(ACC_CURRENT_TRANSFERS)
            federal = data.get(ACC_FEDERAL_TRANSFERS)
            if not current:
                continue

            region = regions.get(uf.code) or _new_region(uf.code)
            if transfers is not None and current > 0:
                own = current - transfers
                region.add_indicator(
                    THEME, "fiscal_autonomy_ratio", round(own / current * 100, 2),
                    "%", year, f"{SOURCE} RREO (derivado)",
                )
                region.add_indicator(THEME, "own_revenue", round(own, 2), "R$", year, f"{SOURCE} RREO")
            if federal is not None:
                region.add_indicator(
                    THEME, "federal_transfers", round(federal, 2), "R$", year, f"{SOURCE} RREO"
                )
            regions[uf.code] = region
            touched += 1

        logger.info("SICONFI: enriched %d UFs with fiscal data", touched)
        return touched

    def _safe_revenue(self, year: int, uf: ref.UF) -> dict[str, float]:
        try:
            return self._client.rreo_revenue(year, int(uf.code))
        except SiconfiError as exc:
            logger.warning("SICONFI %s: %s", uf.abbrev, exc)
            return {}


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
