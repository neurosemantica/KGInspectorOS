import type { GraphResponse } from "../types/diff";
import { useGraphStore } from "../store/graphStore";
import { DiffFilters } from "./DiffFilters";
import { ChangesList } from "./ChangesList";
import { STATUS_COLORS, LEGEND_GROUPS } from "../lib/constants";

interface Props {
  data: GraphResponse;
}

function StatBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums text-foreground">{value.toLocaleString()}</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function StatsSection({ data }: { data: GraphResponse }) {
  const stats = data.stats;

  const groupCounts = LEGEND_GROUPS.map((g) => ({
    ...g,
    count: g.statuses.reduce((sum, s) => sum + ((stats[s as keyof typeof stats] as number) ?? 0), 0),
  })).filter((g) => g.count > 0);

  const maxCount = Math.max(...groupCounts.map((g) => g.count), 1);
  const totalChanges = groupCounts.reduce((sum, g) => sum + g.count, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="mono-label">Changes</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {totalChanges.toLocaleString()} total
        </span>
      </div>
      <div className="space-y-2.5">
        {groupCounts.map((g) => (
          <StatBar
            key={g.label}
            label={g.label}
            value={g.count}
            max={maxCount}
            color={g.color}
          />
        ))}
      </div>
      <div className="flex items-center gap-4 pt-1 border-t border-border">
        <div className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium tabular-nums">{data.nodes.length}</span> nodes
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium tabular-nums">{data.edges.length}</span> edges
        </div>
        {data.sampled && (
          <div className="text-xs text-amber-500/80">sampled</div>
        )}
      </div>
    </div>
  );
}

function NodeDetail() {
  const { selectedNode, setSelectedNode } = useGraphStore();

  if (!selectedNode) {
    return (
      <div className="px-0 py-3 text-xs text-muted-foreground/60 text-center">
        Click a node to inspect
      </div>
    );
  }

  const color = STATUS_COLORS[selectedNode.status];

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span
          className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium border shrink-0"
          style={{ borderColor: color, color }}
        >
          {selectedNode.status.replace(/_/g, " ")}
        </span>
        <button
          onClick={() => setSelectedNode(null)}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
        >
          ✕
        </button>
      </div>
      <div className="text-sm font-medium text-foreground truncate" title={selectedNode.label}>
        {selectedNode.label}
      </div>
      <div className="text-[11px] text-muted-foreground font-mono break-all leading-relaxed">
        {selectedNode.id}
      </div>
      {selectedNode.bc_diff !== undefined && selectedNode.bc_diff > 0.0001 && (
        <div className="pt-2 border-t border-border space-y-1">
          <div className="mono-label">Centrality shift</div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground tabular-nums">{selectedNode.bc_old?.toFixed(4)}</span>
            <span className="text-muted-foreground/40">→</span>
            <span className="text-muted-foreground tabular-nums">{selectedNode.bc_new?.toFixed(4)}</span>
            <span
              className={
                selectedNode.bc_direction === "increased"
                  ? "text-emerald-500"
                  : selectedNode.bc_direction === "decreased"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            >
              {selectedNode.bc_direction === "increased"
                ? "↑ increased"
                : selectedNode.bc_direction === "decreased"
                ? "↓ decreased"
                : "unchanged"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function DiffSidebar({ data }: Props) {
  return (
    <div className="w-[300px] shrink-0 border-l border-border bg-card flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-4 border-b border-border">
          <StatsSection data={data} />
        </div>

        <div className="px-4 py-3 border-b border-border">
          <div className="mono-label mb-2">Filter</div>
          <DiffFilters data={data} />
        </div>

        <div className="px-4 py-3 border-b border-border">
          <div className="mono-label mb-2">Selected Node</div>
          <NodeDetail />
        </div>

        <div className="px-4 pt-3 pb-2">
          <div className="mono-label">Changes</div>
        </div>
        <ChangesList data={data} />
      </div>
    </div>
  );
}
