"""Skolemization for blank node identity preservation."""

from rdflib import Graph
from rdflib.term import BNode, URIRef

SKOLEM_PREFIX = "urn:bnode:"


def skolemize(nquads: str) -> str:
    """Convert blank nodes to skolem URIs for stable identity across loads."""
    if not nquads.strip():
        return nquads
    
    g = Graph()
    g.parse(data=nquads, format="nquads")
    
    result = Graph()
    for s, p, o in g:
        s_new = URIRef(f"{SKOLEM_PREFIX}{s}") if isinstance(s, BNode) else s
        o_new = URIRef(f"{SKOLEM_PREFIX}{o}") if isinstance(o, BNode) else o
        result.add((s_new, p, o_new))
    
    return result.serialize(format="nt")


def deskolemize(value: str) -> str:
    """Convert skolem URI back to blank node notation."""
    if value.startswith(f"<{SKOLEM_PREFIX}") and value.endswith(">"):
        return f"_:{value[len(SKOLEM_PREFIX)+1:-1]}"
    if value.startswith(SKOLEM_PREFIX):
        return f"_:{value[len(SKOLEM_PREFIX):]}"
    return value


def is_skolem(value: str) -> bool:
    """Check if value is a skolem URI."""
    return SKOLEM_PREFIX in value
