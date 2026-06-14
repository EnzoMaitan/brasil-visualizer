"""
_template worker — copy this directory to apps/workers/{country_name}/ to add a country.

Steps:
  1. Set COUNTRY_CODE to the ISO 3166-1 alpha-2 code for your country.
  2. Set REGION_TYPE to the administrative division type (state/province/department/...).
  3. Implement fetch() — call your country's public APIs and return List[RegionData].
  4. Use indicator keys from the shared vocabulary in CLAUDE.md section 13.
  5. Add docker-compose.{country}.yml following the Brazil example.
  6. Add i18n translations for any new indicator keys.

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
    # 1. Set these two class attributes for your country                  #
    # ------------------------------------------------------------------ #
    COUNTRY_CODE = "XX"          # e.g. "US", "AR", "DE" — ISO 3166-1 alpha-2
    REGION_TYPE  = "state"       # "state" | "province" | "department" | "canton" | ...

    # ------------------------------------------------------------------ #
    # 2. Implement fetch()                                                 #
    # All country-specific logic lives here and only here.                #
    # ------------------------------------------------------------------ #
    def fetch(self) -> list[RegionData]:
        """
        Fetch, clean, and return region data for this country.

        Guidelines:
        - Call your country's public APIs (requests / httpx recommended).
        - Use pandas for data cleaning if needed.
        - Return one RegionData per administrative region.
        - Use add_indicator() with keys from the shared vocabulary (CLAUDE.md §13).
        - Always include geometry (GeoJSON Polygon or MultiPolygon).
        - Do NOT publish to RabbitMQ here — BaseWorker.run() does that.
        """

        regions: list[RegionData] = []

        # ---- Example: fetching two fake regions ----
        #
        # raw_regions = requests.get("https://api.example.gov/regions").json()
        # geo_data    = requests.get("https://api.example.gov/geo").json()
        #
        # for raw in raw_regions:
        #     region = RegionData(
        #         country_code=self.COUNTRY_CODE,
        #         region_type=self.REGION_TYPE,
        #         region_code=raw["code"],
        #         region_name=raw["name"],
        #         source="Example National Statistics",
        #         geometry=geo_data[raw["code"]],
        #     )
        #     region.add_indicator(
        #         key="population",          # from shared vocabulary
        #         value=raw["population"],
        #         unit="people",
        #         year=2023,
        #         source="Example Census 2023",
        #     )
        #     region.add_indicator(
        #         key="gdp_usd",
        #         value=raw["gdp_usd"],
        #         unit="USD",
        #         year=2022,
        #     )
        #     regions.append(region)

        logger.warning(
            "TemplateWorker.fetch() is not implemented — returning empty list. "
            "Replace this class with your country-specific implementation."
        )
        return regions


if __name__ == "__main__":
    TemplateWorker(rabbitmq_url=os.getenv("RABBITMQ_URL")).run()
