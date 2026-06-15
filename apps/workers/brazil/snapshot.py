"""
Snapshot serializer — turns a list of ``RegionData`` into a single JSON validation
artifact, shaped to mirror what the NestJS backend would persist.

The output bundles two of the three MongoDB collections from CLAUDE.md §7:

  * ``registry``  — the ``countries`` registry document (drives frontend discovery).
  * ``snapshots`` — one ``snapshots`` document per region per period, with indicators
    grouped by theme exactly as the backend stores them after consuming the per-theme
    ``country.BR.region`` messages.

Geometry is omitted by design: this worker collects indicator data only (geometry is a
separate, rarely-changing concern already covered by the frontend's bundled IBGE borders).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from worker_sdk import RegionData

logger = logging.getLogger(__name__)


def _snapshot_document(region: RegionData) -> dict:
    """Shape one region as a `snapshots` collection document (indicators by theme)."""
    indicators = {
        theme: {key: value.to_dict() for key, value in block.items()}
        for theme, block in region.indicators.items()
        if block
    }
    return {
        "country_code": region.country_code,
        "level": region.level,
        "code": region.code,
        "parent_code": region.parent_code,
        "abbrev": region.abbrev,
        "name": region.name,
        "period": region.period,
        "fetched_at": region.fetched_at,
        "indicators": indicators,
    }


def _registry_document(regions: list[RegionData], worker: str) -> dict:
    """Build the `countries` registry document from the collected regions."""
    themes: list[str] = []
    available: dict[str, list[str]] = {}
    periods: set[str] = set()

    for region in regions:
        periods.add(region.period)
        for theme, block in region.indicators.items():
            if not block:
                continue
            if theme not in available:
                available[theme] = []
                themes.append(theme)
            for key in block:
                if key not in available[theme]:
                    available[theme].append(key)

    return {
        "country_code": regions[0].country_code if regions else "BR",
        "country_name": "Brasil",
        "levels": sorted({region.level for region in regions}),
        "themes": themes,
        "available_indicators": available,
        "periods": sorted(periods),
        "workers": [worker],
        "last_scraped": datetime.now(timezone.utc).isoformat(),
    }


def build_snapshot(regions: list[RegionData], *, worker: str = "ibge") -> dict:
    """Assemble the full snapshot artifact (registry + per-region snapshot documents)."""
    snapshots = [_snapshot_document(region) for region in regions]
    indicator_count = sum(
        len(block) for region in regions for block in region.indicators.values()
    )
    return {
        "country_code": regions[0].country_code if regions else "BR",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "worker": worker,
        "region_count": len(snapshots),
        "indicator_count": indicator_count,
        "registry": _registry_document(regions, worker),
        "snapshots": snapshots,
    }


def write_snapshot(
    regions: list[RegionData],
    output_dir: str,
    *,
    worker: str = "ibge",
    filename: str | None = None,
) -> str:
    """Write the snapshot artifact to ``output_dir`` and return the file path."""
    snapshot = build_snapshot(regions, worker=worker)
    country = snapshot["country_code"]
    filename = filename or f"snapshot-{country}-{worker}.json"

    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, filename)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, ensure_ascii=False, indent=2)

    logger.info(
        "Wrote snapshot: %s (%d regions, %d indicators)",
        path,
        snapshot["region_count"],
        snapshot["indicator_count"],
    )
    return path
