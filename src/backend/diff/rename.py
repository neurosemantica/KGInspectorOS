"""Entity matching for URI rename detection."""

from difflib import SequenceMatcher
from typing import Any

from pyoxigraph import Store

from ..utils import is_uri


_LABEL_PREDICATES = [
    "http://www.w3.org/2000/01/rdf-schema#label",
    "http://www.w3.org/2004/02/skos/core#prefLabel",
    "http://purl.org/dc/terms/title",
    "http://xmlns.com/foaf/0.1/name",
    "http://schema.org/name",
]

_TYPE_PREDICATE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"

_Q_ENTITY_INFO = """
SELECT ?entity ?label ?type ?graph WHERE {{
    VALUES ?entity {{ {entities} }}
    VALUES ?labelPred {{ {label_preds} }}
    GRAPH ?graph {{
        OPTIONAL {{ ?entity ?labelPred ?label }}
        OPTIONAL {{ ?entity <{type_pred}> ?type }}
    }}
    FILTER (?graph IN (<urn:diff:old>, <urn:diff:new>))
}}
"""


def detect_renames(
    added: list[tuple[str, str, str]],
    deleted: list[tuple[str, str, str]],
    store: Store,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    """Detect URI renames by matching deleted to added entities.

    Considers both subjects and URI objects so pure object-position renames
    (where the URI never appears as a subject) are also caught.
    """
    added_entities = (
        {s for s, _, _ in added if not s.startswith("_:")} |
        {o for _, _, o in added if is_uri(o) and not o.startswith("_:")}
    )
    deleted_entities = (
        {s for s, _, _ in deleted if not s.startswith("_:")} |
        {o for _, _, o in deleted if is_uri(o) and not o.startswith("_:")}
    )

    added_only = added_entities - deleted_entities
    deleted_only = deleted_entities - added_entities
    
    if not added_only or not deleted_only:
        return []
    
    added_only = set(list(added_only)[:limit])
    deleted_only = set(list(deleted_only)[:limit])
    
    added_profiles = {uri: _build_profile(uri, added) for uri in added_only}
    deleted_profiles = {uri: _build_profile(uri, deleted) for uri in deleted_only}
    entity_info = _fetch_entity_info(store, added_only | deleted_only)
    
    added_labels = {uri: entity_info.get(uri, {}).get("new_labels", set()) for uri in added_only}
    added_types = {uri: entity_info.get(uri, {}).get("new_types", set()) for uri in added_only}
    deleted_labels = {uri: entity_info.get(uri, {}).get("old_labels", set()) for uri in deleted_only}
    deleted_types = {uri: entity_info.get(uri, {}).get("old_types", set()) for uri in deleted_only}
    
    return _match_entities(
        deleted_only, added_only,
        deleted_labels, added_labels,
        deleted_types, added_types,
        deleted_profiles, added_profiles,
    )


def _fetch_entity_info(store: Store, entities: set[str]) -> dict[str, dict]:
    """Fetch labels and types for all entities in one query."""
    if not entities:
        return {}
    
    query = _Q_ENTITY_INFO.format(
        entities=" ".join(f"<{uri}>" for uri in entities),
        label_preds=" ".join(f"<{p}>" for p in _LABEL_PREDICATES),
        type_pred=_TYPE_PREDICATE,
    )
    
    result: dict[str, dict] = {}
    try:
        for r in store.query(query):
            entity = r["entity"].value if hasattr(r["entity"], "value") else str(r["entity"])
            graph = r["graph"].value if r["graph"] else ""
            
            if entity not in result:
                result[entity] = {"old_labels": set(), "new_labels": set(), "old_types": set(), "new_types": set()}
            
            if r.get("label"):
                label = r["label"].value if hasattr(r["label"], "value") else str(r["label"])
                key = "old_labels" if "old" in graph else "new_labels"
                result[entity][key].add(label)
            
            if r.get("type"):
                type_val = r["type"].value if hasattr(r["type"], "value") else str(r["type"])
                key = "old_types" if "old" in graph else "new_types"
                result[entity][key].add(type_val)
    except Exception:
        pass
    
    return result


def _match_entities(
    deleted_only: set[str],
    added_only: set[str],
    deleted_labels: dict[str, set],
    added_labels: dict[str, set],
    deleted_types: dict[str, set],
    added_types: dict[str, set],
    deleted_profiles: dict[str, set],
    added_profiles: dict[str, set],
) -> list[dict[str, Any]]:
    """Match deleted entities to added entities by similarity."""
    renames = []
    matched = set()
    
    for old_uri in deleted_only:
        best_match, best_score, best_evidence = None, 0.0, []
        
        old_labels = deleted_labels.get(old_uri, set())
        old_types = deleted_types.get(old_uri, set())
        old_profile = deleted_profiles.get(old_uri, set())
        
        for new_uri in added_only:
            if new_uri in matched:
                continue
            
            score, evidence = 0.0, []
            new_labels = added_labels.get(new_uri, set())
            new_types = added_types.get(new_uri, set())
            new_profile = added_profiles.get(new_uri, set())
            
            label_match = old_labels & new_labels
            if label_match:
                score += 0.5
                evidence.append(f"label:{list(label_match)[0]}")
            elif old_labels and new_labels:
                max_sim = max((_similarity(ol, nl) for ol in old_labels for nl in new_labels), default=0.0)
                if max_sim > 0.8:
                    score += max_sim * 0.3
                    evidence.append(f"label_sim:{max_sim:.2f}")
            
            if old_types & new_types:
                score += 0.25
                evidence.append("type_match")
            
            prop_sim = _jaccard(old_profile, new_profile)
            if prop_sim > 0.5:
                score += prop_sim * 0.25
                evidence.append(f"props:{prop_sim:.2f}")
            
            if score > best_score:
                best_score, best_match, best_evidence = score, new_uri, evidence
        
        if best_match and best_score >= 0.5:
            renames.append({"old": old_uri, "new": best_match, "confidence": round(best_score, 3), "evidence": best_evidence})
            matched.add(best_match)
    
    return sorted(renames, key=lambda r: -r["confidence"])


def _build_profile(uri: str, triples: list[tuple[str, str, str]]) -> set[str]:
    """Collect predicates where the URI appears as subject or object."""
    return {p for s, p, o in triples if s == uri or o == uri}


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b) if a | b else 0.0
