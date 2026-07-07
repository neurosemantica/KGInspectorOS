"""SPARQL query builders for RDF diff computation."""


def _paginate(limit: int | None, offset: int = 0) -> str:
    """Generate SPARQL pagination clause."""
    return f"LIMIT {limit} OFFSET {offset}" if limit else ""


def triples_added(limit: int | None = None, offset: int = 0) -> str:
    """Triples in new graph but not in old (relationships added)."""
    return f"""
    SELECT ?s ?p ?o WHERE {{
        GRAPH <urn:diff:new> {{ ?s ?p ?o }}
        FILTER NOT EXISTS {{ GRAPH <urn:diff:old> {{ ?s ?p ?o }} }}
    }} {_paginate(limit, offset)}
    """


def triples_deleted(limit: int | None = None, offset: int = 0) -> str:
    """Triples in old graph but not in new (relationships deleted)."""
    return f"""
    SELECT ?s ?p ?o WHERE {{
        GRAPH <urn:diff:old> {{ ?s ?p ?o }}
        FILTER NOT EXISTS {{ GRAPH <urn:diff:new> {{ ?s ?p ?o }} }}
    }} {_paginate(limit, offset)}
    """


def literal_changed(limit: int | None = None, offset: int = 0) -> str:
    """Same subject+predicate, different literal value."""
    return f"""
    SELECT ?s ?p ?old ?new WHERE {{
        GRAPH <urn:diff:old> {{ ?s ?p ?old . FILTER(isLiteral(?old)) }}
        GRAPH <urn:diff:new> {{ ?s ?p ?new . FILTER(isLiteral(?new)) }}
        FILTER (?old != ?new)
    }} {_paginate(limit, offset)}
    """


def subject_changed(limit: int | None = None, offset: int = 0) -> str:
    """Subject changed (same predicate+object, different subject)."""
    return f"""
    SELECT DISTINCT ?old_subj ?new_subj ?pred ?obj WHERE {{
        GRAPH <urn:diff:old> {{ ?old_subj ?pred ?obj }}
        GRAPH <urn:diff:new> {{ ?new_subj ?pred ?obj }}
        FILTER NOT EXISTS {{ GRAPH <urn:diff:new> {{ ?old_subj ?pred ?obj }} }}
        FILTER NOT EXISTS {{ GRAPH <urn:diff:old> {{ ?new_subj ?pred ?obj }} }}
        FILTER(?old_subj != ?new_subj)
        FILTER(!isBlank(?old_subj) && !isBlank(?new_subj))
    }} {_paginate(limit, offset)}
    """


def predicate_changed(limit: int | None = None, offset: int = 0) -> str:
    """Predicate changed (same subject+object, different predicate)."""
    return f"""
    SELECT DISTINCT ?subj ?old_pred ?new_pred ?obj WHERE {{
        GRAPH <urn:diff:old> {{ ?subj ?old_pred ?obj }}
        GRAPH <urn:diff:new> {{ ?subj ?new_pred ?obj }}
        FILTER NOT EXISTS {{ GRAPH <urn:diff:new> {{ ?subj ?old_pred ?obj }} }}
        FILTER NOT EXISTS {{ GRAPH <urn:diff:old> {{ ?subj ?new_pred ?obj }} }}
        FILTER(?old_pred != ?new_pred)
    }} {_paginate(limit, offset)}
    """


def object_changed(limit: int | None = None, offset: int = 0) -> str:
    """Object (IRI or blank node) changed (same subject+predicate, different non-literal object)."""
    return f"""
    SELECT DISTINCT ?subj ?pred ?old_obj ?new_obj WHERE {{
        GRAPH <urn:diff:old> {{ ?subj ?pred ?old_obj . FILTER(!isLiteral(?old_obj)) }}
        GRAPH <urn:diff:new> {{ ?subj ?pred ?new_obj . FILTER(!isLiteral(?new_obj)) }}
        FILTER NOT EXISTS {{ GRAPH <urn:diff:new> {{ ?subj ?pred ?old_obj }} }}
        FILTER NOT EXISTS {{ GRAPH <urn:diff:old> {{ ?subj ?pred ?new_obj }} }}
        FILTER(?old_obj != ?new_obj)
    }} {_paginate(limit, offset)}
    """


def count_triples_added() -> str:
    """Count added triples."""
    return """
    SELECT (COUNT(*) AS ?c) WHERE { 
        GRAPH <urn:diff:new> { ?s ?p ?o } 
        FILTER NOT EXISTS { GRAPH <urn:diff:old> { ?s ?p ?o } } 
    }
    """


def count_triples_deleted() -> str:
    """Count deleted triples."""
    return """
    SELECT (COUNT(*) AS ?c) WHERE { 
        GRAPH <urn:diff:old> { ?s ?p ?o } 
        FILTER NOT EXISTS { GRAPH <urn:diff:new> { ?s ?p ?o } } 
    }
    """


