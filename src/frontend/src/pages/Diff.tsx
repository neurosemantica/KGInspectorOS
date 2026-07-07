import { useState } from "react";
import { GitCompare, ChevronDown, ChevronUp, Equal, Loader2 } from "lucide-react";
import { useComputeDiff } from "../hooks";
import { DiffGraph, InputPanel } from "../components";
import { DiffSidebar } from "../components/DiffSidebar";

export function DiffPage() {
  const { start, isLoading, error, graphResult } = useComputeDiff();
  const [inputCollapsed, setInputCollapsed] = useState(false);

  const hasResult = !!graphResult;
  const isEmpty = hasResult && graphResult.stats.relationship_added === 0
    && graphResult.stats.relationship_deleted === 0
    && graphResult.stats.literal_changed === 0
    && graphResult.stats.subject_changed === 0
    && graphResult.stats.predicate_changed === 0
    && graphResult.stats.object_changed === 0
    && graphResult.stats.compound_changed === 0
    && graphResult.stats.node_renamed === 0;

  const totalChanges = hasResult
    ? Object.values(graphResult.stats).reduce((a, b) => a + b, 0)
    : null;

  const handleCompute = (old: string, newGraph: string) => {
    start(old, newGraph);
    setInputCollapsed(true);
  };

  const handleNewComparison = () => {
    window.location.reload();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      <div className="max-w-5xl mx-auto w-full px-4">
        {!inputCollapsed ? (
          <div className="py-4 space-y-4">
            <section className="rounded-xl border border-border bg-card card-shadow overflow-hidden">
              <div className="p-6">
                <InputPanel onCompute={handleCompute} loading={isLoading} />
              </div>
            </section>
          </div>
        ) : (
          <div className="py-2">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card/80 backdrop-blur-sm px-4 h-10 card-shadow">
              <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                <GitCompare className="h-4 w-4 shrink-0 text-primary" />
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Computing diff…
                  </span>
                ) : isEmpty ? (
                  <span>Graphs are identical — no changes</span>
                ) : hasResult ? (
                  <span className="truncate">
                    Diff complete —{" "}
                    <span className="text-foreground font-medium">
                      {totalChanges?.toLocaleString()} changes
                    </span>
                  </span>
                ) : (
                  <span>No results yet</span>
                )}
              </div>
              <button
                onClick={handleNewComparison}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 ml-4"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                New comparison
              </button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="pb-2">
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-full rounded-full bg-primary/50 animate-pulse" />
            </div>
          </div>
        )}

        {error && (
          <div className="pb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      {hasResult && !isEmpty && (
        <div className="flex flex-1 min-h-0 border-t border-border overflow-hidden">
          <div className="flex-1 min-w-0 p-3">
            <DiffGraph data={graphResult} />
          </div>
          <DiffSidebar data={graphResult} />
        </div>
      )}

      {!hasResult && !isLoading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground/40 pb-16">
          <GitCompare className="h-12 w-12" />
          <div className="text-sm">Paste two RDF graphs above to compare</div>
        </div>
      )}

      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground/40 pb-16">
          <Equal className="h-12 w-12" />
          <div className="text-sm text-muted-foreground">No changes detected — graphs are identical</div>
          <button
            onClick={handleNewComparison}
            className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            <ChevronUp className="h-3 w-3" />
            New comparison
          </button>
        </div>
      )}
    </div>
  );
}
