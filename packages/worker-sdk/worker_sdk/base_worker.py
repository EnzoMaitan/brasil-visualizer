"""
BaseWorker — abstract base class for all country workers.

A country worker only needs to:
  1. Set COUNTRY_CODE and REGION_TYPE as class attributes.
  2. Implement fetch() to return a list of RegionData.

Everything else (RabbitMQ connection, serialization, publishing, error handling,
retry logic) is handled here. Do NOT add country-specific logic to this file.
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

    Subclass this, set COUNTRY_CODE + REGION_TYPE, implement fetch(), done.
    """

    # Subclasses must set these
    COUNTRY_CODE: str = ""          # ISO 3166-1 alpha-2, e.g. "BR"
    REGION_TYPE: str = ""           # e.g. "state", "province", "department"

    EXCHANGE_NAME = "geodata"
    EXCHANGE_TYPE = "topic"
    ROUTING_KEY_TEMPLATE = "country.{country_code}.region"

    MAX_RETRIES = 3
    RETRY_DELAY = 5  # seconds

    def __init__(self, rabbitmq_url: str | None = None):
        if not self.COUNTRY_CODE:
            raise NotImplementedError(
                f"{self.__class__.__name__} must define COUNTRY_CODE"
            )
        if not self.REGION_TYPE:
            raise NotImplementedError(
                f"{self.__class__.__name__} must define REGION_TYPE"
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
        knowledge (API endpoints, field mapping, data cleaning) lives here.

        Returns a list of RegionData objects using the shared indicator vocabulary
        documented in CLAUDE.md section 13.
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
        """Publish all RegionData objects to the topic exchange, with retries."""
        routing_key = self.ROUTING_KEY_TEMPLATE.format(
            country_code=self.COUNTRY_CODE
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

                for region in regions:
                    channel.basic_publish(
                        exchange=self.EXCHANGE_NAME,
                        routing_key=routing_key,
                        body=json.dumps(region.to_dict()),
                        properties=pika.BasicProperties(
                            content_type="application/json",
                            delivery_mode=2,  # persistent
                        ),
                    )

                connection.close()
                logger.info(
                    "[%s] Published %d messages to exchange=%s routing_key=%s",
                    self.__class__.__name__,
                    len(regions),
                    self.EXCHANGE_NAME,
                    routing_key,
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
