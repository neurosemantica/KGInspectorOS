import { useState, useCallback, useRef } from "react";
import { computeDiff } from "../api/diff";
import type { GraphResponse } from "../types/diff";

export interface DiffState {
  graphResult: GraphResponse | null;
  isLoading: boolean;
  error: string | null;
}

export function useComputeDiff() {
  const [state, setState] = useState<DiffState>({
    graphResult: null,
    isLoading: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (old: string, new_: string, options?: { max_nodes?: number }) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      console.info("[useComputeDiff] starting diff computation");
      setState({ graphResult: null, isLoading: true, error: null });

      try {
        const result = await computeDiff(old, new_, options, signal);
        if (!signal.aborted) {
          const { stats } = result;
          const isEmpty = stats.is_empty ??
            (stats.relationship_added === 0 && stats.relationship_deleted === 0 &&
             stats.literal_changed === 0 && stats.subject_changed === 0 &&
             stats.predicate_changed === 0 && stats.object_changed === 0 &&
             stats.compound_changed === 0 && stats.node_renamed === 0);
          console.info("[useComputeDiff] diff complete: is_empty=%s, stats=%o", isEmpty, stats);
          setState({ graphResult: result, isLoading: false, error: null });
        } else {
          console.info("[useComputeDiff] diff aborted");
        }
      } catch (e) {
        if (!signal.aborted) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          console.error("[useComputeDiff] diff error:", msg);
          setState({
            graphResult: null,
            isLoading: false,
            error: msg,
          });
        }
      }
    },
    [],
  );

  const stop = useCallback(() => {
    console.info("[useComputeDiff] stopping diff computation");
    abortRef.current?.abort();
    setState((s) => ({ ...s, isLoading: false }));
  }, []);

  return { ...state, start, stop };
}
