import type { GraphNode, BCDirection, ChangeDetail } from "../../types/diff";
import { STATUS_COLORS, DEFAULT_COLOR, TERM_TYPE_LABELS } from "../../lib/constants";
import { getTermType, shortTerm } from "../../lib/graphUtils";

const CHANGE_LABELS: Record<string, string> = {
  literal_changed: "Value",
  subject_changed: "Subject",
  predicate_changed: "Predicate",
  object_changed: "Object",
  compound_changed: "Compound",
  node_renamed: "Renamed",
};

function ChangeRow({ c }: { c: ChangeDetail }) {
  const label = CHANGE_LABELS[c.type] ?? c.type.replace(/_/g, " ");
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-medium shrink-0">{label}</span>
        {c.predicate && (
          <span className="font-mono text-muted-foreground/60 truncate" title={c.predicate}>
            {shortTerm(c.predicate)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 text-xs min-w-0">
        <span className="text-destructive font-mono truncate" title={c.old}>{shortTerm(c.old)}</span>
        <span className="text-muted-foreground/40 shrink-0">→</span>
        <span className="text-emerald-500 font-mono truncate" title={c.new}>{shortTerm(c.new)}</span>
      </div>
    </div>
  );
}

export function NodeTooltip({ node, x, y, onClose }: { node: GraphNode; x: number; y: number; onClose: () => void }) {
  const statusColor = STATUS_COLORS[node.status] ?? DEFAULT_COLOR;
  const termType = getTermType(node.id, node.is_bnode);
  const dir = node.bc_direction as BCDirection;
  const changes = node.changes ?? [];

  return (
    <div
      className="absolute z-50 rounded-xl glass card-shadow p-3 max-w-xs text-foreground pointer-events-auto"
      style={{ left: x, top: y, transform: "translateY(-100%)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="inline-flex items-center px-2 h-5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
          {TERM_TYPE_LABELS[termType]}
        </span>
        <span
          className="inline-flex items-center px-2 h-5 rounded-full text-[10px] font-medium border"
          style={{ borderColor: statusColor, color: statusColor }}
        >
          {node.status.replace(/_/g, " ")}
        </span>
        <button
          className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="font-medium text-sm mb-1 truncate" title={node.label}>{node.label}</div>
      <div className="text-xs text-muted-foreground font-mono break-all leading-relaxed">{node.id}</div>

      {changes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Changes</div>
          {changes.map((c, i) => (
            <ChangeRow key={i} c={c} />
          ))}
        </div>
      )}

      {node.bc_diff !== undefined && node.bc_diff > 0.0001 && (
        <div className="mt-2 pt-2 border-t border-border/50 text-xs space-y-1">
          <div className="font-medium text-muted-foreground">Centrality shift</div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground tabular-nums">{node.bc_old?.toFixed(3)}</span>
            <span className="text-muted-foreground/40">→</span>
            <span className="text-muted-foreground tabular-nums">{node.bc_new?.toFixed(3)}</span>
            <span className={dir === "increased" ? "text-emerald-500" : dir === "decreased" ? "text-destructive" : "text-muted-foreground"}>
              {dir === "increased" ? "↑" : dir === "decreased" ? "↓" : "="}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
