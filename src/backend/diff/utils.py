"""Utilities for diff operations."""

import math

import networkx as nx
from rdflib import Graph
from rdflib.term import BNode, Literal

__all__ = ["parse_nquads_to_graph", "wl_fingerprint", "_adaptive_iterations"]

_BNODE_LABEL = "_"
_PRED_SEP = "\x00"
_WL_DIGEST_SIZE = 32


def parse_nquads_to_graph(nquads: str, bnode_prefix: str = "") -> tuple[nx.DiGraph, set[str]]:
    """Parse N-Quads to NetworkX DiGraph using rdflib.

    Handles RDF multi-edges (multiple predicates between the same S-O pair)
    by accumulating them into a sorted, NUL-separated predicate string on
    the single DiGraph edge. Node ``label`` attributes carry identity:
    blank nodes get a generic marker so structurally-identical bnodes hash
    equally; URIs keep their string value; Literals use their full N3
    representation (preserving datatype / language tag).

    Args:
        nquads: N-Quads string content
        bnode_prefix: Optional prefix to add to blank node IDs (e.g., "old_", "new_")

    Returns:
        Tuple of (NetworkX DiGraph with predicate edge attributes, set of bnode IDs)
    """
    g = Graph()
    g.parse(data=nquads, format="nquads")

    nx_graph = nx.DiGraph()
    bnodes: set[str] = set()
    labels: dict[str, str] = {}

    for s, p, o in g:
        s_id = _term_to_id(s, bnode_prefix)
        o_id = _term_to_id(o, bnode_prefix)

        if isinstance(s, BNode):
            bnodes.add(s_id)
        if isinstance(o, BNode):
            bnodes.add(o_id)

        pred = str(p)
        if nx_graph.has_edge(s_id, o_id):
            existing = nx_graph[s_id][o_id]["predicate"]
            preds = set(existing.split(_PRED_SEP))
            preds.add(pred)
            nx_graph[s_id][o_id]["predicate"] = _PRED_SEP.join(sorted(preds))
        else:
            nx_graph.add_edge(s_id, o_id, predicate=pred)

        if s_id not in labels:
            labels[s_id] = _term_to_label(s)
        if o_id not in labels:
            labels[o_id] = _term_to_label(o)

    for node in nx_graph.nodes():
        nx_graph.nodes[node]["label"] = labels.get(node, str(node))

    return nx_graph, bnodes


def _term_to_id(term, prefix: str = "") -> str:
    """Convert RDF term to string ID (internal)."""
    if isinstance(term, BNode):
        return f"_:{prefix}{term}" if prefix else f"_:{term}"
    return str(term)


def _term_to_label(term) -> str:
    """Rich label for WL hashing.

    BNodes → generic marker (structural equivalence regardless of name).
    Literals → full N3 form (preserves datatype / language tag).
    URIs → plain string.
    """
    if isinstance(term, BNode):
        return _BNODE_LABEL
    if isinstance(term, Literal):
        return term.n3()
    return str(term)


def _adaptive_iterations(n: int) -> int:
    """Choose WL iteration count scaled to graph size.

    Larger graphs need more iterations for neighbourhood information
    to propagate across the full diameter.  Capped at 10 to keep
    the pre-check fast.
    """
    if n <= 1:
        return 1
    return min(max(3, math.ceil(math.log2(n))), 10)


def wl_fingerprint(nquads: str, iterations: int | None = None) -> str:
    """Compute Weisfeiler-Lehman graph fingerprint for fast isomorphism check.

    When *iterations* is ``None`` (the default), an adaptive count is
    chosen based on graph size so that larger graphs get more refinement
    rounds.

    Uses the v3.5+ directed-graph aggregation that separates successor
    and predecessor neighbourhoods (NetworkX issue #7806 / PR #7834).

    Args:
        nquads: N-Quads string content
        iterations: Explicit WL iterations; ``None`` for adaptive.

    Returns:
        Hex hash string representing the graph structure, or ``""`` for empty graphs.
    """
    g, _ = parse_nquads_to_graph(nquads)
    n = g.number_of_nodes()
    if n == 0:
        return ""

    if iterations is None:
        iterations = _adaptive_iterations(n)

    # NetworkX WL hash encodes labels as ASCII internally; sanitise all
    # node/edge attributes to avoid UnicodeEncodeError on non-ASCII literals.
    for _n, data in g.nodes(data=True):
        if "label" in data:
            data["label"] = data["label"].encode("ascii", errors="replace").decode("ascii")
    for _u, _v, data in g.edges(data=True):
        if "predicate" in data:
            data["predicate"] = data["predicate"].encode("ascii", errors="replace").decode("ascii")

    return nx.weisfeiler_lehman_graph_hash(
        g,
        iterations=iterations,
        edge_attr="predicate",
        node_attr="label",
        digest_size=_WL_DIGEST_SIZE,
    )
