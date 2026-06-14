"""
BaseWorker — abstract base class for all country workers.

A country worker only needs to:
  1. Set COUNTRY_CODE as a class attribute.
  2. Implement fetch() to return a list of RegionData.

Everything else (RabbitMQ connection, serialization, publishing, retry logic) is handled
here. Each RegionData is split into wire messages and published on two routing keys:

  * country.{CODE}.geometry  -> region polygons      (geometry.schema.json)
  * country.{CODE}.region    -> per-theme indicators  (region.schema.json)

Do NOT add country-specific logic to this file.
"""

import json
import logging
import os
import time
from abc import ABC, abstractmethod
from typing import List

import pika
import pika.exceptions

from .models import RegionData

logger = logging.getLogger(__name__)


class BaseWorker(ABC):
    """
    Abstract base for all country data workers.

    Subclass this, set COUNTRY_CODE, implement fetch(), done.
    """

    # Subclasses must set this
    COUNTRY_CODE: str = ""          # ISO 3166-1 alpha-2, e.g. "BR"

    EXCHANGE_NAME = "geodata"
    EXCHANGE_TYPE = "topic"
    GEOMETRY_ROUTING_KEY = "country.{country_code}.geometry"
    INDICATOR_ROUTING_KEY = "country.{country_code}.region"

    MAX_RETRIES = 3
    RETRY_DELAY = 5  # seconds

    def __init__(self, rabbitmq_url: str | None = None):
        if not self.COUNTRY_CODE:
            raise NotImplementedError(
                f"{self.__class__.__name__} must define COUNTRY_CODE"
            )

        self.rabbitmq_url = rabbitmq_url or os.getenv(
            "RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    @abstractmethod
    def fetch(self) -> List[RegionData]:
        """
        Fetch, clean, and return all region data for this country.

        This is the ONLY method a worker needs to implement. All country-specific
        knowledge (API endpoints, field mapping, data cleaning, derived metrics) lives
        here. Return one RegionData per region per period, grouping indicators by theme
        with the vocabulary documented in CLAUDE.md section 13.
        """
        ...

    def run(self) -> None:
        """Entry point. Fetch data, then publish to RabbitMQ."""
        logger.info(
            "[%s] Starting worker (country=%s)",
            self.__class__.__name__,
            self.COUNTRY_CODE,
        )

        data = self.fetch()
        logger.info("[%s] Fetched %d regions", self.__class__.__name__, len(data))

        self._publish(data)
        logger.info("[%s] Done.", self.__class__.__name__)

    # ------------------------------------------------------------------
    # Internal — do not override unless you have a strong reason
    # ------------------------------------------------------------------

    def _publish(self, regions: List[RegionData]) -> None:
        """Publish geometry + per-theme indicator messages, with connection retries."""
        geometry_key = self.GEOMETRY_ROUTING_KEY.format(country_code=self.COUNTRY_CODE)
        indicator_key = self.INDICATOR_ROUTING_KEY.format(country_code=self.COUNTRY_CODE)
        props = pika.BasicProperties(
            content_type="application/json",
            delivery_mode=2,  # persistent
        )

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                connection = pika.BlockingConnection(
                    pika.URLParameters(self.rabbitmq_url)
                )
                channel = connection.channel()
                channel.exchange_declare(
                    exchange=self.EXCHANGE_NAME,
                    exchange_type=self.EXCHANGE_TYPE,
                    durable=True,
                )

                geometry_count = 0
                indicator_count = 0
                for region in regions:
                    geometry_msg = region.geometry_message()
                    if geometry_msg is not None:
                        channel.basic_publish(
                            exchange=self.EXCHANGE_NAME,
                            routing_key=geometry_key,
                            body=json.dumps(geometry_msg),
                            properties=props,
                        )
                        geometry_count += 1

                    for indicator_msg in region.indicator_messages():
                        channel.basic_publish(
                            exchange=self.EXCHANGE_NAME,
                            routing_key=indicator_key,
                            body=json.dumps(indicator_msg),
                            properties=props,
                        )
                        indicator_count += 1

                connection.close()
                logger.info(
                    "[%s] Published %d geometry + %d indicator messages "
                    "to exchange=%s (keys: %s, %s)",
                    self.__class__.__name__,
                    geometry_count,
                    indicator_count,
                    self.EXCHANGE_NAME,
                    geometry_key,
                    indicator_key,
                )
                return

            except pika.exceptions.AMQPConnectionError as exc:
                logger.warning(
                    "[%s] RabbitMQ connection failed (attempt %d/%d): %s",
                    self.__class__.__name__,
                    attempt,
                    self.MAX_RETRIES,
                    exc,
                )
                if attempt < self.MAX_RETRIES:
                    time.sleep(self.RETRY_DELAY)
                else:
                    raise
