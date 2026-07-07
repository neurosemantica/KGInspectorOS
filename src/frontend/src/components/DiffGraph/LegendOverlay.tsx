import { useState } from "react";
import { LEGEND_GROUPS, TERM_TYPE_COLORS, TERM_TYPE_LABELS } from "../../lib/constants";

export function LegendOverlay({ activeStatuses }: { activeStatuses: Set<string> }) {
  const [collapsed, setCollapsed] = useState(false);

  const visibleGroups = LEGEND_GROUPS.filter((g) =>
    g.statuses.some((s) => activeStatuses.has(s))
  );

  if (visibleGroups.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 z-10 pointer-events-auto">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="glass rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Legend
        </button>
      ) : (
        <div className="glass rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-4 mb-0.5">
            <span className="mono-label">Nodes</span>
            <button
              onClick={() => setCollapsed(true)}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer leading-none"
            >
              ✕
            </button>
          </div>
          {(["uri", "bnode", "literal"] as const).map((type) => (
            <div key={type} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 shrink-0"
                style={{
                  backgroundColor: TERM_TYPE_COLORS[type],
                  borderRadius: type === "uri" ? "50%" : type === "literal" ? "2px" : 0,
                  transform: type === "bnode" ? "rotate(45deg) scale(0.75)" : undefined,
                }}
              />
              <span className="text-xs text-muted-foreground">{TERM_TYPE_LABELS[type]}</span>
            </div>
          ))}
          <div className="pt-1.5 border-t border-border/50">
            <span className="mono-label">Edges</span>
          </div>
          {visibleGroups.map((g) => (
            <div key={g.label} className="flex items-center gap-2">
              <span className="w-3 h-0.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{g.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
