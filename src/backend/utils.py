"""Shared utilities for KGInspector backend."""

from rdflib.term import URIRef, BNode, Literal


def is_uri(value: str) -> bool:
    return value.startswith(("http://", "https://", "urn:", "ftp://", "file://"))


def is_bnode(value: str) -> bool:
    return value.startswith("_:")


def extract_label(uri: str) -> str:
    """Extract human-readable label from a URI, skolem IRI, or blank node."""
    uri = uri.strip('<>')
    
    if "urn:bnode:" in uri:
        return uri.split("urn:bnode:")[-1]
    if uri.startswith("_:"):
        return uri[2:]
    
    for sep in ['#', '/']:
        if sep in uri:
            return uri.rsplit(sep, 1)[-1]
    
    return uri


def term_to_str(term: URIRef | BNode | Literal) -> str:
    if isinstance(term, BNode):
        return f"_:{term}"
    return str(term)


def detect_format(data: str, fmt: str | None = None) -> str:
    """Detect RDF serialization format from content heuristics."""
    if fmt:
        return fmt
    
    content = data.strip()
    if content.startswith(("{", "[")):
        return "json-ld"
    if content.startswith(("<?xml", "<rdf:", "<RDF")):
        return "xml"
    return "turtle"
