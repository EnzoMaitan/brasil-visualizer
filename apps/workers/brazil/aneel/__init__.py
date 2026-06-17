"""ANEEL data-collection package (energy generation → infrastructure theme).

Source-specific knowledge for ANEEL's SIGA dataset lives here only: the CKAN client that
resolves + downloads the generation CSV (`client`) and the pandas pipeline that aggregates
installed capacity and the energy mix per UF (`pipeline`).
"""

from .client import AneelClient, AneelError
from .pipeline import AneelPipeline

__all__ = ["AneelClient", "AneelError", "AneelPipeline"]
