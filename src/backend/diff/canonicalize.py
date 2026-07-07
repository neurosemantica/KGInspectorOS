"""Blank node canonicalization using PyLD's URDNA2015 (W3C RDFC-1.0)."""

import json
import logging

from expression import Result, Ok, Error
from pyld import jsonld
from rdflib import Graph

from ..types import CanonError
from ..utils import detect_format

logger = logging.getLogger(__name__)


def canonicalize(data: str, fmt: str | None = None) -> Result[str, CanonError]:
    """Canonicalize RDF to N-Quads with deterministic blank node IDs.
    
    Uses PyLD's URDNA2015 algorithm (W3C RDFC-1.0 compliant).
    Blank nodes receive canonical identifiers (_:c14n0, _:c14n1, ...).
    """
    try:
        g = Graph()
        fmt = fmt or detect_format(data)
        logger.debug("canonicalize: format=%s, source=string(%d chars)", fmt, len(data))

        g.parse(data=data, format=fmt)

        triple_count = len(g)
        logger.debug("parsed %d triples, running URDNA2015", triple_count)

        jsonld_data = json.loads(g.serialize(format="json-ld"))
        nquads = jsonld.normalize(jsonld_data, {"algorithm": "URDNA2015", "format": "application/n-quads"})
        nquad_lines = nquads.count("\n")
        logger.debug("canonicalized: %d nquad lines", nquad_lines)
        return Ok(nquads)
    except Exception as e:
        logger.error("canonicalization failed: %s", e)
        return Error(CanonError(f"Canonicalization failed: {e}"))
