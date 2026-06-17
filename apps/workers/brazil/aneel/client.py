"""
ANEEL CKAN client — resolves and downloads the SIGA generation dataset.

ANEEL is not a query API: it's a CKAN open-data portal serving file downloads. The SIGA
package id has drifted over time, so we discover the current package via `package_search`
(never trust a hardcoded id) and pick the full generation CSV resource, then download it.
Parsing/aggregation is the pipeline's job — this module only fetches.
"""

from __future__ import annotations

import io
import logging

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

CKAN_BASE = "https://dadosabertos.aneel.gov.br/api/3/action"
# Search terms that resolve to "SIGA - Sistema de Informações de Geração da ANEEL".
SIGA_QUERY = "siga sistema de informacoes de geracao"
# The full generation file (not the "-diario" incremental one).
SIGA_CSV_NAME = "siga-empreendimentos-geracao.csv"


class AneelError(RuntimeError):
    """Raised when the ANEEL catalog or download cannot be satisfied."""


class AneelClient:
    def __init__(self, *, timeout: float = 180.0) -> None:
        self._timeout = timeout

    def _resolve_csv_url(self) -> str:
        try:
            resp = httpx.get(
                f"{CKAN_BASE}/package_search",
                params={"q": SIGA_QUERY, "rows": "5"},
                timeout=self._timeout,
            )
            resp.raise_for_status()
            results = resp.json()["result"]["results"]
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise AneelError(f"ANEEL package_search failed: {exc}") from exc

        # Prefer the resource named exactly like the full CSV; else the first non-daily CSV.
        fallback: str | None = None
        for pkg in results:
            for res in pkg.get("resources", []):
                if str(res.get("format", "")).upper() != "CSV":
                    continue
                url = res.get("url", "")
                if res.get("name") == SIGA_CSV_NAME:
                    return url
                if fallback is None and "diario" not in url:
                    fallback = url
        if fallback:
            return fallback
        raise AneelError("SIGA generation CSV not found in the ANEEL catalog")

    def fetch_siga(self) -> pd.DataFrame:
        """Download the SIGA generation CSV into a DataFrame (raw string columns)."""
        url = self._resolve_csv_url()
        logger.info("Downloading ANEEL SIGA CSV: %s", url)
        try:
            resp = httpx.get(url, timeout=self._timeout, follow_redirects=True)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise AneelError(f"ANEEL SIGA download failed: {exc}") from exc
        # SIGA is latin-1 with ';' separators (data-sources-reference §3).
        return pd.read_csv(io.BytesIO(resp.content), sep=";", encoding="latin-1", dtype=str)
