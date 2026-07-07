import type { ParsedGraph } from "../types/visualize";
import { API_BASE } from "./client";

export async function parseGraph(data: string, format?: string): Promise<ParsedGraph> {
  const res = await fetch(`${API_BASE}/api/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, format }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Parse error: ${res.status} - ${text}`);
  }

  return res.json();
}
