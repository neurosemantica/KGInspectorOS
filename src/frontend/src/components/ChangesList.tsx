import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { GraphResponse, GraphNode, RenameInfo, ChangeDetail } from "../types/diff";
import { useGraphStore } from "../store/graphStore";
import { STATUS_COLORS } from "../lib/constants";
import { shortTerm } from "../lib/graphUtils";

interface Props {
  data: GraphResponse;
}

function TripleRow({
  s,
  p,
  o,
  color,
  onFocus,
}: {
  s: string;
  p: string;
  o: string;
  color: string;
  onFocus: (id: string) => void;
}) {
  return (
    <button
      className="w-full text-left group px-3 py-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={() => onFocus(s)}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        <span
          className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0 space-y-0.5">
          <div className="text-xs font-medium text-foreground truncate" title={s}>
            {shortTerm(s)}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono truncate" title={p}>
            {shortTerm(p)}
          </div>
          <div className="text-[10px] text-muted-foreground/70 truncate" title={o}>
            {shortTerm(o)}
          </div>
        </div>
      </div>
    </button>
  );
}

const CHANGE_TYPE_COLORS: Record<string, string> = {
  literal_changed: STATUS_COLORS.literal_changed,
  subject_changed: STATUS_COLORS.subject_changed,
  predicate_changed: STATUS_COLORS.predicate_changed,
  object_changed: STATUS_COLORS.object_changed,
  compound_changed: STATUS_COLORS.compound_changed,
  node_renamed: STATUS_COLORS.node_renamed,
};

function ChangeDetailRow({ c }: { c: ChangeDetail }) {
  const color = CHANGE_TYPE_COLORS[c.type] ?? STATUS_COLORS.literal_changed;
  return (
    <div className="flex items-baseline gap-1.5 min-w-0 py-0.5 pl-2">
      <span className="w-1 h-1 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        {c.predicate && (
          <span className="text-[10px] font-mono text-muted-foreground/70 truncate block" title={c.predicate}>
            {shortTerm(c.predicate)}
          </span>
        )}
        <div className="flex items-center gap-1 text-[10px] min-w-0 flex-wrap">
          <span className="text-destructive font-mono truncate" title={c.old}>{shortTerm(c.old)}</span>
          <span className="text-muted-foreground/40 shrink-0">→</span>
          <span className="text-emerald-500 font-mono truncate" title={c.new}>{shortTerm(c.new)}</span>
        </div>
      </div>
    </div>
  );
}

function ChangedNodeGroup({ node, onFocus }: { node: GraphNode; onFocus: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const changes = node.changes ?? [];
  const statusColor = CHANGE_TYPE_COLORS[node.status] ?? STATUS_COLORS.literal_changed;

  return (
    <div className="rounded-md overflow-hidden">
      <button
        className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors cursor-pointer flex items-start gap-1.5 min-w-0"
        onClick={() => { setOpen((v) => !v); onFocus(node.id); }}
      >
        <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs font-medium text-foreground truncate" title={node.label}>{node.label}</span>
            <span
              className="text-[9px] tabular-nums px-1 h-3.5 rounded-full flex items-center shrink-0"
              style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
            >
              {changes.length}
            </span>
            <span className="ml-auto shrink-0 text-muted-foreground/50">
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground/60 font-mono truncate" title={node.id}>{shortTerm(node.id)}</div>
        </div>
      </button>
      {open && changes.length > 0 && (
        <div className="px-3 pb-2 space-y-1 bg-accent/20 border-t border-border/30">
          {changes.map((c, i) => (
            <ChangeDetailRow key={i} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

type TabId = "added" | "deleted" | "changed" | "renamed";

interface Tab {
  id: TabId;
  label: string;
  count: number;
  color: string;
}

export function ChangesList({ data }: Props) {
  const { setHighlightNode } = useGraphStore();

  // Nodes that carry change details (literal/subject/predicate/object changed)
  const changedNodes = data.nodes.filter((n) => (n.changes?.length ?? 0) > 0);
  const changedCount = changedNodes.reduce((acc, n) => acc + (n.changes?.length ?? 0), 0);

  const tabs: Tab[] = [
    {
      id: "added",
      label: "Added",
      count: data.stats.relationship_added,
      color: STATUS_COLORS.relationship_added,
    },
    {
      id: "deleted",
      label: "Deleted",
      count: data.stats.relationship_deleted,
      color: STATUS_COLORS.relationship_deleted,
    },
    {
      id: "changed",
      label: "Changed",
      count: changedCount,
      color: STATUS_COLORS.literal_changed,
    },
    {
      id: "renamed",
      label: "Renamed",
      count: data.stats.node_renamed,
      color: STATUS_COLORS.node_renamed,
    },
  ].filter((t) => t.count > 0) as Tab[];

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0]?.id ?? "added");

  if (tabs.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
        No changes to display
      </div>
    );
  }

  const focus = (id: string) => setHighlightNode(id);

  const added = data.edges.filter((e) => e.status === "relationship_added");
  const deleted = data.edges.filter((e) => e.status === "relationship_deleted");
  const renamed = data.node_renamed as RenameInfo[];

  return (
    <div className="flex flex-col min-h-0">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? "border-current text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            style={activeTab === tab.id ? { color: tab.color, borderColor: tab.color } : {}}
          >
            {tab.label}
            <span
              className="text-[10px] tabular-nums px-1 h-4 rounded-full flex items-center"
              style={{
                backgroundColor: activeTab === tab.id ? `${tab.color}25` : "transparent",
                color: activeTab === tab.id ? tab.color : "inherit",
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {activeTab === "added" && (
          <>
            {added.length > 0 ? (
              added.map((e, i) => (
                <TripleRow
                  key={i}
                  s={e.source}
                  p={e.predicate}
                  o={e.target}
                  color={STATUS_COLORS.relationship_added}
                  onFocus={focus}
                />
              ))
            ) : (
              <p className="px-3 py-4 text-xs text-muted-foreground">No added edges in graph view.</p>
            )}
          </>
        )}

        {activeTab === "deleted" && (
          <>
            {deleted.length > 0 ? (
              deleted.map((e, i) => (
                <TripleRow
                  key={i}
                  s={e.source}
                  p={e.predicate}
                  o={e.target}
                  color={STATUS_COLORS.relationship_deleted}
                  onFocus={focus}
                />
              ))
            ) : (
              <p className="px-3 py-4 text-xs text-muted-foreground">No deleted edges in graph view.</p>
            )}
          </>
        )}

        {activeTab === "changed" && (
          <>
            {changedNodes.length > 0 ? (
              changedNodes.map((node) => (
                <ChangedNodeGroup key={node.id} node={node} onFocus={focus} />
              ))
            ) : (
              <p className="px-3 py-4 text-xs text-muted-foreground">No changes to display.</p>
            )}
          </>
        )}

        {activeTab === "renamed" && (
          <>
            {renamed.length > 0 ? (
              renamed.map((r, i) => (
                <div key={i} className="px-3 py-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => focus(r.old)}>
                  <div className="flex items-start gap-1.5 min-w-0">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS.node_renamed }} />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1 text-xs min-w-0">
                        <span className="text-destructive font-mono truncate" title={r.old}>{shortTerm(r.old)}</span>
                        <span className="text-muted-foreground/40 shrink-0">→</span>
                        <span className="text-emerald-500 font-mono truncate" title={r.new}>{shortTerm(r.new)}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/60">
                        confidence <span className="text-foreground font-medium">{(r.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="px-3 py-4 text-xs text-muted-foreground">No renames detected.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
