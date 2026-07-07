"""Main diff pipeline using functional composition."""

import logging
from typing import Any

from expression import pipe, Result, Ok, Error
from pyoxigraph import NamedNode, RdfFormat, Store

from ..types import GraphDiff, DiffOptions, DiffError
from .canonicalize import canonicalize
from .skolem import skolemize
from .bnode import match_bnodes_wl, apply_bnode_mapping
from .compute import compute_diff_parallel, compute_bc_diff, count_triples
from .rename import detect_renames
from .utils import wl_fingerprint
from . import queries

logger = logging.getLogger(__name__)


def diff(
    old: str, 
    new: str, 
    options: DiffOptions | None = None
) -> GraphDiff:
    """Compute diff between two RDF sources.
    
    Pipeline:
    1. Canonicalize both graphs (RDFC-1.0)
    2. WL fingerprint pre-check (fast structural hash)
    3. Fast path check (identical strings = empty diff)
    4. Match bnodes via two-stage approach:
       - Stage 1: Weisfeiler-Lehman hashing (exact structural match)
       - Stage 2: Gromov-Wasserstein optimal transport (fuzzy match)
    5. Skolemize for stable identity in store
    6. Load to pyoxigraph store
    7. Compute diff via parallel SPARQL
    8. Detect renames and compute BC diff
    
    Args:
        old: Old RDF data (string content)
        new: New RDF data (string content)
        options: Diff computation options
        
    Returns:
        GraphDiff with all detected changes
    """
    opts = options or DiffOptions()
    
    result = pipe(
        (old, new),
        _canonicalize_both,
        _wl_fingerprint_check,
        _fast_path_check,
        lambda r: _match_and_remap_bnodes(r, opts),
        lambda r: _skolemize_and_load(r, opts),
        lambda r: _compute_and_analyze(r, opts),
    )
    
    if result.is_error():
        logger.warning("diff pipeline error (returning empty diff): %s", result)
    return result.default_value(GraphDiff())


def _canonicalize_both(
    data: tuple[str, str]
) -> Result[tuple[str, str], DiffError]:
    """Canonicalize both graphs."""
    old, new = data
    return canonicalize(old).bind(
        lambda old_nquads: canonicalize(new).map(
            lambda new_nquads: (old_nquads, new_nquads)
        )
    )


def _wl_fingerprint_check(
    result: Result[tuple[str, str], DiffError]
) -> Result[tuple[str, str] | GraphDiff, DiffError]:
    """Fast structural check using Weisfeiler-Lehman graph fingerprint.
    
    This catches isomorphic graphs even when string representations differ
    (e.g., different blank node naming). Much faster than full comparison.
    """
    def check(pair: tuple[str, str]) -> tuple[str, str] | GraphDiff:
        old_nquads, new_nquads = pair
        old_fp = wl_fingerprint(old_nquads)
        new_fp = wl_fingerprint(new_nquads)
        
        if old_fp == new_fp and old_fp:
            logger.debug("WL fingerprints match — graphs are isomorphic (fp=%s)", old_fp[:12])
            return GraphDiff()  # Empty diff - graphs are isomorphic
        
        logger.debug("WL fingerprints differ — proceeding with full diff")
        return pair
    
    return result.map(check)


def _fast_path_check(
    result: Result[tuple[str, str] | GraphDiff, DiffError]
) -> Result[tuple[str, str] | GraphDiff, DiffError]:
    """Short-circuit if graphs are identical (string comparison)."""
    def check(data: tuple[str, str] | GraphDiff) -> tuple[str, str] | GraphDiff:
        # Already resolved (WL check)
        if isinstance(data, GraphDiff):
            return data
        
        old_nquads, new_nquads = data
        if old_nquads == new_nquads:
            logger.debug("fast-path: canonicalized strings are identical")
            return GraphDiff()  # Empty diff - graphs are identical
        return data
    return result.map(check)


def _match_and_remap_bnodes(
    result: Result[tuple[str, str] | GraphDiff, DiffError],
    opts: DiffOptions
) -> Result[tuple[str, str] | GraphDiff, DiffError]:
    """Match bnodes using two-stage approach: WL hashing + Gromov-Wasserstein."""
    def do_match(data: tuple[str, str] | GraphDiff) -> tuple[str, str] | GraphDiff:
        if isinstance(data, GraphDiff):
            return data
        
        old_nquads, new_nquads = data
        
        if "_:" not in old_nquads or "_:" not in new_nquads:
            return (old_nquads, new_nquads)
        
        match_result = match_bnodes_wl(old_nquads, new_nquads, options=opts)
        mapping = match_result.default_value({})
        logger.debug("bnode mapping: %d pairs", len(mapping))
        
        if mapping:
            remapped = apply_bnode_mapping(new_nquads, mapping)
            if old_nquads == remapped:
                logger.debug("graphs identical after bnode remapping")
                return GraphDiff()  # Empty diff after remapping
            return (old_nquads, remapped)
        
        return (old_nquads, new_nquads)
    
    return result.map(do_match)


def _skolemize_and_load(
    result: Result[tuple[str, str] | GraphDiff, DiffError],
    opts: DiffOptions
) -> Result[tuple[Any, GraphDiff | None], DiffError]:
    """Skolemize and load to store."""
    def do_load(data: tuple[str, str] | GraphDiff) -> tuple[Any, GraphDiff | None]:
        if isinstance(data, GraphDiff):
            return (None, data)
        
        old_nquads, new_nquads = data
        old_skolem = skolemize(old_nquads)
        new_skolem = skolemize(new_nquads)
        
        store = Store(opts.store_path) if opts.store_path else Store()
        old_graph = NamedNode("urn:diff:old")
        new_graph = NamedNode("urn:diff:new")
        store.load(old_skolem.encode(), RdfFormat.N_TRIPLES, to_graph=old_graph)
        store.load(new_skolem.encode(), RdfFormat.N_TRIPLES, to_graph=new_graph)
        store.optimize()
        
        return (store, None)
    
    return result.map(do_load)


def _compute_and_analyze(
    result: Result[tuple[Any, GraphDiff | None], DiffError],
    opts: DiffOptions
) -> Result[GraphDiff, DiffError]:
    """Compute diff using parallel SPARQL and run analysis."""
    def do_compute(data: tuple[Any, GraphDiff | None]) -> GraphDiff:
        store, early_diff = data
        if early_diff is not None:
            return early_diff
        
        diff_result = compute_diff_parallel(store, opts)
        
        if diff_result.triples_added or diff_result.triples_deleted:
            diff_result.node_renamed = detect_renames(
                diff_result.triples_added, diff_result.triples_deleted, store, opts.rename_limit
            )
        
        if opts.compute_bc:
            diff_result.centrality = compute_bc_diff(store, diff_result)
        
        return diff_result
    
    return result.map(do_compute)


def diff_stats(old: str, new: str, store_path: str | None = None) -> dict:
    """Get diff statistics without full computation (faster for large graphs)."""
    store = Store(store_path) if store_path else Store()
    old_result = canonicalize(old)
    new_result = canonicalize(new)
    
    if old_result.is_error() or new_result.is_error():
        return {"error": "Could not canonicalize graphs"}
    
    old_nq = old_result.default_value("")
    new_nq = new_result.default_value("")
    
    old_skolem = skolemize(old_nq)
    new_skolem = skolemize(new_nq)
    store.load(old_skolem.encode(), RdfFormat.N_TRIPLES, to_graph=NamedNode("urn:diff:old"))
    store.load(new_skolem.encode(), RdfFormat.N_TRIPLES, to_graph=NamedNode("urn:diff:new"))
    store.optimize()
    
    old_count = count_triples(store, "urn:diff:old")
    new_count = count_triples(store, "urn:diff:new")
    
    added_count = int(list(store.query(queries.count_triples_added()))[0]["c"].value)
    deleted_count = int(list(store.query(queries.count_triples_deleted()))[0]["c"].value)
    
    # Cap queries for speed
    subject_changed_count = len(list(store.query(queries.subject_changed(1000))))
    predicate_changed_count = len(list(store.query(queries.predicate_changed(1000))))
    object_changed_count = len(list(store.query(queries.object_changed(1000))))
    
    return {
        "old_triples": old_count,
        "new_triples": new_count,
        "triples_added": added_count,
        "triples_deleted": deleted_count,
        "subject_changed": subject_changed_count,
        "predicate_changed": predicate_changed_count,
        "object_changed": object_changed_count,
    }
