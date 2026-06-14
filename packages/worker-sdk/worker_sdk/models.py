"""
Shared data models for all country workers.

A worker builds one ``RegionData`` per region per period, attaches geometry (once) and
indicators grouped by theme, then returns a list of them from ``fetch()``. The SDK splits
each ``RegionData`` into wire messages at publish time:

  * a geometry message  -> routing key country.{CODE}.geometry  (geometry.schema.json)
  * one indicator message per theme -> country.{CODE}.region     (region.schema.json)

The canonical contracts are the JSON schemas in ``packages/contracts/`` — keep them in
sync with this module. Do not add country-specific fields here: ``level``, ``period`` and
theme names are opaque strings that the backend stores and renders but never branches on.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Optional

# The four themes indicators are grouped under (see CLAUDE.md section 13).
THEMES = ("demographics", "wealth", "infrastructure", "public_services")


@dataclass
class IndicatorValue:
    """A single measured indicator for a region."""

    value: float
    unit: str           # e.g. "people", "%", "R$", "MW", "beds/100k"
    year: int           # reference year of the data
    source: str = ""    # e.g. "IBGE Census 2022"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RegionData:
    """
    Country-agnostic representation of ONE administrative region at ONE period.

    Geometry is optional and published once per region (not per period). Indicators are
    grouped by theme: ``indicators[theme][indicator_key] = IndicatorValue``.
    """

    # Identity
    country_code: str               # ISO 3166-1 alpha-2, e.g. "BR"
    level: str                      # division level name, e.g. "UF" | "municipio"
    code: str                       # region code at this level, e.g. "35"
    name: str                       # display name, e.g. "São Paulo"
    period: str                     # reference period as a STRING, e.g. "2022", "2023-P1"

    # Optional identity extras
    parent_code: Optional[str] = None   # parent region code (e.g. UF code for a municipio)
    abbrev: Optional[str] = None        # short display code, e.g. "SP"

    # Provenance
    source: str = ""                # primary data source, e.g. "IBGE"
    fetched_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    # Geography — GeoJSON Polygon or MultiPolygon (published once, separately)
    geometry: dict = field(default_factory=dict)

    # Indicators grouped by theme: { theme: { indicator_key: IndicatorValue } }
    indicators: dict[str, dict[str, IndicatorValue]] = field(default_factory=dict)

    def add_indicator(
        self,
        theme: str,
        key: str,
        value: float,
        unit: str,
        year: int,
        source: str = "",
    ) -> None:
        """Add one indicator under a theme. ``theme`` must be one of ``THEMES``."""
        if theme not in THEMES:
            raise ValueError(f"Unknown theme {theme!r}; expected one of {THEMES}")
        self.indicators.setdefault(theme, {})[key] = IndicatorValue(
            value=value, unit=unit, year=year, source=source
        )

    # ------------------------------------------------------------------
    # Wire serialization — used by the SDK at publish time
    # ------------------------------------------------------------------

    def geometry_message(self) -> Optional[dict[str, Any]]:
        """The geometry message (country.{CODE}.geometry), or None if no geometry set."""
        if not self.geometry:
            return None
        return {
            "country_code": self.country_code,
            "level": self.level,
            "code": self.code,
            "parent_code": self.parent_code,
            "name": self.name,
            "abbrev": self.abbrev,
            "geometry": self.geometry,
        }

    def indicator_messages(self) -> list[dict[str, Any]]:
        """One indicator message per non-empty theme (country.{CODE}.region)."""
        messages: list[dict[str, Any]] = []
        for theme, values in self.indicators.items():
            if not values:
                continue
            messages.append(
                {
                    "country_code": self.country_code,
                    "level": self.level,
                    "code": self.code,
                    "parent_code": self.parent_code,
                    "period": self.period,
                    "theme": theme,
                    "source": self.source,
                    "fetched_at": self.fetched_at,
                    "indicators": {k: v.to_dict() for k, v in values.items()},
                }
            )
        return messages
