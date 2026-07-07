"""Build GraphResponse from GraphDiff: nodes, edges, layout, and k-hop ego sampling."""

from __future__ import annotations

import math
from typing import Any

import networkx as nx

from ..types import GraphDiff
from ..utils import extract_label, is_bnode, is_uri

_STATUS_PRIORITY: dict[str, int] = {
    "node_renamed": 8,
    "subject_changed": 7,
    "compound_changed": 6,
    "predicate_changed": 5,
    "object_changed": 4,
    "literal_changed": 3,
    "relationship_added": 2,
    "relationship_deleted": 1,
}


def _add_node(
    nodes: dict[str, dict[str, Any]],
    term: str,
    status: str,
    change: dict[str, str] | None = None,
) -> None:
    """Insert or upgrade a node in the nodes dict."""
    priority = _STATUS_PRIORITY.get(status, 0)
    existing = nodes.get(term)
    if existing is None or _STATUS_PRIORITY.get(existing["status"], 0) < priority:
        nodes[term] = {
            "id": term,
            "status": status,
            "label": extract_label(term),
            "is_bnode": is_bnode(term),
            "is_literal": not (is_uri(term) or is_bnode(term)),
            "changes": existing["changes"] if existing and existing.get("changes") else [],
        }
    if change:
        nodes[term].setdefault("changes", []).append(change)


def _build_graph_elements(
    diff_result: GraphDiff,
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Convert GraphDiff change lists into node and edge dicts."""
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []

    for s, p, o in diff_result.triples_added:
        _add_node(nodes, s, "relationship_added")
        _add_node(nodes, o, "relationship_added")
        edges.append({"source": s, "target": o, "predicate": p, "status": "relationship_added"})

    for s, p, o in diff_result.triples_deleted:
        _add_node(nodes, s, "relationship_deleted")
        _add_node(nodes, o, "relationship_deleted")
        edges.append({"source": s, "target": o, "predicate": p, "status": "relationship_deleted"})

    for lc in diff_result.literal_changed:
        subj = lc["subject"]
        change = {"type": "literal_changed", "predicate": lc["predicate"], "old": lc["old"], "new": lc["new"]}
        _add_node(nodes, subj, "literal_changed", change)

    for sc in diff_result.subject_changed:
        change = {"type": "subject_changed", "predicate": sc["predicate"], "old": sc["old_subject"], "new": sc["new_subject"]}
        _add_node(nodes, sc["new_subject"], "subject_changed", change)
        _add_node(nodes, sc["object"], "subject_changed")
        edges.append({"source": sc["new_subject"], "target": sc["object"], "predicate": sc["predicate"], "status": "subject_changed"})

    for pc in diff_result.predicate_changed:
        change = {"type": "predicate_changed", "old": pc["old_predicate"], "new": pc["new_predicate"]}
        _add_node(nodes, pc["subject"], "predicate_changed", change)
        _add_node(nodes, pc["object"], "predicate_changed", change)
        edges.append({"source": pc["subject"], "target": pc["object"], "predicate": pc["new_predicate"], "status": "predicate_changed"})

    for oc in diff_result.object_changed:
        change = {"type": "object_changed", "predicate": oc["predicate"], "old": oc["old_object"], "new": oc["new_object"]}
        _add_node(nodes, oc["subject"], "object_changed", change)
        _add_node(nodes, oc["new_object"], "object_changed", change)
        edges.append({"source": oc["subject"], "target": oc["new_object"], "predicate": oc["predicate"], "status": "object_changed"})

    for cc in diff_result.compound_changed:
        old_s, old_p, old_o = cc["old_triple"]
        new_s, new_p, new_o = cc["new_triple"]
        change = {
            "type": "compound_changed",
            "old": f"{extract_label(old_s)} {extract_label(old_p)} {extract_label(old_o)}",
            "new": f"{extract_label(new_s)} {extract_label(new_p)} {extract_label(new_o)}",
        }
        _add_node(nodes, new_s, "compound_changed", change)
        _add_node(nodes, new_o, "compound_changed", change)
        edges.append({"source": new_s, "target": new_o, "predicate": new_p, "status": "compound_changed"})

    for rename in diff_result.node_renamed:
        change = {"type": "node_renamed", "old": rename["old"], "new": rename["new"]}
        _add_node(nodes, rename["old"], "node_renamed", change)
        _add_node(nodes, rename["new"], "node_renamed", change)
        edges.append({
            "source": rename["old"],
            "target": rename["new"],
            "predicate": "urn:kginspector:renamed_to",
            "status": "node_renamed",
            "is_rename_edge": True,
            "confidence": rename.get("confidence"),
            "evidence": rename.get("evidence", []),
        })

    return nodes, edges


def _ego_sample(
    nodes: dict[str, dict[str, Any]],
    edges: list[dict[str, Any]],
    diff_result: GraphDiff,
    max_nodes: int = 500,
    k: int = 2,
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], bool, int]:
    """K-hop neighborhood around focal changed nodes, capped at max_nodes."""
    original_count = len(nodes)
    if original_count <= max_nodes:
        return nodes, edges, False, original_count

    g: nx.Graph = nx.Graph()
    for node_id in nodes:
        g.add_node(node_id)
    for edge in edges:
        if edge["source"] in nodes and edge["target"] in nodes:
            g.add_edge(edge["source"], edge["target"])

    # Seed from most semantically important changed nodes
    focal: set[str] = set()
    for rename in diff_result.node_renamed:
        focal.update([rename["old"], rename["new"]])
    for sc in diff_result.subject_changed:
        focal.update([sc["old_subject"], sc["new_subject"]])
    for s, _p, _o in diff_result.triples_added[:200]:
        focal.add(s)
    for s, _p, _o in diff_result.triples_deleted[:200]:
        focal.add(s)

    reachable: set[str] = set(focal) & set(nodes)

    for node in list(focal):
        if node not in g:
            continue
        try:
            ego = nx.ego_graph(g, node, radius=k, undirected=True)
            reachable.update(ego.nodes())
        except Exception:
            pass
        if len(reachable) >= max_nodes:
            break

    sampled_ids = set(sorted(reachable)[:max_nodes])
    sampled_nodes = {k: v for k, v in nodes.items() if k in sampled_ids}
    sampled_edges = [e for e in edges if e["source"] in sampled_ids and e["target"] in sampled_ids]

    return sampled_nodes, sampled_edges, True, original_count


def _compute_layout(nodes: dict[str, dict[str, Any]], edges: list[dict[str, Any]]) -> dict[str, list[float]]:
    """Place nodes evenly on a circle as the initial seed for the frontend force simulation."""
    if not nodes:
        return {}

    node_ids = list(nodes.keys())
    n = len(node_ids)

    if n == 1:
        return {node_ids[0]: [0.5, 0.5]}

    raw_radius = (n * 45) / (2 * math.pi)
    norm_radius = min(0.38, max(0.05, raw_radius / (raw_radius + 200))) + 0.05

    return {
        nid: [
            round(0.5 + norm_radius * math.sin(2 * math.pi * i / n), 4),
            round(0.5 + norm_radius * math.cos(2 * math.pi * i / n), 4),
        ]
        for i, nid in enumerate(node_ids)
    }


def build_graph_response(diff_result: GraphDiff, max_nodes: int = 100_000) -> dict[str, Any]:
    """Convert a GraphDiff into the GraphResponse shape expected by the frontend."""
    nodes, edges = _build_graph_elements(diff_result)

    nodes, edges, sampled, original_node_count = _ego_sample(
        nodes, edges, diff_result, max_nodes
    )

    # Merge centrality data into node dicts
    for node_id, node in nodes.items():
        ci = diff_result.centrality.get(node_id)
        if ci is not None:
            node["bc_old"] = ci.bc_old
            node["bc_new"] = ci.bc_new
            node["bc_diff"] = ci.bc_diff
            node["bc_direction"] = ci.bc_direction

    positions = _compute_layout(nodes, edges)

    stats = {
        "node_renamed": len(diff_result.node_renamed),
        "subject_changed": len(diff_result.subject_changed),
        "predicate_changed": len(diff_result.predicate_changed),
        "object_changed": len(diff_result.object_changed),
        "compound_changed": len(diff_result.compound_changed),
        "literal_changed": len(diff_result.literal_changed),
        "relationship_added": len(diff_result.triples_added),
        "relationship_deleted": len(diff_result.triples_deleted),
        "is_empty": diff_result.is_empty,
    }

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "node_renamed": diff_result.node_renamed,
        "stats": stats,
        "positions": positions,
        "sampled": sampled,
        "original_node_count": original_node_count,
    }
