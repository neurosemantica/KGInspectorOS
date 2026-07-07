export type NodeType = "uri" | "bnode" | "literal";

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
}

export interface GraphEdge {
  source: string;
  target: string;
  predicate: string;
  predicate_label: string;
}

export interface GraphStats {
  node_count: number;
  edge_count: number;
  predicate_counts: Record<string, number>;
}

export interface ParsedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
}

export interface FilterState {
  searchQuery: string;
  nodeTypes: Set<NodeType>;
  predicates: Set<string>;
}
