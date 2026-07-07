import type { GraphResponse } from "../types/diff";
import { API_BASE } from "./client";

export async function computeDiff(
  old: string,
  new_: string,
  options?: { max_nodes?: number },
  signal?: AbortSignal,
): Promise<GraphResponse> {
  console.info("[diff] request start: old=%d chars, new=%d chars, max_nodes=%s",
    old.length, new_.length, options?.max_nodes ?? "default");

  const t0 = performance.now();
  const res = await fetch(`${API_BASE}/api/view/graph`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old, new: new_, ...options }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[diff] API error %d: %s", res.status, text);
    throw new Error(`API error: ${res.status} - ${text}`);
  }

  const data: GraphResponse = await res.json();
  const elapsed = (performance.now() - t0).toFixed(0);
  console.info("[diff] response received in %sms: nodes=%d, edges=%d, is_empty=%s",
    elapsed, data.nodes.length, data.edges.length, data.stats.is_empty);
  return data;
}
