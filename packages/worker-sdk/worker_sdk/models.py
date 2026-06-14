"""
Shared data models for all country workers.

These are the canonical shapes that workers produce and the backend consumes.
Do not add country-specific fields here — keep models generic.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


@dataclass
class IndicatorValue:
    """A single measured indicator for a region."""

    value: float
    unit: str           # e.g. "people", "%", "USD", "beds/1k"
    year: int           # reference year of the data
    source: str = ""    # e.g. "IBGE Census 2022"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RegionData:
    """
    Country-agnostic representation of one administrative region and its indicators.

    All workers must produce a list of these. The schema is defined canonically in
    packages/contracts/region.schema.json — keep both in sync.
    """

    # Identity
    country_code: str       # ISO 3166-1 alpha-2, e.g. "BR", "US", "AR"
    region_type: str        # "state" | "province" | "department" | "canton" | etc.
    region_code: str        # Short code, e.g. "SP", "CA", "BA"
    region_name: str        # Display name, e.g. "São Paulo", "California"

    # Provenance
    source: str             # Primary data source name, e.g. "IBGE"
    scraped_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    # Geography — GeoJSON Polygon or MultiPolygon
    geometry: dict = field(default_factory=dict)

    # Indicators — keys from the shared vocabulary in CLAUDE.md section 13
    indicators: dict[str, IndicatorValue] = field(default_factory=dict)

    def add_indicator(
        self,
        key: str,
        value: float,
        unit: str,
        year: int,
        source: str = "",
    ) -> None:
        """Convenience method to add an indicator in one line."""
        self.indicators[key] = IndicatorValue(
            value=value, unit=unit, year=year, source=source
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a plain dict suitable for JSON / RabbitMQ publishing."""
        d = asdict(self)
        # IndicatorValue objects are already converted by asdict
        return d
