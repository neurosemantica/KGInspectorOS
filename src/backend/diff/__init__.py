"""Core diff computation logic."""

from pyoxigraph import Store

from .pipeline import diff, diff_stats
from .bnode import match_bnodes_wl, apply_bnode_mapping
from .canonicalize import canonicalize
from .skolem import skolemize, deskolemize, is_skolem

__all__ = [
    "diff",
    "diff_stats",
    "match_bnodes_wl",
    "apply_bnode_mapping",
    "create_store",
    "canonicalize",
    "skolemize",
    "deskolemize",
    "is_skolem",
]


def create_store(path: str | None = None) -> Store:
    """Create RDF store - disk-backed if path provided."""
    return Store(path) if path else Store()
