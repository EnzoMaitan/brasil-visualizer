"""
Low-level HTTP client for the IBGE SIDRA aggregates API.

Wraps ``https://servicodados.ibge.gov.br/api/v3`` with three concerns the pipeline relies
on, none of which belong in pipeline logic:

  1. **Resilience** — bounded retries with backoff and explicit timeouts.
  2. **Metadata-driven classification** — every SIDRA table slices its variable across one
     or more *classifications*; to read a meaningful number we must pin each to a single
     category. The client fetches a table's metadata once (cached), auto-selects each
     classification's "Total" category, and lets a query override specific ones. This is
     also where CLAUDE.md §14's "verify table IDs via /metadados before publishing" rule is
     enforced — an unknown table or variable raises before any value is trusted.
  3. **Latest-period selection** — queries omit the period, so the API returns the most
     recent periods; the client picks the newest period that actually has a value, which
     transparently skips not-yet-released years (e.g. a Gini period with no data).

The client knows nothing about indicators or themes — that is the pipeline's job.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

from .reference import LEVEL_UF_NIVEL, SidraQuery

logger = logging.getLogger(__name__)

BASE_URL = "https://servicodados.ibge.gov.br/api/v3"

# SIDRA encodes "no data" for a cell with one of these sentinels rather than a number.
_MISSING_TOKENS = {"-", "...", "..", "x", "X", "", "..."}

# A (year, value) pair for one locality at the latest period that has a value.
Observation = tuple[int, float]


class SidraError(RuntimeError):
    """Raised when the IBGE API cannot satisfy a request or returns invalid metadata."""


class SidraClient:
    """Thin, retrying client over the IBGE v3 aggregates API."""

    def __init__(
        self,
        base_url: str = BASE_URL,
        *,
        timeout: float = 60.0,
        max_retries: int = 3,
        retry_backoff: float = 3.0,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url,
            timeout=timeout,
            headers={"Accept": "application/json"},
        )
        self._max_retries = max_retries
        self._retry_backoff = retry_backoff
        self._metadata_cache: dict[str, dict[str, Any]] = {}

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SidraClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    # ------------------------------------------------------------------ #
    # Low-level GET with retries
    # ------------------------------------------------------------------ #

    def _get(self, path: str, params: Optional[dict[str, str]] = None) -> Any:
        last_exc: Optional[Exception] = None
        for attempt in range(1, self._max_retries + 1):
            try:
                response = self._client.get(path, params=params)
                response.raise_for_status()
                return response.json()
            except (httpx.HTTPError, ValueError) as exc:  # network, status, or bad JSON
                last_exc = exc
                logger.warning(
                    "IBGE GET %s failed (attempt %d/%d): %s",
                    path,
                    attempt,
                    self._max_retries,
                    exc,
                )
                if attempt < self._max_retries:
                    time.sleep(self._retry_backoff * attempt)
        raise SidraError(f"GET {path} failed after {self._max_retries} attempts") from last_exc

    # ------------------------------------------------------------------ #
    # Metadata (cached) — also where table/variable IDs are validated
    # ------------------------------------------------------------------ #

    def metadata(self, table: str) -> dict[str, Any]:
        """Return (and cache) the metadata document for a SIDRA table."""
        if table not in self._metadata_cache:
            meta = self._get(f"/agregados/{table}/metadados")
            if not isinstance(meta, dict) or "variaveis" not in meta:
                raise SidraError(f"Table {table}: unexpected metadata response")
            self._metadata_cache[table] = meta
        return self._metadata_cache[table]

    def localities(self, table: str, nivel: str = LEVEL_UF_NIVEL) -> dict[str, str]:
        """Return ``{code: name}`` for a table's localities at a geographic level."""
        data = self._get(f"/agregados/{table}/localidades/{nivel}")
        return {str(item["id"]): item["nome"] for item in data}

    # ------------------------------------------------------------------ #
    # Classification resolution
    # ------------------------------------------------------------------ #

    @staticmethod
    def _total_category(classification: dict[str, Any]) -> str:
        """Pick a classification's "Total" category id, falling back to its first category."""
        categories = classification.get("categorias", [])
        for cat in categories:
            if str(cat.get("nome", "")).strip().lower() == "total":
                return str(cat["id"])
        if categories:
            return str(categories[0]["id"])
        raise SidraError(f"Classification {classification.get('id')} has no categories")

    def _classification_param(self, query: SidraQuery) -> Optional[str]:
        """
        Build the ``classificacao`` query parameter for a SIDRA query.

        Each of the table's classifications is pinned to a single category: the override
        from ``query.classification`` when present, otherwise the classification's Total.
        Returns ``None`` for tables with no classifications.
        """
        meta = self.metadata(query.table)
        classifications = meta.get("classificacoes", [])
        if not classifications:
            return None

        known_ids = {str(c["id"]) for c in classifications}
        unknown = set(query.classification) - known_ids
        if unknown:
            raise SidraError(
                f"Table {query.table}: unknown classification(s) {sorted(unknown)}"
            )

        parts = []
        for classification in classifications:
            cid = str(classification["id"])
            category = query.classification.get(cid) or self._total_category(classification)
            parts.append(f"{cid}[{category}]")
        return "|".join(parts)

    def _validate_variables(self, query: SidraQuery) -> None:
        meta = self.metadata(query.table)
        known = {str(v["id"]) for v in meta.get("variaveis", [])}
        missing = set(query.variables) - known
        if missing:
            raise SidraError(
                f"Table {query.table}: variable(s) {sorted(missing)} not in metadata"
            )

    # ------------------------------------------------------------------ #
    # Value parsing
    # ------------------------------------------------------------------ #

    @staticmethod
    def _parse_value(raw: str) -> Optional[float]:
        if raw is None or str(raw).strip() in _MISSING_TOKENS:
            return None
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None

    @classmethod
    def _latest_observation(cls, serie: dict[str, str]) -> Optional[Observation]:
        """Pick the newest period in a serie that has a parseable value."""
        best: Optional[Observation] = None
        for period, raw in serie.items():
            value = cls._parse_value(raw)
            if value is None:
                continue
            try:
                year = int(str(period)[:4])
            except ValueError:
                continue
            if best is None or year > best[0]:
                best = (year, value)
        return best

    # ------------------------------------------------------------------ #
    # Public: run a query
    # ------------------------------------------------------------------ #

    def fetch(
        self, query: SidraQuery, nivel: str = LEVEL_UF_NIVEL
    ) -> dict[str, dict[str, Observation]]:
        """
        Execute a SIDRA query and return ``{variable_id: {locality_code: (year, value)}}``.

        Localities or periods with no data are simply absent from the result, so callers
        get only real values and can decide how to handle gaps.
        """
        self._validate_variables(query)
        classificacao = self._classification_param(query)

        variables = "|".join(query.variables)
        path = f"/agregados/{query.table}/variaveis/{variables}"
        params: dict[str, str] = {"localidades": nivel}
        if classificacao:
            params["classificacao"] = classificacao

        payload = self._get(path, params)

        result: dict[str, dict[str, Observation]] = {var: {} for var in query.variables}
        for variable_block in payload:
            var_id = str(variable_block.get("id"))
            per_locality = result.setdefault(var_id, {})
            for resultado in variable_block.get("resultados", []):
                for serie in resultado.get("series", []):
                    code = str(serie["localidade"]["id"])
                    observation = self._latest_observation(serie.get("serie", {}))
                    if observation is not None:
                        per_locality[code] = observation
        return result
