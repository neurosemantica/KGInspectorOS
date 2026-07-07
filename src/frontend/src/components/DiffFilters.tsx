import { useEffect, useRef, useState } from "react";
import { Download, Search, X } from "lucide-react";
import type { GraphResponse } from "../types/diff";
import { useGraphStore } from "../store/graphStore";
import { LEGEND_GROUPS } from "../lib/constants";

interface Props {
  data: GraphResponse;
}

export function DiffFilters({ data }: Props) {
  const { diffFilters, setDiffFilter } = useGraphStore();
  const [localQuery, setLocalQuery] = useState(diffFilters.searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDiffFilter({ searchQuery: localQuery });
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (statuses: string[]) => {
    const next = new Set(diffFilters.statuses);
    const allActive = statuses.every((s) => next.has(s));
    if (allActive) {
      statuses.forEach((s) => next.delete(s));
    } else {
      statuses.forEach((s) => next.add(s));
    }
    setDiffFilter({ statuses: next });
  };

  const hasActiveFilters =
    localQuery.trim().length > 0 || diffFilters.statuses.size > 0;

  const handleClear = () => {
    setLocalQuery("");
    setDiffFilter({ searchQuery: "", statuses: new Set() });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diff.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = data.stats;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Search nodes or predicates…"
          className="w-full h-7 pl-8 pr-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring/50 transition-colors"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {LEGEND_GROUPS.map(({ label, color, statuses }) => {
          const count = statuses.reduce((sum, s) => sum + ((counts[s as keyof typeof counts] as number) ?? 0), 0);
          if (count === 0) return null;
          const active = statuses.every((s) => diffFilters.statuses.has(s));
          return (
            <button
              key={label}
              onClick={() => toggleGroup(statuses)}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs font-medium transition-colors cursor-pointer"
              style={
                active
                  ? { backgroundColor: color, color: "#fff" }
                  : { backgroundColor: "transparent", color, border: `1px solid ${color}` }
              }
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active ? "#fff" : color }} />
              {label}
              <span className="opacity-75" style={{ color: active ? "#fff" : color }}>{count}</span>
            </button>
          );
        })}
      </div>

      {hasActiveFilters && (
        <button
          onClick={handleClear}
          className="inline-flex items-center gap-1 h-6 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}

      <button
        onClick={handleExport}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
        title="Download diff as JSON"
      >
        <Download className="h-3.5 w-3.5" />
        JSON
      </button>
    </div>
  );
}
