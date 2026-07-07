import { useState, useCallback } from "react";
import { Loader2, Eye } from "lucide-react";
import { GraphViewer } from "../components/GraphViewer";
import { SearchFilter } from "../components/GraphViewer/SearchFilter";
import { parseGraph } from "../api/visualize";
import type { ParsedGraph, FilterState, GraphNode } from "../types/visualize";

const PLACEHOLDER = `@prefix ex: <http://example.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Alice a ex:Person ;
    rdfs:label "Alice" ;
    ex:knows ex:Bob ;
    ex:age "30" .

ex:Bob a ex:Person ;
    rdfs:label "Bob" ;
    ex:knows ex:Carol .`;

const INITIAL_FILTERS: FilterState = {
  searchQuery: "",
  nodeTypes: new Set(),
  predicates: new Set(),
};

export function VisualizePage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<ParsedGraph | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const handleParse = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setFilters(INITIAL_FILTERS);
    setSelectedNode(null);
    try {
      setGraph(await parseGraph(input));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, [input]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card card-shadow overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              RDF Graph <span className="text-muted-foreground font-normal">(Turtle)</span>
            </label>
            <textarea
              className="w-full h-48 rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/50 text-foreground placeholder:text-muted-foreground/40 transition-colors"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={PLACEHOLDER}
            />
          </div>

          <div className="flex justify-center">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-8 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer"
              disabled={!input.trim() || loading}
              onClick={handleParse}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {loading ? "Parsing…" : "Visualize Graph"}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {graph && (
        <section className="rounded-xl border border-border bg-card card-shadow">
          <div className="p-6 space-y-4">
            <SearchFilter filters={filters} stats={graph.stats} onFiltersChange={setFilters} />
            <GraphViewer data={graph} filters={filters} onNodeSelect={setSelectedNode} />

            {selectedNode && (
              <div className="bg-muted/50 rounded-lg border border-border p-4">
                <div className="text-sm font-medium mb-2 text-foreground">Selected Node</div>
                <div className="text-xs space-y-1 text-muted-foreground">
                  <div>
                    <span className="opacity-70">Label:</span>{" "}
                    <span className="text-foreground">{selectedNode.label}</span>
                  </div>
                  <div>
                    <span className="opacity-70">Type:</span>{" "}
                    <span className="inline-flex items-center px-1.5 h-4 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
                      {selectedNode.type}
                    </span>
                  </div>
                  <div className="font-mono break-all">
                    <span className="opacity-70">URI:</span>{" "}
                    <span className="text-foreground">{selectedNode.id}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
