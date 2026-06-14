"""
_template worker — copy this directory to apps/workers/{country_name}/ to add a country.

Steps:
  1. Set COUNTRY_CODE to the ISO 3166-1 alpha-2 code for your country.
  2. Implement fetch() — call your country's public APIs and return List[RegionData].
  3. Group indicators by theme using the vocabulary in CLAUDE.md section 13.
  4. Add docker-compose.{country}.yml following the Brazil example.
  5. Add i18n translations for any new indicator/theme keys.

You do NOT need to touch: backend, frontend, MongoDB schema, RabbitMQ, Redis.
"""

import logging
import os

from worker_sdk import BaseWorker, RegionData

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


class TemplateWorker(BaseWorker):
    # ------------------------------------------------------------------ #
    # 1. Set your country code                                           #
    # ------------------------------------------------------------------ #
    COUNTRY_CODE = "XX"          # e.g. "US", "AR", "DE" — ISO 3166-1 alpha-2

    # ------------------------------------------------------------------ #
    # 2. Implement fetch()                                                 #
    # All country-specific logic lives here and only here.                #
    # ------------------------------------------------------------------ #
    def fetch(self) -> list[RegionData]:
        """
        Fetch, clean, and return region data for this country.

        Guidelines:
        - Call your country's public APIs (requests / httpx recommended).
        - Use pandas for cleaning, aggregation, and derived metrics.
        - Return one RegionData per region per period.
        - Set `level` to the division level (e.g. "UF" / "municipio") and `period`
          to a STRING (e.g. "2022").
        - Group indicators by theme via add_indicator(theme, key, ...) using the
          vocabulary in CLAUDE.md section 13.
        - Attach geometry (GeoJSON Polygon/MultiPolygon) once per region; the SDK
          publishes it separately from indicator data.
        - Do NOT publish to RabbitMQ here — BaseWorker.run() does that.
        """

        regions: list[RegionData] = []

        # ---- Example: building one region ----
        #
        # raw = requests.get("https://api.example.gov/regions/01").json()
        # geo = requests.get("https://api.example.gov/geo/01").json()
        #
        # region = RegionData(
        #     country_code=self.COUNTRY_CODE,
        #     level="state",                 # opaque division level name
        #     code=raw["code"],              # e.g. "01"
        #     name=raw["name"],              # e.g. "Example State"
        #     period="2022",                 # always a string
        #     abbrev=raw.get("abbrev"),      # optional short code
        #     parent_code=None,              # set to the parent code for sub-regions
        #     source="Example National Statistics",
        #     geometry=geo,                  # GeoJSON Polygon / MultiPolygon
        # )
        # region.add_indicator(
        #     theme="demographics",          # one of the four themes
        #     key="population",              # from the shared vocabulary
        #     value=raw["population"],
        #     unit="people",
        #     year=2022,
        #     source="Example Census 2022",
        # )
        # region.add_indicator(
        #     theme="wealth",
        #     key="household_income_avg",
        #     value=raw["income"],
        #     unit="USD",
        #     year=2022,
        # )
        # regions.append(region)

        logger.warning(
            "TemplateWorker.fetch() is not implemented — returning empty list. "
            "Replace this class with your country-specific implementation."
        )
        return regions


if __name__ == "__main__":
    TemplateWorker(rabbitmq_url=os.getenv("RABBITMQ_URL")).run()
