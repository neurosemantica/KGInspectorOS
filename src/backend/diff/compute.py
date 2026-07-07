"""SPARQL-based diff computation with parallel execution."""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import networkx as nx
from pyoxigraph import Store, BlankNode, Literal, NamedNode

from ..types import GraphDiff, DiffOptions, CentralityInfo
from .normalize import normalize_uri, normalize_literal
from .skolem import deskolemize
from ..utils import is_uri
from . import queries

logger = logging.getLogger(__name__)


def _to_value(term: Any) -> str:
    """Extract string value from RDF term, deskolemizing if needed."""
    if isinstance(term, BlankNode):
        return f"_:{term.value}"
    value = term.value if hasattr(term, "value") else str(term)
    return deskolemize(value)


def _get_datatype(term: Any) -> str | None:
    """Get datatype URI from literal term."""
    if isinstance(term, Literal) and term.datatype:
        return term.datatype.value
    return None


def _normalize_triple(s: str, p: str, o: str) -> tuple[str, str, str]:
    """Normalize URIs in a triple."""
    s = normalize_uri(s) if is_uri(s) else s
    p = normalize_uri(p)
    o = normalize_uri(o) if is_uri(o) else o
    return s, p, o


def count_triples(store: Store, graph_uri: str) -> int:
    """Count triples in a named graph."""
    return sum(1 for _ in store.quads_for_pattern(None, None, None, NamedNode(graph_uri)))


def compute_diff_parallel(store: Store, options: DiffOptions) -> GraphDiff:
    """Compute diff via parallel SPARQL queries for improved performance.
    
    Runs independent queries concurrently using ThreadPoolExecutor.
    Typically 2-4x faster than sequential execution.
    """
    
    def query_added():
        return [
            _normalize_triple(_to_value(r["s"]), _to_value(r["p"]), _to_value(r["o"]))
            for r in store.query(queries.triples_added(options.limit))
        ]
    
    def query_deleted():
        return [
            _normalize_triple(_to_value(r["s"]), _to_value(r["p"]), _to_value(r["o"]))
            for r in store.query(queries.triples_deleted(options.limit))
        ]
    
    def query_literal_changed():
        results = []
        for r in store.query(queries.literal_changed(options.limit)):
            old_val = _to_value(r["old"])
            new_val = _to_value(r["new"])
            old_dt = _get_datatype(r["old"])
            new_dt = _get_datatype(r["new"])
            
            if normalize_literal(old_val, old_dt) == normalize_literal(new_val, new_dt):
                continue
            
            s = _to_value(r["s"])
            results.append({
                "subject": normalize_uri(s) if is_uri(s) else s,
                "predicate": _to_value(r["p"]),
                "old": old_val,
                "new": new_val,
            })
        return results
    
    def query_subject_changed():
        results = []
        for r in store.query(queries.subject_changed(options.limit)):
            old_subj = _to_value(r["old_subj"])
            new_subj = _to_value(r["new_subj"])
            pred = _to_value(r["pred"])
            obj = _to_value(r["obj"])
            results.append({
                "old_subject": normalize_uri(old_subj) if is_uri(old_subj) else old_subj,
                "new_subject": normalize_uri(new_subj) if is_uri(new_subj) else new_subj,
                "predicate": normalize_uri(pred),
                "object": normalize_uri(obj) if is_uri(obj) else obj,
            })
        return results
    
    def query_predicate_changed():
        results = []
        for r in store.query(queries.predicate_changed(options.limit)):
            subj = _to_value(r["subj"])
            old_pred = _to_value(r["old_pred"])
            new_pred = _to_value(r["new_pred"])
            obj = _to_value(r["obj"])
            results.append({
                "subject": normalize_uri(subj) if is_uri(subj) else subj,
                "old_predicate": normalize_uri(old_pred),
                "new_predicate": normalize_uri(new_pred),
                "object": normalize_uri(obj) if is_uri(obj) else obj,
            })
        return results
    
    def query_object_changed():
        results = []
        for r in store.query(queries.object_changed(options.limit)):
            subj = _to_value(r["subj"])
            pred = _to_value(r["pred"])
            old_obj = _to_value(r["old_obj"])
            new_obj = _to_value(r["new_obj"])
            results.append({
                "subject": normalize_uri(subj) if is_uri(subj) else subj,
                "predicate": normalize_uri(pred),
                "old_object": normalize_uri(old_obj),
                "new_object": normalize_uri(new_obj),
            })
        return results
    
    with ThreadPoolExecutor(max_workers=6) as executor:
        future_added = executor.submit(query_added)
        future_deleted = executor.submit(query_deleted)
        future_literal = executor.submit(query_literal_changed)
        future_subject = executor.submit(query_subject_changed)
        future_predicate = executor.submit(query_predicate_changed)
        future_object = executor.submit(query_object_changed)
        
        triples_added_raw = future_added.result()
        triples_deleted_raw = future_deleted.result()
        literal_changed = future_literal.result()
        subject_changed = future_subject.result()
        predicate_changed = future_predicate.result()
        object_changed = future_object.result()
    
    # Triples covered by "changed" categories shouldn't appear in added/deleted
    deleted_covered: set[tuple[str, str, str]] = set()
    added_covered: set[tuple[str, str, str]] = set()
    
    for lc in literal_changed:
        deleted_covered.add((lc["subject"], lc["predicate"], lc["old"]))
        added_covered.add((lc["subject"], lc["predicate"], lc["new"]))
    
    for oc in object_changed:
        deleted_covered.add((oc["subject"], oc["predicate"], oc["old_object"]))
        added_covered.add((oc["subject"], oc["predicate"], oc["new_object"]))
    
    for pc in predicate_changed:
        deleted_covered.add((pc["subject"], pc["old_predicate"], pc["object"]))
        added_covered.add((pc["subject"], pc["new_predicate"], pc["object"]))
    
    for sc in subject_changed:
        deleted_covered.add((sc["old_subject"], sc["predicate"], sc["object"]))
        added_covered.add((sc["new_subject"], sc["predicate"], sc["object"]))
    
    triples_added = [t for t in triples_added_raw if t not in added_covered]
    triples_deleted = [t for t in triples_deleted_raw if t not in deleted_covered]

    # Detect compound changes: triples where exactly 2 of 3 components changed simultaneously.
    # These are pairs in (remaining) added/deleted that share exactly one component.
    compound_changed, triples_added, triples_deleted = _detect_compound_changes(
        triples_added, triples_deleted
    )

    logger.debug("compute_diff_parallel: added=%d, deleted=%d, literal_changed=%d, "
                 "subject_changed=%d, predicate_changed=%d, object_changed=%d, compound_changed=%d",
                 len(triples_added), len(triples_deleted), len(literal_changed),
                 len(subject_changed), len(predicate_changed), len(object_changed),
                 len(compound_changed))
    return GraphDiff(
        triples_added=triples_added,
        triples_deleted=triples_deleted,
        literal_changed=literal_changed,
        subject_changed=subject_changed,
        predicate_changed=predicate_changed,
        object_changed=object_changed,
        compound_changed=compound_changed,
    )


def _detect_compound_changes(
    triples_added: list[tuple[str, str, str]],
    triples_deleted: list[tuple[str, str, str]],
) -> tuple[list[dict], list[tuple[str, str, str]], list[tuple[str, str, str]]]:
    """Find pairs of added/deleted triples that share exactly one component.

    A compound change is a triple edit where two attributes changed at once
    (e.g. both subject and predicate), making it invisible to pairwise queries.
    We look for a unique 1-to-1 match between a deleted triple and an added triple
    that share exactly one component (subject, predicate, or object).

    Returns (compound_changed list, remaining_added, remaining_deleted).
    """
    if not triples_added or not triples_deleted:
        return [], triples_added, triples_deleted

    # Index deleted triples by each component for O(1) lookup
    by_subj: dict[str, list[int]] = {}
    by_pred: dict[str, list[int]] = {}
    by_obj:  dict[str, list[int]] = {}
    for i, (s, p, o) in enumerate(triples_deleted):
        by_subj.setdefault(s, []).append(i)
        by_pred.setdefault(p, []).append(i)
        by_obj.setdefault(o, []).append(i)

    compound: list[dict] = []
    used_deleted: set[int] = set()
    used_added: set[int] = set()

    for ai, (as_, ap, ao) in enumerate(triples_added):
        # Collect deleted-triple indices that share exactly one component
        candidates: dict[int, tuple[str, str]] = {}  # idx → (shared_component, anchor)
        for di in by_subj.get(as_, []):
            if di not in used_deleted:
                candidates[di] = ("subject", as_)
        for di in by_pred.get(ap, []):
            if di not in used_deleted:
                # Sharing subject AND predicate would be a literal/object_changed — skip
                existing = candidates.get(di)
                if existing and existing[0] == "subject":
                    del candidates[di]  # shared 2 components → not compound
                else:
                    candidates[di] = ("predicate", ap)
        for di in by_obj.get(ao, []):
            if di not in used_deleted:
                existing = candidates.get(di)
                if existing:
                    del candidates[di]  # shared 2+ components → not compound
                else:
                    candidates[di] = ("object", ao)

        # Only accept a unique match
        valid = {di: v for di, v in candidates.items() if di not in used_deleted}
        if len(valid) == 1:
            di, (shared, anchor) = next(iter(valid.items()))
            ds, dp, do_ = triples_deleted[di]
            compound.append({
                "shared": shared,
                "anchor": anchor,
                "old_triple": [ds, dp, do_],
                "new_triple": [as_, ap, ao],
            })
            used_deleted.add(di)
            used_added.add(ai)

    remaining_added = [t for i, t in enumerate(triples_added) if i not in used_added]
    remaining_deleted = [t for i, t in enumerate(triples_deleted) if i not in used_deleted]
    return compound, remaining_added, remaining_deleted


def _build_networkx_graph(store: Store, graph_uri: str) -> nx.MultiDiGraph:
    """Build a NetworkX multi-digraph from an RDF named graph.

    Uses MultiDiGraph so parallel edges with different predicates between the same
    node pair are preserved, giving accurate betweenness centrality. Blank nodes
    are included (skolemized to urn:bnode:... before loading, so they appear as
    regular string keys).
    """
    g = nx.MultiDiGraph()
    for quad in store.quads_for_pattern(None, None, None, NamedNode(graph_uri)):
        s, p, o = quad.subject, quad.predicate, quad.object
        if isinstance(s, Literal) or isinstance(o, Literal):
            continue
        sv = _to_value(s)
        ov = _to_value(o)
        g.add_edge(
            normalize_uri(sv) if is_uri(sv) else sv,
            normalize_uri(ov) if is_uri(ov) else ov,
            key=_to_value(p),
        )
    return g


def compute_bc_diff(store: Store, diff_result: GraphDiff) -> dict[str, CentralityInfo]:
    """Compute betweenness centrality diff between old and new graphs.
    
    Returns dict mapping node URI to CentralityInfo with bc_old, bc_new, and derived bc_diff.
    """
    g_old = _build_networkx_graph(store, "urn:diff:old")
    g_new = _build_networkx_graph(store, "urn:diff:new")
    
    bc_old = nx.betweenness_centrality(g_old) if g_old.number_of_nodes() > 0 else {}
    bc_new = nx.betweenness_centrality(g_new) if g_new.number_of_nodes() > 0 else {}
    
    all_nodes: set[str] = set(bc_old.keys()) | set(bc_new.keys())
    
    for s, _, o in diff_result.triples_added + diff_result.triples_deleted:
        if not isinstance(s, str) or not s.startswith('"'):
            all_nodes.add(normalize_uri(s) if is_uri(s) else s)
        if not isinstance(o, str) or not o.startswith('"'):
            all_nodes.add(normalize_uri(o) if is_uri(o) else o)
    
    centrality: dict[str, CentralityInfo] = {}
    for node in all_nodes:
        centrality[node] = CentralityInfo(
            bc_old=round(bc_old.get(node, 0.0), 4),
            bc_new=round(bc_new.get(node, 0.0), 4),
        )
    
    return centrality
