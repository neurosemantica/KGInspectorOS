"""Serialize a GraphDiff to Knowledge Graph Change Language (KGCL) text.

KGCL spec: https://w3id.org/kgcl
Syntax reference: REPRESENTATION_DUMP.md §6.1
"""

from __future__ import annotations

from ..types import GraphDiff


def to_kgcl(diff: GraphDiff) -> str:
    """Convert a GraphDiff to a KGCL text document.

    Returns a string with one KGCL statement per line, grouped by change
    category and separated by blank lines with a comment header.
    """
    sections: list[str] = []

    if diff.node_renamed:
        lines = ["# --- Renamed nodes ---"]
        for r in diff.node_renamed:
            confidence = f"  # confidence: {r['confidence']:.2f}" if r.get("confidence") else ""
            lines.append(f"rename {_uri(r['old'])} to {_uri(r['new'])}{confidence}")
        sections.append("\n".join(lines))

    if diff.triples_added:
        lines = ["# --- Added edges ---"]
        for s, p, o in diff.triples_added:
            lines.append(f"create edge {_uri(s)} {_uri(p)} {_term(o)}")
        sections.append("\n".join(lines))

    if diff.triples_deleted:
        lines = ["# --- Deleted edges ---"]
        for s, p, o in diff.triples_deleted:
            lines.append(f"delete edge {_uri(s)} {_uri(p)} {_term(o)}")
        sections.append("\n".join(lines))

    if diff.literal_changed:
        lines = ["# --- Changed annotations ---"]
        for lc in diff.literal_changed:
            lines.append(
                f"change annotation of {_uri(lc['subject'])} {_uri(lc['predicate'])}"
                f" from {_literal(lc['old'])} to {_literal(lc['new'])}"
            )
        sections.append("\n".join(lines))

    if diff.subject_changed:
        lines = ["# --- Changed subjects ---"]
        for sc in diff.subject_changed:
            lines.append(
                f"# subject changed: "
                f"delete edge {_uri(sc['old_subject'])} {_uri(sc['predicate'])} {_term(sc['object'])} / "
                f"create edge {_uri(sc['new_subject'])} {_uri(sc['predicate'])} {_term(sc['object'])}"
            )
        sections.append("\n".join(lines))

    if diff.predicate_changed:
        lines = ["# --- Changed predicates ---"]
        for pc in diff.predicate_changed:
            lines.append(
                f"# predicate changed: "
                f"delete edge {_uri(pc['subject'])} {_uri(pc['old_predicate'])} {_term(pc['object'])} / "
                f"create edge {_uri(pc['subject'])} {_uri(pc['new_predicate'])} {_term(pc['object'])}"
            )
        sections.append("\n".join(lines))

    if diff.object_changed:
        lines = ["# --- Changed objects ---"]
        for oc in diff.object_changed:
            lines.append(
                f"# object changed: "
                f"delete edge {_uri(oc['subject'])} {_uri(oc['predicate'])} {_term(oc['old_object'])} / "
                f"create edge {_uri(oc['subject'])} {_uri(oc['predicate'])} {_term(oc['new_object'])}"
            )
        sections.append("\n".join(lines))

    return "\n\n".join(sections) + "\n" if sections else "# No changes detected\n"


def _uri(value: str) -> str:
    """Wrap a URI in angle brackets if it looks like a URI."""
    if value.startswith(("http://", "https://", "urn:")):
        return f"<{value}>"
    if value.startswith("_:"):
        return value  # blank node — leave as-is
    return value


def _literal(value: str) -> str:
    """Quote a literal value."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _term(value: str) -> str:
    """Format any RDF term: URI, blank node, or literal."""
    if value.startswith(("http://", "https://", "urn:")):
        return f"<{value}>"
    if value.startswith("_:"):
        return value
    return _literal(value)
