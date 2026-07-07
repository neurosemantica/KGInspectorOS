import { useEffect, useMemo, useRef, useState } from "react";
import { Graph } from "@cosmos.gl/graph";
import { Maximize2, Pause, Play } from "lucide-react";
import type { ParsedGraph, GraphNode, GraphEdge, FilterState } from "../../types/visualize";
import {
  TERM_TYPE_COLORS,
  TERM_TYPE_LABELS,
  DEFAULT_COLOR,
  GRAPH_LINK_COLOR,
  NODE_SIZE_MIN,
  NODE_SIZE_MAX,
  GRAPH_CONFIG,
  hexToRgba,
} from "../../lib/constants";
import { shortTerm, SHAPE_BY_TERM } from "../../lib/graphUtils";
import { EMPTY_EDGE_TOOLTIP, type EdgeTooltipState } from "../../lib/graphTypes";

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  node: GraphNode | null;
  edges: GraphEdge[];
}

const EMPTY_TOOLTIP: TooltipState = { visible: false, x: 0, y: 0, node: null, edges: [] };

function NodeTooltip({ node, edges, x, y, onClose }: { node: GraphNode; edges: GraphEdge[]; x: number; y: number; onClose: () => void }) {
  const color = TERM_TYPE_COLORS[node.type] ?? DEFAULT_COLOR;

  return (
    <div
      className="absolute z-50 rounded-xl glass card-shadow p-3 max-w-sm text-foreground pointer-events-auto"
      style={{ left: x, top: y, transform: "translateY(-100%)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="inline-flex items-center px-2 h-5 rounded-full text-[10px] font-medium text-white" style={{ backgroundColor: color }}>
          {TERM_TYPE_LABELS[node.type] ?? node.type.toUpperCase()}
        </span>
        <button className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="font-medium text-sm mb-1">{node.label}</div>
      <div className="text-xs text-muted-foreground font-mono break-all mb-2">{node.id}</div>
      {edges.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border text-xs space-y-1">
          <div className="font-medium text-muted-foreground">Properties ({edges.length})</div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {edges.slice(0, 10).map((e, i) => (
              <div key={i}>
                <span className="text-primary">{e.predicate_label}</span>
                <span className="text-muted-foreground">
                  {e.source === node.id ? ` → ${e.target.split("/").pop()}` : ` ← ${e.source.split("/").pop()}`}
                </span>
              </div>
            ))}
            {edges.length > 10 && <div className="text-muted-foreground/50">…and {edges.length - 10} more</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function EdgeTooltip({ edge, sourceNode, targetNode, x, y, onClose }: {
  edge: GraphEdge;
  sourceNode: GraphNode | undefined;
  targetNode: GraphNode | undefined;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const srcColor = TERM_TYPE_COLORS[sourceNode?.type ?? "uri"] ?? DEFAULT_COLOR;
  const tgtColor = TERM_TYPE_COLORS[targetNode?.type ?? "uri"] ?? DEFAULT_COLOR;

  return (
    <div
      className="absolute z-50 rounded-xl glass card-shadow p-3 max-w-xs text-foreground pointer-events-auto"
      style={{ left: x, top: y, transform: "translateY(-100%)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="inline-flex items-center px-2 h-5 rounded-full text-[10px] font-medium text-white bg-primary">
          Relationship
        </span>
        <button
          className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="space-y-1.5">
        <div className="text-xs">
          <span className="text-muted-foreground/70">Predicate </span>
          <span className="font-mono text-primary">{edge.predicate_label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono break-all">{edge.predicate}</div>
        <div className="flex items-center gap-1.5 text-xs min-w-0 pt-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: srcColor }} />
          <span className="font-medium text-foreground truncate" title={edge.source}>{shortTerm(edge.source)}</span>
          <span className="text-muted-foreground/40 shrink-0">→</span>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tgtColor }} />
          <span className="font-medium text-foreground truncate" title={edge.target}>{shortTerm(edge.target)}</span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  data: ParsedGraph;
  filters: FilterState;
  onNodeSelect?: (node: GraphNode | null) => void;
}

export function GraphViewer({ data, filters, onNodeSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState>(EMPTY_TOOLTIP);
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltipState>(EMPTY_EDGE_TOOLTIP);
  const [simulating, setSimulating] = useState(true);
  const edgesRef = useRef<GraphEdge[]>([]);
  const nodeMapRef = useRef<Map<string, GraphNode>>(new Map());
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const { filteredNodes, filteredEdges } = useMemo(() => {
    const query = filters.searchQuery.toLowerCase();
    const matchingNodes = new Set<string>();

    for (const node of data.nodes) {
      const matchesType = filters.nodeTypes.size === 0 || filters.nodeTypes.has(node.type);
      const matchesSearch = !query || node.label.toLowerCase().includes(query) || node.id.toLowerCase().includes(query);
      if (matchesType && matchesSearch) matchingNodes.add(node.id);
    }

    const filteredEdges = data.edges.filter((e) => {
      const matchesPredicate = filters.predicates.size === 0 || filters.predicates.has(e.predicate);
      return matchesPredicate && (matchingNodes.has(e.source) || matchingNodes.has(e.target));
    });

    for (const edge of filteredEdges) {
      matchingNodes.add(edge.source);
      matchingNodes.add(edge.target);
    }

    return {
      filteredNodes: data.nodes.filter((n) => matchingNodes.has(n.id)),
      filteredEdges,
    };
  }, [data, filters]);

  const graphData = useMemo(() => {
    const n = filteredNodes.length;
    if (n === 0) return null;

    const nodeIndexMap = new Map<string, number>();
    const positions = new Float32Array(n * 2);
    const colors = new Float32Array(n * 4);
    const sizes = new Float32Array(n);
    const shapes = new Float32Array(n);

    const degree = new Map<string, number>();
    for (const e of filteredEdges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const maxDeg = Math.max(...degree.values(), 1);

    const seedRadius = (n * 45) / (2 * Math.PI);

    for (let i = 0; i < n; i++) {
      const nd = filteredNodes[i];
      nodeIndexMap.set(nd.id, i);

      const angle = (2 * Math.PI * i) / n;
      positions[i * 2] = 2048 + seedRadius * Math.sin(angle);
      positions[i * 2 + 1] = 2048 + seedRadius * Math.cos(angle);

      const hex = TERM_TYPE_COLORS[nd.type] ?? DEFAULT_COLOR;
      const [r, g, b, a] = hexToRgba(hex);
      colors[i * 4] = r;
      colors[i * 4 + 1] = g;
      colors[i * 4 + 2] = b;
      colors[i * 4 + 3] = a;

      const degNorm = (degree.get(nd.id) ?? 0) / maxDeg;
      const typeScale = nd.type === "uri" ? 1.0 : nd.type === "bnode" ? 0.75 : 0.60;
      sizes[i] = (NODE_SIZE_MIN + degNorm * (NODE_SIZE_MAX - NODE_SIZE_MIN)) * typeScale;
      shapes[i] = SHAPE_BY_TERM[nd.type as keyof typeof SHAPE_BY_TERM] ?? SHAPE_BY_TERM.uri;
    }

    const validEdges = filteredEdges.filter((e) => nodeIndexMap.has(e.source) && nodeIndexMap.has(e.target));
    const links = new Float32Array(validEdges.length * 2);
    const linkColors = new Float32Array(validEdges.length * 4);
    const linkArrows: boolean[] = [];
    const [er, eg, eb] = hexToRgba(GRAPH_LINK_COLOR, 0.9);

    for (let i = 0; i < validEdges.length; i++) {
      const e = validEdges[i];
      links[i * 2] = nodeIndexMap.get(e.source)!;
      links[i * 2 + 1] = nodeIndexMap.get(e.target)!;
      linkColors[i * 4] = er;
      linkColors[i * 4 + 1] = eg;
      linkColors[i * 4 + 2] = eb;
      linkColors[i * 4 + 3] = 0.9;
      linkArrows.push(true);
    }

    return { positions, colors, sizes, shapes, links, linkColors, linkArrows, validEdges };
  }, [filteredNodes, filteredEdges]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !graphData) {
      if (graphRef.current) { graphRef.current.destroy(); graphRef.current = null; }
      return;
    }

    nodesRef.current = filteredNodes;
    edgesRef.current = graphData.validEdges;
    const nMap = new Map<string, GraphNode>();
    for (const nd of filteredNodes) nMap.set(nd.id, nd);
    nodeMapRef.current = nMap;
    if (graphRef.current) { graphRef.current.destroy(); graphRef.current = null; }

    const graph = new Graph(el, {
      ...GRAPH_CONFIG,
      onPointClick: (index: number) => {
        setTooltip(EMPTY_TOOLTIP);
        const node = nodesRef.current[index];
        if (node) { onNodeSelect?.(node); graph.selectPointByIndex(index, true); }
      },
      onBackgroundClick: () => {
        setTooltip(EMPTY_TOOLTIP);
        setEdgeTooltip(EMPTY_EDGE_TOOLTIP);
        onNodeSelect?.(null);
        graph.unselectPoints();
      },
      onPointMouseOver: (index: number, _pos, event) => {
        setEdgeTooltip(EMPTY_EDGE_TOOLTIP);
        const node = nodesRef.current[index];
        if (!node || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const me = event as MouseEvent | undefined;
        if (!me) return;
        const nodeEdges = data.edges.filter((e) => e.source === node.id || e.target === node.id);
        setTooltip({
          visible: true,
          x: Math.min(me.clientX - rect.left, rect.width - 280),
          y: Math.max(me.clientY - rect.top - 10, 10),
          node,
          edges: nodeEdges,
        });
      },
      onPointMouseOut: () => setTooltip(EMPTY_TOOLTIP),
      onLinkMouseOver: (linkIndex: number) => {
        setTooltip(EMPTY_TOOLTIP);
        const edge = edgesRef.current[linkIndex];
        if (!edge || !containerRef.current) return;
        setEdgeTooltip({ visible: true, x: mousePosRef.current.x, y: mousePosRef.current.y, edge });
      },
      onLinkMouseOut: () => setEdgeTooltip(EMPTY_EDGE_TOOLTIP),
    });

    graph.setPointPositions(graphData.positions);
    graph.setPointColors(graphData.colors);
    graph.setPointSizes(graphData.sizes);
    graph.setPointShapes(graphData.shapes);
    graph.setLinks(graphData.links);
    graph.setLinkColors(graphData.linkColors);
    graph.setLinkArrows(graphData.linkArrows);

    graph.render(1);
    graphRef.current = graph;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mousePosRef.current = {
        x: Math.min(e.clientX - rect.left, rect.width - 280),
        y: Math.max(e.clientY - rect.top - 10, 10),
      };
    };
    el.addEventListener("mousemove", handleMouseMove);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      graph.destroy();
      graphRef.current = null;
    };
  }, [graphData]); // eslint-disable-line react-hooks/exhaustive-deps

  if (filteredNodes.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        No nodes to display
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap rounded-lg border border-border bg-muted/30 overflow-hidden">
        {[
          { label: "Nodes", value: filteredNodes.length },
          { label: "Edges", value: filteredEdges.length },
          { label: "URIs", value: filteredNodes.filter((n) => n.type === "uri").length, color: TERM_TYPE_COLORS.uri },
          { label: "Literals", value: filteredNodes.filter((n) => n.type === "literal").length, color: TERM_TYPE_COLORS.literal },
        ].map((s) => (
          <div key={s.label} className="flex-1 min-w-0 py-3 px-4 border-r border-border last:border-r-0">
            <div className="mono-label mb-0.5">{s.label}</div>
            <div className="text-lg font-bold" style={s.color ? { color: s.color } : undefined}>{s.value}</div>
          </div>
        ))}
      </div>

      <div ref={containerRef} className="rounded-lg border border-border overflow-hidden graph-bg relative" style={{ height: 500 }}>
        <div ref={canvasRef} className="w-full h-full" />

        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => {
              const next = !simulating;
              graphRef.current?.setConfig({ enableSimulation: next });
              setSimulating(next);
            }}
            className="glass rounded-md w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={simulating ? "Pause simulation" : "Resume simulation"}
          >
            {simulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => graphRef.current?.fitView(400, 0.2)}
            className="glass rounded-md w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Fit graph to view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {tooltip.visible && tooltip.node && (
          <NodeTooltip node={tooltip.node} edges={tooltip.edges} x={tooltip.x} y={tooltip.y} onClose={() => setTooltip(EMPTY_TOOLTIP)} />
        )}

        {edgeTooltip.visible && edgeTooltip.edge && (
          <EdgeTooltip
            edge={edgeTooltip.edge}
            sourceNode={nodeMapRef.current.get(edgeTooltip.edge.source)}
            targetNode={nodeMapRef.current.get(edgeTooltip.edge.target)}
            x={edgeTooltip.x}
            y={edgeTooltip.y}
            onClose={() => setEdgeTooltip(EMPTY_EDGE_TOOLTIP)}
          />
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="mono-label mb-2">Node Types</div>
        <div className="flex flex-wrap items-center gap-4">
          {Object.entries(TERM_TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <span
                className="w-3 h-3 shrink-0"
                style={{
                  backgroundColor: color,
                  borderRadius: type === "uri" ? "50%" : type === "literal" ? "2px" : 0,
                  transform: type === "bnode" ? "rotate(45deg) scale(0.8)" : undefined,
                }}
              />
              <span className="text-xs text-muted-foreground">{TERM_TYPE_LABELS[type]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
