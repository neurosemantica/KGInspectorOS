import { useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import { LEGEND_GROUPS, STATUS_COLORS, TERM_TYPE_COLORS, TERM_TYPE_LABELS } from "../lib/constants";

const TERM_TYPES = ["uri", "bnode", "literal"] as const;

const LEGEND_DESCRIPTIONS: Record<string, string> = {
  "Added":             "A triple (subject → predicate → object) exists in the new graph but not the old.",
  "Deleted":           "A triple existed in the old graph but was removed in the new graph.",
  "Value changed":     "Same subject and predicate, but the value changed — a literal was edited or the target object node was swapped.",
  "Structure changed": "The shape of a triple changed — the subject URI, predicate type, or multiple parts were altered at once.",
  "Renamed":           "A URI was replaced by a new URI with a similar profile (labels, types, connections). Detected heuristically.",
};

const TERM_DESCRIPTIONS: Record<string, string> = {
  uri: "A named resource identified by a URI (e.g. a person, concept, or document).",
  bnode: "A blank node — an anonymous resource with no global identifier.",
  literal: "A data value such as a string, number, or date. Always a leaf node.",
};

export function HelpDialog({ wide }: { wide?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          wide
            ? "flex items-center gap-2 w-full px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/8 transition-colors cursor-pointer"
            : "inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
        }
        aria-label="Help"
      >
        <HelpCircle className="w-4 h-4" />
        {wide && "Help & Legend"}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop — covers everything including navbar */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-2xl max-h-[85vh] rounded-2xl border border-border bg-card card-shadow flex flex-col">
            {/* Header — outside scroll container so it never bleeds */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl shrink-0">
              <div>
                <h2 className="text-base font-semibold text-foreground">How to read the graph</h2>
                <p className="text-xs text-muted-foreground mt-0.5">A guide to nodes, edges, and change types</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0">
            <div className="px-6 py-5 space-y-6">
              {/* Navigation */}
              <section>
                <div className="mono-label mb-3">Controls</div>
                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  {[
                    ["Scroll / pinch", "Zoom in and out"],
                    ["Click + drag", "Pan the canvas"],
                    ["Click node", "Inspect details in sidebar"],
                    ["Hover node", "Preview label and connections"],
                    ["Background click", "Deselect node"],
                    ["Drag node", "Reposition freely"],
                  ].map(([key, desc]) => (
                    <div key={key} className="flex items-start gap-2">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground whitespace-nowrap shrink-0">{key}</span>
                      <span className="text-xs">{desc}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Node types */}
              <section>
                <div className="mono-label mb-3">Node Types (Visualize view)</div>
                <div className="space-y-2.5">
                  {TERM_TYPES.map((type) => (
                    <div key={type} className="flex items-start gap-3">
                      <div
                        className="w-4 h-4 mt-0.5 shrink-0 flex items-center justify-center"
                        style={{ color: TERM_TYPE_COLORS[type] }}
                      >
                        <div
                          className="w-3 h-3"
                          style={{
                            backgroundColor: TERM_TYPE_COLORS[type],
                            borderRadius: type === "uri" ? "50%" : type === "literal" ? "2px" : 0,
                            transform: type === "bnode" ? "rotate(45deg) scale(0.8)" : undefined,
                          }}
                        />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-foreground">{TERM_TYPE_LABELS[type]}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{TERM_DESCRIPTIONS[type]}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Node size reflects degree — more connections = larger node.
                </p>
              </section>

              {/* Diff change types */}
              <section>
                <div className="mono-label mb-3">Change Types (Diff view)</div>
                <div className="space-y-2.5">
                  {LEGEND_GROUPS.map((g) => (
                    <div key={g.label} className="flex items-start gap-3">
                      <span
                        className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: g.color }}
                      />
                      <div>
                        <span className="text-sm font-medium" style={{ color: g.color }}>
                          {g.label}
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">{LEGEND_DESCRIPTIONS[g.label]}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Node size reflects betweenness centrality shift — larger nodes changed their structural importance more.
                </p>
              </section>

              {/* Edge guide */}
              <section>
                <div className="mono-label mb-3">Edges</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Edges represent RDF predicates (relationships). Arrows show direction: <span className="text-foreground">subject → object</span>.</p>
                  <p>In the diff view, edges are coloured by the type of change they represent. A renamed node has a special <span className="font-medium" style={{ color: STATUS_COLORS.node_renamed }}>orange</span> edge labelled <span className="font-mono text-xs">renamed_to</span>.</p>
                  <p>Hover an edge to see the predicate URI. The predicate is also visible in the node tooltip under "Properties".</p>
                </div>
              </section>

              {/* Sidebar */}
              <section>
                <div className="mono-label mb-3">Sidebar (Diff view)</div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p><span className="text-foreground font-medium">Stats</span> — counts per change type.</p>
                  <p><span className="text-foreground font-medium">Filter</span> — narrow the graph by change type or search node labels, IDs, and predicate names.</p>
                  <p><span className="text-foreground font-medium">Selected Node</span> — full details of the clicked node including centrality shift.</p>
                  <p><span className="text-foreground font-medium">Changes</span> — tabbed list of all changes; click a row to zoom the graph to that node.</p>
                </div>
              </section>
            </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
