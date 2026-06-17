"""
Brazil worker — entry point.

Phase 1 collects **IBGE** data for three themes (demographics, wealth, public_services)
for all 27 UFs and exposes it two ways:

  * ``python main.py snapshot``  — fetch + write a JSON validation artifact (no RabbitMQ).
                                   This is the current deliverable: an offline snapshot to
                                   verify the worker before the backend/queue exist.
  * ``python main.py publish``   — fetch + publish to RabbitMQ via the SDK (pipeline mode,
                                   used once the NestJS consumer is wired up).

All IBGE-specific logic lives in ``fetch()`` (and the ``ibge`` package it delegates to),
per CLAUDE.md §2. Later sources (SICONFI, DataSUS, ANEEL, Transparência) extend ``fetch()``
without touching the SDK, backend, or frontend.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

from worker_sdk import BaseWorker, RegionData

from aneel import AneelClient, AneelPipeline
from ibge import IbgePipeline, SidraClient
from siconfi import SiconfiClient, SiconfiPipeline
from snapshot import write_snapshot

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("brazil-worker")

DEFAULT_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
WORKER_NAME = "ibge"


class BrazilWorker(BaseWorker):
    """Brazil data worker. Phase 1: IBGE demographics, wealth, public services (UF level)."""

    COUNTRY_CODE = "BR"

    def __init__(self, *, rabbitmq_url: str | None = None, limit: int | None = None) -> None:
        super().__init__(rabbitmq_url=rabbitmq_url)
        self._limit = limit

    def fetch(self) -> list[RegionData]:
        """
        Collect and normalize all of Brazil's region data into RegionData.

        Each source enriches a shared ``{code: RegionData}`` map so one region accumulates
        indicators across themes/sources. Sources fail independently — a source going down
        degrades its indicators to absent rather than aborting the whole run.
        """
        regions_by_code: dict[str, RegionData] = {}

        # IBGE — the base (demographics, wealth, public_services). Builds the regions.
        with SidraClient() as client:
            for region in IbgePipeline(client).build_regions(limit=self._limit):
                regions_by_code[region.code] = region
        logger.info("IBGE: built %d regions", len(regions_by_code))

        # ANEEL — energy (infrastructure). Enriches the regions above.
        self._enrich("ANEEL", lambda: AneelPipeline(AneelClient()).enrich(regions_by_code))

        # SICONFI — fiscal (wealth). Throttled to ≤1 req/s; ~30s for all 27 UFs.
        def _siconfi() -> None:
            with SiconfiClient() as client:
                SiconfiPipeline(client).enrich(regions_by_code)

        self._enrich("SICONFI", _siconfi)

        regions = list(regions_by_code.values())
        logger.info("Built %d regions total", len(regions))
        return regions

    @staticmethod
    def _enrich(name: str, run) -> None:
        """Run a source's enrichment, logging and swallowing failures (never abort)."""
        try:
            run()
        except Exception as exc:  # noqa: BLE001 — one source must not kill the others
            logger.error("%s enrichment failed: %s", name, exc)


def _run_snapshot(args: argparse.Namespace) -> int:
    worker = BrazilWorker(limit=args.limit)
    regions = worker.fetch()
    if not regions:
        logger.error("No regions collected — refusing to write an empty snapshot")
        return 1
    path = write_snapshot(regions, args.output, worker=WORKER_NAME)
    logger.info("Snapshot ready: %s", path)
    return 0


def _run_publish(args: argparse.Namespace) -> int:
    # BaseWorker.run() fetches then publishes geometry + per-theme indicator messages.
    BrazilWorker(rabbitmq_url=os.getenv("RABBITMQ_URL"), limit=args.limit).run()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Brazil data worker (IBGE, Phase 1)")
    parser.add_argument(
        "mode",
        nargs="?",
        default="snapshot",
        choices=("snapshot", "publish"),
        help="snapshot: write JSON artifact (default); publish: send to RabbitMQ",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_DIR,
        help=f"output directory for snapshot mode (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="only process the first N UFs (handy for quick local checks)",
    )
    args = parser.parse_args(argv)

    if args.mode == "publish":
        return _run_publish(args)
    return _run_snapshot(args)


if __name__ == "__main__":
    sys.exit(main())
