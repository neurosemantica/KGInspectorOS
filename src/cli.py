"""KGInspector command-line interface.

Usage:
    python -m src.cli diff old.ttl new.ttl [options]

Options:
    --format  summary|json|kgcl   Output format (default: summary)
    --output  PATH                Write to file instead of stdout
    --no-bc                       Skip betweenness centrality (faster)
    --limit   N                   Max results per category
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _cmd_diff(args: argparse.Namespace) -> None:
    """Execute the diff subcommand."""
    from .backend.diff.pipeline import diff
    from .backend.types import DiffOptions
    from .backend.export.kgcl import to_kgcl

    old_path = Path(args.old)
    new_path = Path(args.new)

    for path in (old_path, new_path):
        if not path.exists():
            sys.exit(f"error: file not found: {path}")

    opts = DiffOptions(
        compute_bc=not args.no_bc,
        limit=args.limit,
    )

    print(f"Computing diff… (bc={'off' if args.no_bc else 'on'})", file=sys.stderr)

    old_text = old_path.read_text()
    new_text = new_path.read_text()

    result = diff(old_text, new_text, opts)

    print(
        f"Done — "
        f"+{len(result.triples_added)} added, "
        f"-{len(result.triples_deleted)} deleted, "
        f"~{len(result.literal_changed)} changed, "
        f"{len(result.node_renamed)} renamed",
        file=sys.stderr,
    )

    output: str
    if args.format == "json":
        output = json.dumps(result.to_dict(), indent=2)
    elif args.format == "kgcl":
        output = to_kgcl(result)
    else:
        output = _format_summary(result)

    if args.output:
        Path(args.output).write_text(output)
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(output)


def _format_summary(result) -> str:  # type: ignore[no-untyped-def]
    """Human-readable summary of a GraphDiff."""
    from .backend.types import GraphDiff

    r: GraphDiff = result
    lines: list[str] = []

    def section(title: str, items: list, fmt) -> None:  # type: ignore[no-untyped-def]
        if not items:
            return
        lines.append(f"\n{'─' * 60}")
        lines.append(f"  {title} ({len(items)})")
        lines.append(f"{'─' * 60}")
        for item in items[:20]:
            lines.append("  " + fmt(item))
        if len(items) > 20:
            lines.append(f"  … and {len(items) - 20} more")

    lines.append("╒══════════════════════════════════════════════════════════╕")
    lines.append("│                  KGInspector — Diff Summary                │")
    lines.append("╘══════════════════════════════════════════════════════════╛")
    lines.append(f"  Added triples    : {len(r.triples_added)}")
    lines.append(f"  Deleted triples  : {len(r.triples_deleted)}")
    lines.append(f"  Literal changes  : {len(r.literal_changed)}")
    lines.append(f"  Subject changes  : {len(r.subject_changed)}")
    lines.append(f"  Predicate changes: {len(r.predicate_changed)}")
    lines.append(f"  Object changes   : {len(r.object_changed)}")
    lines.append(f"  Renamed nodes    : {len(r.node_renamed)}")

    section(
        "Added triples",
        r.triples_added,
        lambda t: f"<{t[0]}> <{t[1]}> {t[2]}",
    )
    section(
        "Deleted triples",
        r.triples_deleted,
        lambda t: f"<{t[0]}> <{t[1]}> {t[2]}",
    )
    section(
        "Literal changes",
        r.literal_changed,
        lambda lc: f"<{lc['subject']}> <{lc['predicate']}> \"{lc['old']}\" → \"{lc['new']}\"",
    )
    section(
        "Subject changes",
        r.subject_changed,
        lambda sc: f"<{sc['old_subject']}> → <{sc['new_subject']}> <{sc['predicate']}> {sc['object']}",
    )
    section(
        "Predicate changes",
        r.predicate_changed,
        lambda pc: f"<{pc['subject']}> <{pc['old_predicate']}> → <{pc['new_predicate']}> {pc['object']}",
    )
    section(
        "Object changes",
        r.object_changed,
        lambda oc: f"<{oc['subject']}> <{oc['predicate']}> {oc['old_object']} → {oc['new_object']}",
    )
    section(
        "Renamed nodes",
        r.node_renamed,
        lambda rn: f"<{rn['old']}> → <{rn['new']}> (confidence: {rn['confidence']:.2f})",
    )

    if r.centrality:
        top = sorted(r.centrality.items(), key=lambda kv: -kv[1].bc_diff)[:10]
        lines.append(f"\n{'─' * 60}")
        lines.append(f"  Top centrality shifts ({len(r.centrality)} nodes with data)")
        lines.append(f"{'─' * 60}")
        for uri, c in top:
            lines.append(
                f"  <{uri}>  {c.bc_old:.4f} → {c.bc_new:.4f}  [{c.bc_direction}]"
            )

    return "\n".join(lines)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m src.cli",
        description="KGInspector — compute semantic diffs between RDF knowledge graphs",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    diff_p = sub.add_parser("diff", help="Diff two RDF files")
    diff_p.add_argument("old", metavar="OLD", help="Path to old RDF file")
    diff_p.add_argument("new", metavar="NEW", help="Path to new RDF file")
    diff_p.add_argument(
        "--format",
        choices=["summary", "json", "kgcl"],
        default="summary",
        help="Output format (default: summary)",
    )
    diff_p.add_argument(
        "--output",
        metavar="FILE",
        default=None,
        help="Write output to FILE instead of stdout",
    )
    diff_p.add_argument(
        "--no-bc",
        action="store_true",
        default=False,
        help="Skip betweenness centrality computation (faster for large graphs)",
    )
    diff_p.add_argument(
        "--limit",
        type=int,
        metavar="N",
        default=None,
        help="Max results per change category",
    )
    diff_p.set_defaults(func=_cmd_diff)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
