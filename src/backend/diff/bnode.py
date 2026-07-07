"""Two-stage blank node matching: WL hashing + Gromov-Wasserstein optimal transport.

Stage 1: Weisfeiler-Lehman subgraph hashes for exact structural matches (fast).
Stage 2: Fused Gromov-Wasserstein for remaining unmatched bnodes (accurate).

No regex - uses rdflib for parsing.
"""

import logging
from collections import defaultdict
from typing import NamedTuple

import networkx as nx
import numpy as np
from expression import Result, Ok, Error
from scipy.optimize import linear_sum_assignment

from ..types import MatchError, BNodeMapping, DiffOptions
from .utils import parse_nquads_to_graph, _adaptive_iterations, _WL_DIGEST_SIZE

logger = logging.getLogger(__name__)

_ot_gromov = None


def _get_ot_gromov():
    global _ot_gromov
    if _ot_gromov is None:
        try:
            from ot import gromov as _gromov
            _ot_gromov = _gromov
        except ImportError:
            raise ImportError(
                "POT (Python Optimal Transport) is required for Gromov-Wasserstein matching. "
                "Install it with: pip install POT"
            )
    return _ot_gromov


class MatchResult(NamedTuple):
    """Result of bnode matching with metadata."""
    mapping: BNodeMapping
    matched_old: set[str]
    matched_new: set[str]
    unmatched_old: set[str]
    unmatched_new: set[str]


def match_bnodes_wl(
    old_nquads: str,
    new_nquads: str,
    wl_iterations: int | None = None,
    options: DiffOptions | None = None,
) -> Result[BNodeMapping, MatchError]:
    """Match blank nodes using two-stage approach: WL hashing then Gromov-Wasserstein.
    
    Stage 1: Weisfeiler-Lehman subgraph hashes for exact structural matches.
    Stage 2: Fused Gromov-Wasserstein optimal transport for remaining bnodes.
    
    Args:
        old_nquads: Canonicalized N-Quads from old graph
        new_nquads: Canonicalized N-Quads from new graph
        wl_iterations: Number of WL refinement iterations (default 3)
        options: Diff options controlling GW behavior
    
    Returns:
        Ok(mapping) where mapping is {new_bnode: old_bnode}
        Error(MatchError) on failure
    """
    opts = options or DiffOptions()
    
    try:
        old_graph, old_bnodes = parse_nquads_to_graph(old_nquads, bnode_prefix="old_")
        new_graph, new_bnodes = parse_nquads_to_graph(new_nquads, bnode_prefix="new_")
        
        if not old_bnodes or not new_bnodes:
            return Ok({})
        
        old_hashes = _compute_wl_hashes(old_graph, wl_iterations)
        new_hashes = _compute_wl_hashes(new_graph, wl_iterations)
        wl_result = _match_by_hash(old_bnodes, new_bnodes, old_hashes, new_hashes)
        logger.debug("WL bnode matching: exact=%d, unmatched_old=%d, unmatched_new=%d",
                     len(wl_result.mapping), len(wl_result.unmatched_old), len(wl_result.unmatched_new))

        final_mapping = dict(wl_result.mapping)
        if opts.bnode_gw_enabled and wl_result.unmatched_old and wl_result.unmatched_new:
            gw_mapping = _match_by_gromov_wasserstein(
                old_graph, new_graph,
                wl_result.unmatched_old, wl_result.unmatched_new,
                alpha=opts.bnode_gw_alpha,
                threshold=opts.bnode_gw_threshold,
            )
            logger.debug("GW bnode matching: fuzzy=%d", len(gw_mapping))
            final_mapping.update(gw_mapping)

        result_mapping = _convert_mapping(final_mapping)
        logger.debug("bnode match_bnodes_wl total pairs: %d", len(result_mapping))
        return Ok(result_mapping)
        
    except ImportError:
        return Ok(_convert_mapping(wl_result.mapping) if 'wl_result' in locals() else {})
    except Exception as e:
        return Error(MatchError(f"Blank node matching failed: {e}"))


def _compute_wl_hashes(graph: nx.DiGraph, iterations: int | None = None) -> dict[str, str]:
    """Compute Weisfeiler-Lehman subgraph hashes for all nodes."""
    n = graph.number_of_nodes()
    if n == 0:
        return {}

    if iterations is None:
        iterations = _adaptive_iterations(n)

    wl_dict = nx.weisfeiler_lehman_subgraph_hashes(
        graph,
        iterations=iterations,
        edge_attr="predicate",
        node_attr="label",
        digest_size=_WL_DIGEST_SIZE,
    )
    return {node: hashes[-1] for node, hashes in wl_dict.items() if hashes}


def _match_by_hash(
    old_bnodes: set[str],
    new_bnodes: set[str],
    old_hashes: dict[str, str],
    new_hashes: dict[str, str],
) -> MatchResult:
    """Match bnodes with identical WL hashes (exact structural match).
    
    Returns MatchResult with mapping and unmatched bnodes for Stage 2.
    """
    mapping: BNodeMapping = {}
    matched_old: set[str] = set()
    matched_new: set[str] = set()
    
    old_by_hash: dict[str, list[str]] = defaultdict(list)
    new_by_hash: dict[str, list[str]] = defaultdict(list)
    
    for bn in old_bnodes:
        if bn in old_hashes:
            old_by_hash[old_hashes[bn]].append(bn)
    
    for bn in new_bnodes:
        if bn in new_hashes:
            new_by_hash[new_hashes[bn]].append(bn)
    
    for hash_val, old_list in old_by_hash.items():
        if hash_val in new_by_hash:
            new_list = new_by_hash[hash_val]
            # Only match if cardinality matches (1-to-1 for unique, or same count)
            if len(old_list) == len(new_list):
                for old_bn, new_bn in zip(sorted(old_list), sorted(new_list)):
                    mapping[new_bn] = old_bn
                    matched_old.add(old_bn)
                    matched_new.add(new_bn)
    
    return MatchResult(
        mapping=mapping,
        matched_old=matched_old,
        matched_new=matched_new,
        unmatched_old=old_bnodes - matched_old,
        unmatched_new=new_bnodes - matched_new,
    )


def _match_by_gromov_wasserstein(
    old_graph: nx.DiGraph,
    new_graph: nx.DiGraph,
    old_bnodes: set[str],
    new_bnodes: set[str],
    alpha: float = 0.5,
    threshold: float = 0.3,
) -> BNodeMapping:
    """Match remaining bnodes using Fused Gromov-Wasserstein optimal transport.
    
    Fused GW balances:
    - Structural similarity (adjacency patterns)
    - Feature similarity (predicate signatures)
    
    Args:
        old_graph: NetworkX graph for old version
        new_graph: NetworkX graph for new version
        old_bnodes: Unmatched bnodes from old graph
        new_bnodes: Unmatched bnodes from new graph
        alpha: Balance between features (1) and structure (0), default 0.5
        threshold: Minimum transport weight to accept match (0-1)
    
    Returns:
        Mapping {new_bnode: old_bnode} for GW-matched bnodes
    """
    gromov = _get_ot_gromov()
    
    old_list = sorted(old_bnodes)
    new_list = sorted(new_bnodes)
    n_old = len(old_list)
    n_new = len(new_list)
    
    if n_old == 0 or n_new == 0:
        return {}
    
    adj_old = _build_adjacency_matrix(old_graph, old_list)
    adj_new = _build_adjacency_matrix(new_graph, new_list)
    cross_cost = _build_feature_cost_matrix(old_graph, new_graph, old_list, new_list)
    
    mu = np.ones(n_old) / n_old
    nu = np.ones(n_new) / n_new
    
    if n_old < n_new:
        pad_size = n_new - n_old
        adj_old = np.pad(adj_old, ((0, pad_size), (0, pad_size)), constant_values=0)
        cross_cost = np.pad(cross_cost, ((0, pad_size), (0, 0)), constant_values=1)
        mu = np.ones(n_new) / n_new
    elif n_new < n_old:
        pad_size = n_old - n_new
        adj_new = np.pad(adj_new, ((0, pad_size), (0, pad_size)), constant_values=0)
        cross_cost = np.pad(cross_cost, ((0, 0), (0, pad_size)), constant_values=1)
        nu = np.ones(n_old) / n_old
    
    try:
        T, log = gromov.fused_gromov_wasserstein(
            M=cross_cost,
            C1=adj_old,
            C2=adj_new,
            p=mu,
            q=nu,
            loss_fun='square_loss',
            alpha=alpha,
            armijo=True,
            log=True,
        )
    except Exception:
        T, log = gromov.fused_gromov_wasserstein(
            M=cross_cost,
            C1=adj_old,
            C2=adj_new,
            p=mu,
            q=nu,
            loss_fun='square_loss',
            alpha=alpha,
            armijo=False,
            log=True,
        )
    
    # Negate T because linear_sum_assignment minimizes cost
    row_ind, col_ind = linear_sum_assignment(-T[:n_old, :n_new])
    
    mapping: BNodeMapping = {}
    for i, j in zip(row_ind, col_ind):
        if T[i, j] >= threshold / max(n_old, n_new):
            mapping[new_list[j]] = old_list[i]
    
    return mapping


def _build_adjacency_matrix(graph: nx.DiGraph, nodes: list[str]) -> np.ndarray:
    """Build adjacency matrix for subgraph induced by nodes."""
    n = len(nodes)
    node_idx = {node: i for i, node in enumerate(nodes)}
    adj = np.zeros((n, n), dtype=np.float64)
    
    for i, node in enumerate(nodes):
        for neighbor in graph.successors(node):
            if neighbor in node_idx:
                adj[i, node_idx[neighbor]] = 1.0
        for neighbor in graph.predecessors(node):
            if neighbor in node_idx:
                adj[node_idx[neighbor], i] = 1.0
    
    return adj


def _build_feature_cost_matrix(
    old_graph: nx.DiGraph,
    new_graph: nx.DiGraph,
    old_nodes: list[str],
    new_nodes: list[str],
) -> np.ndarray:
    """Build feature cost matrix based on predicate signature similarity.
    
    Feature = set of (predicate, direction) pairs for each bnode.
    Cost = 1 - Jaccard similarity.
    """
    def get_signature(graph: nx.DiGraph, node: str) -> set[tuple[str, str]]:
        """Get predicate signature: set of (predicate, direction) tuples."""
        sig: set[tuple[str, str]] = set()
        for _, target, data in graph.out_edges(node, data=True):
            sig.add((data.get('predicate', ''), 'out'))
        for source, _, data in graph.in_edges(node, data=True):
            sig.add((data.get('predicate', ''), 'in'))
        return sig
    
    old_sigs = [get_signature(old_graph, n) for n in old_nodes]
    new_sigs = [get_signature(new_graph, n) for n in new_nodes]
    
    n_old = len(old_nodes)
    n_new = len(new_nodes)
    cost = np.ones((n_old, n_new), dtype=np.float64)
    
    for i, sig_old in enumerate(old_sigs):
        for j, sig_new in enumerate(new_sigs):
            if sig_old or sig_new:
                intersection = len(sig_old & sig_new)
                union = len(sig_old | sig_new)
                jaccard = intersection / union if union > 0 else 0
                cost[i, j] = 1.0 - jaccard
    
    return cost


def _convert_mapping(mapping: BNodeMapping) -> BNodeMapping:
    """Convert prefixed bnode IDs back to original format."""
    return {
        new_id.replace("_:new_", "_:"): old_id.replace("_:old_", "_:")
        for new_id, old_id in mapping.items()
    }


def apply_bnode_mapping(nquads: str, mapping: BNodeMapping) -> str:
    """Apply blank node mapping to N-Quads string.
    
    Replaces new graph's bnode IDs with corresponding old graph's IDs.
    """
    if not mapping:
        return nquads
    
    result = nquads
    for new_id, old_id in mapping.items():
        result = result.replace(new_id, old_id)
    
    return result
