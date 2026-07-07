"""Parse an RDF document into the ParsedGraph shape expected by the /api/parse endpoint."""

from __future__ import annotations

from typing import Any

from rdflib import Graph
from rdflib.term import BNode, Literal, URIRef

from ..utils import detect_format, extract_label, term_to_str


def parse_rdf(data: str, fmt: str | None = None) -> dict[str, Any]:
    """Parse RDF text into a ParsedGraph dict (nodes, edges, stats).

    Args:
        data: Raw RDF string in any format supported by rdflib.
        fmt:  Optional format hint (turtle, nt, nquads, xml, json-ld).

    Returns:
        Dict matching the frontend ParsedGraph type.
    """
    detected_fmt = detect_format(data, fmt)

    g = Graph()
    g.parse(data=data, format=detected_fmt)

    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    predicate_counts: dict[str, int] = {}

    def _node_type(term: URIRef | BNode | Literal) -> str:
        if isinstance(term, BNode):
            return "bnode"
        if isinstance(term, Literal):
            return "literal"
        return "uri"

    def _node_label(term: URIRef | BNode | Literal) -> str:
        if isinstance(term, BNode):
            return str(term)
        if isinstance(term, Literal):
            s = str(term)
            return s[:60] + "…" if len(s) > 60 else s
        return extract_label(str(term))

    def _ensure_node(term: URIRef | BNode | Literal) -> str:
        tid = term_to_str(term)
        if tid not in nodes:
            nodes[tid] = {
                "id": tid,
                "label": _node_label(term),
                "type": _node_type(term),
            }
        return tid

    for s, p, o in g:
        s_id = _ensure_node(s)
        o_id = _ensure_node(o)
        pred_uri = str(p)
        pred_label = extract_label(pred_uri)

        edges.append({
            "source": s_id,
            "target": o_id,
            "predicate": pred_uri,
            "predicate_label": pred_label,
        })
        predicate_counts[pred_uri] = predicate_counts.get(pred_uri, 0) + 1

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "predicate_counts": predicate_counts,
        },
    }
