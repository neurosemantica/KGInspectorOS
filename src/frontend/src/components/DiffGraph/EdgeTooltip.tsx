import type { GraphEdge } from "../../types/diff";
import { STATUS_COLORS, STATUS_LABELS, DEFAULT_COLOR } from "../../lib/constants";
import { shortTerm } from "../../lib/graphUtils";

const EDGE_DESCRIPTIONS: Record<string, string> = {
  relationship_added: "This triple exists in the new graph but not the old.",
  relationship_deleted: "This triple was in the old graph but removed.",
  literal_changed: "Same subject & predicate, but the literal value changed.",
  subject_changed: "Same predicate & object, but the subject URI changed.",
  predicate_changed: "Same subject & object, but the predicate changed.",
  object_changed: "Same subject & predicate, but the target node changed.",
  compound_changed: "Multiple parts of this triple changed at once.",
  node_renamed: "Links the old URI to its renamed replacement.",
};

export function EdgeTooltip({ edge, x, y, onClose }: { edge: GraphEdge; x: number; y: number; onClose: () => void }) {
  const statusColor = STATUS_COLORS[edge.status] ?? DEFAULT_COLOR;
  return (
    <div
      className="absolute z-50 rounded-xl glass card-shadow p-3 max-w-xs text-foreground pointer-events-auto"
      style={{ left: x, top: y, transform: "translateY(-100%)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className="inline-flex items-center px-2 h-5 rounded-full text-[10px] font-medium border"
          style={{ borderColor: statusColor, color: statusColor }}
        >
          {STATUS_LABELS[edge.status] ?? edge.status.replace(/_/g, " ")}
        </span>
        <button
          className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        {EDGE_DESCRIPTIONS[edge.status]}
      </p>
      <div className="space-y-1.5">
        <div className="text-xs">
          <span className="text-muted-foreground/70">Predicate </span>
          <span className="font-mono text-primary">{shortTerm(edge.predicate)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs min-w-0">
          <span className="font-medium text-foreground truncate" title={edge.source}>{shortTerm(edge.source)}</span>
          <span className="text-muted-foreground/40 shrink-0">→</span>
          <span className="font-medium text-foreground truncate" title={edge.target}>{shortTerm(edge.target)}</span>
        </div>
      </div>
      {edge.is_rename_edge && edge.confidence != null && (
        <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
          Rename confidence: <span className="text-foreground font-medium">{(edge.confidence * 100).toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}
