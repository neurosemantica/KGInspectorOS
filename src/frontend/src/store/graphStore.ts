import { create } from "zustand";
import type { GraphNode, GraphResponse } from "../types/diff";

interface GraphStore {
  diffResult: GraphResponse | null;
  selectedNode: GraphNode | null;
  diffFilters: DiffFilterState;
  highlightNode: string | null;
  viewMode: "detail" | "overview";

  setDiffResult: (r: GraphResponse | null) => void;
  setSelectedNode: (n: GraphNode | null) => void;
  setDiffFilter: (partial: Partial<DiffFilterState>) => void;
  resetDiff: () => void;
  setHighlightNode: (id: string | null) => void;
  setViewMode: (mode: "detail" | "overview") => void;
}

export interface DiffFilterState {
  searchQuery: string;
  statuses: Set<string>;
  hideUnchanged: boolean;
}

const DEFAULT_DIFF_FILTERS: DiffFilterState = {
  searchQuery: "",
  statuses: new Set(),
  hideUnchanged: false,
};

export const useGraphStore = create<GraphStore>((set) => ({
  diffResult: null,
  selectedNode: null,
  diffFilters: { ...DEFAULT_DIFF_FILTERS, statuses: new Set() },
  highlightNode: null,
  viewMode: "detail",

  setDiffResult: (r) => set({ diffResult: r, selectedNode: null, viewMode: r && r.nodes.length > 5000 ? "overview" : "detail" }),
  setSelectedNode: (n) => set({ selectedNode: n }),
  setDiffFilter: (partial) =>
    set((s) => ({ diffFilters: { ...s.diffFilters, ...partial } })),
  resetDiff: () =>
    set({
      diffResult: null,
      selectedNode: null,
      diffFilters: { ...DEFAULT_DIFF_FILTERS, statuses: new Set() },
      highlightNode: null,
      viewMode: "detail",
    }),
  setHighlightNode: (id) => set({ highlightNode: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
}));
