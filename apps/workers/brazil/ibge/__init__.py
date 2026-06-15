"""IBGE data-collection package for the Brazil worker.

All Brazil/IBGE-specific knowledge lives here: the SIDRA HTTP client (`client`), the
verified table/variable catalogue and UF reference (`reference`), and the fetch →
pandas → RegionData pipeline (`pipeline`).
"""

from .client import SidraClient, SidraError
from .pipeline import IbgePipeline

__all__ = ["SidraClient", "SidraError", "IbgePipeline"]
