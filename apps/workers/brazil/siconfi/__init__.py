"""SICONFI (Tesouro Nacional) data-collection package (fiscal → wealth theme).

Source-specific knowledge for the Tesouro's SICONFI API lives here only: a throttled REST
client (`client`, ≤1 req/s as the API strictly requires) and the pipeline that derives
fiscal-autonomy / transfer indicators per state from the RREO (`pipeline`).
"""

from .client import SiconfiClient, SiconfiError
from .pipeline import SiconfiPipeline

__all__ = ["SiconfiClient", "SiconfiError", "SiconfiPipeline"]
