"""
SICONFI REST client (Tesouro Nacional open data lake).

The only non-trivial concern here is the **strict 1 request/second** rate limit
(data-sources-reference §2): every call is throttled to honor it. The client returns the
RREO's realized year-to-date revenue lines as a flat ``{cod_conta: valor}`` map; turning
those into indicators is the pipeline's job.
"""

from __future__ import annotations

import logging
import time

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt"
# The RREO column carrying the realized year-to-date amount.
REALIZED_COLUMN = "Até o Bimestre (c)"


class SiconfiError(RuntimeError):
    """Raised when a SICONFI request cannot be satisfied."""


class SiconfiClient:
    # Slightly above 1s to stay safely under the strict 1 req/s cap.
    MIN_INTERVAL = 1.1

    def __init__(self, *, timeout: float = 60.0) -> None:
        self._client = httpx.Client(
            base_url=BASE_URL, timeout=timeout, headers={"Accept": "application/json"}
        )
        self._last_request = 0.0

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SiconfiClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < self.MIN_INTERVAL:
            time.sleep(self.MIN_INTERVAL - elapsed)
        self._last_request = time.monotonic()

    def _get(self, path: str, params: dict[str, object]) -> dict:
        self._throttle()
        try:
            resp = self._client.get(path, params=params)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise SiconfiError(f"GET {path} {params} failed: {exc}") from exc

    def rreo_revenue(
        self, year: int, id_ente: int, *, anexo: str = "RREO-Anexo 01", periodo: int = 6
    ) -> dict[str, float]:
        """
        Realized year-to-date revenue lines for one entity: ``{cod_conta: valor}``.

        ``periodo=6`` is the 6th bimester (full-year accumulation); ``RREO-Anexo 01`` is the
        Balanço Orçamentário, which carries the revenue breakdown used for fiscal autonomy.
        """
        data = self._get(
            "/rreo",
            {
                "an_exercicio": year,
                "nr_periodo": periodo,
                "co_tipo_demonstrativo": "RREO",
                "id_ente": id_ente,
                "no_anexo": anexo,
            },
        )
        out: dict[str, float] = {}
        for item in data.get("items", []):
            if item.get("coluna") != REALIZED_COLUMN:
                continue
            cod = item.get("cod_conta")
            if not cod or cod in out:
                continue
            try:
                out[cod] = float(item.get("valor"))
            except (TypeError, ValueError):
                continue
        return out
