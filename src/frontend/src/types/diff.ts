export type StatusType =
  | "node_renamed"
  | "subject_changed"
  | "predicate_changed"
  | "object_changed"
  | "compound_changed"
  | "literal_changed"
  | "relationship_added"
  | "relationship_deleted";

export interface DiffStats {
  node_renamed: number;
  subject_changed: number;
  predicate_changed: number;
  object_changed: number;
  compound_changed: number;
  literal_changed: number;
  relationship_added: number;
  relationship_deleted: number;
  is_empty?: boolean;
}

export interface RenameInfo {
  old: string;
  new: string;
  confidence: number;
  evidence: string[];
}

export type BCDirection = "increased" | "decreased" | "unchanged";

export interface ChangeDetail {
  type: string;
  predicate?: string;
  old: string;
  new: string;
}

export interface GraphNode {
  id: string;
  status: StatusType;
  label: string;
  is_bnode: boolean;
  is_literal?: boolean;
  centrality?: number;
  bc_old?: number;
  bc_new?: number;
  bc_diff?: number;
  bc_direction?: BCDirection;
  changes?: ChangeDetail[];
}

export interface GraphEdge {
  source: string;
  target: string;
  predicate: string;
  status: string;
  is_rename_edge?: boolean;
  confidence?: number;
  evidence?: string[];
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_renamed: RenameInfo[];
  stats: DiffStats;
  positions?: Record<string, [number, number]>;
  sampled?: boolean;
  original_node_count?: number;
}
