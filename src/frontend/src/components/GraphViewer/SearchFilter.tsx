import { Search, Filter, X } from "lucide-react";
import type { FilterState, NodeType, GraphStats } from "../../types/visualize";
import { shortTerm } from "../../lib/graphUtils";

interface Props {
  filters: FilterState;
  stats: GraphStats;
  onFiltersChange: (filters: FilterState) => void;
}

const NODE_TYPES: { id: NodeType; label: string }[] = [
  { id: "uri", label: "URI" },
  { id: "bnode", label: "Blank Node" },
  { id: "literal", label: "Literal" },
];

export function SearchFilter({ filters, stats, onFiltersChange }: Props) {
  const predicates = Object.entries(stats.predicate_counts).sort((a, b) => b[1] - a[1]);
  const hasFilters =
    filters.searchQuery || filters.nodeTypes.size > 0 || filters.predicates.size > 0;

  const toggleNodeType = (type: NodeType) => {
    const newTypes = new Set(filters.nodeTypes);
    if (newTypes.has(type)) newTypes.delete(type);
    else newTypes.add(type);
    onFiltersChange({ ...filters, nodeTypes: newTypes });
  };

  const togglePredicate = (predicate: string) => {
    const newPredicates = new Set(filters.predicates);
    if (newPredicates.has(predicate)) newPredicates.delete(predicate);
    else newPredicates.add(predicate);
    onFiltersChange({ ...filters, predicates: newPredicates });
  };

  const clearFilters = () =>
    onFiltersChange({ searchQuery: "", nodeTypes: new Set(), predicates: new Set() });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex items-center gap-2 flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm focus-within:ring-2 focus-within:ring-ring/50 transition-colors">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            className="flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            placeholder="Search nodes…"
            value={filters.searchQuery}
            onChange={(e) => onFiltersChange({ ...filters, searchQuery: e.target.value })}
          />
          {filters.searchQuery && (
            <button
              className="inline-flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={() => onFiltersChange({ ...filters, searchQuery: "" })}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {hasFilters && (
          <button
            className="inline-flex items-center justify-center h-9 px-3 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            onClick={clearFilters}
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <div className="mono-label flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Node Types
          </div>
          <div className="flex flex-wrap gap-1">
            {NODE_TYPES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => toggleNodeType(id)}
                className={`inline-flex items-center h-6 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  filters.nodeTypes.has(id)
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {predicates.length > 0 && (
          <div className="space-y-1.5 flex-1 min-w-48">
            <div className="mono-label flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Predicates ({predicates.length})
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {predicates.slice(0, 20).map(([pred, count]) => (
                <button
                  key={pred}
                  onClick={() => togglePredicate(pred)}
                  title={pred}
                  className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    filters.predicates.has(pred)
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {shortTerm(pred)}
                  <span className="inline-flex items-center px-1 h-3.5 rounded text-[9px] bg-black/10 dark:bg-white/10">
                    {count}
                  </span>
                </button>
              ))}
              {predicates.length > 20 && (
                <span className="text-xs text-muted-foreground/50 self-center">
                  +{predicates.length - 20} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
