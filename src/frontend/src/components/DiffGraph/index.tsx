import { useEffect, useMemo, useRef, useState } from "react";
import { Graph } from "@cosmos.gl/graph";
import { Maximize2, Pause, Play } from "lucide-react";
import type { GraphResponse, GraphNode, GraphEdge } from "../../types/diff";
import { useGraphStore } from "../../store/graphStore";
import {
  STATUS_COLORS,
  TERM_TYPE_COLORS,
  DEFAULT_COLOR,
  GRAPH_LINK_COLOR,
  NODE_SIZE_MIN,
  NODE_SIZE_MAX,
  GRAPH_CONFIG,
  hexToRgba,
} from "../../lib/constants";
import { getTermType, SHAPE_BY_TERM } from "../../lib/graphUtils";
import { EMPTY_EDGE_TOOLTIP, type EdgeTooltipState } from "../../lib/graphTypes";
import { LegendOverlay } from "./LegendOverlay";
import { NodeTooltip } from "./NodeTooltip";
import { EdgeTooltip } from "./EdgeTooltip";

const STATUS_CLUSTER_MAP = new Map<string, number>();
Object.keys(STATUS_COLORS).forEach((s, i) => STATUS_CLUSTER_MAP.set(s, i));
const UNCHANGED_CLUSTER = STATUS_CLUSTER_MAP.size;

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  node: GraphNode | null;
}

const EMPTY_TOOLTIP: TooltipState = { visible: false, x: 0, y: 0, node: null };

export function DiffGraph({ data }: { data: GraphResponse }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState>(EMPTY_TOOLTIP);
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltipState>(EMPTY_EDGE_TOOLTIP);
  const [simulating, setSimulating] = useState(true);
  const edgesRef = useRef<GraphEdge[]>([]);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const { diffFilters, setSelectedNode, highlightNode, setHighlightNode } = useGraphStore();

  const activeStatuses = useMemo(() => {
    const s = new Set<string>();
    data.nodes.forEach((n) => s.add(n.status));
    data.edges.forEach((e) => s.add(e.status));
    return s;
  }, [data]);

  const { filteredNodes, filteredEdges } = useMemo(() => {
    const { searchQuery, statuses } = diffFilters;
    const query = searchQuery.trim().toLowerCase();
    const hasStatusFilter = statuses.size > 0;
    const matchedIds = new Set<string>();

    for (const n of data.nodes) {
      const matchesSearch = !query || n.id.toLowerCase().includes(query) || n.label.toLowerCase().includes(query);
      const matchesStatus = !hasStatusFilter || statuses.has(n.status);
      if (matchesSearch && matchesStatus) matchedIds.add(n.id);
    }

    if (query) {
      for (const e of data.edges) {
        if (e.predicate.toLowerCase().includes(query)) {
          matchedIds.add(e.source);
          matchedIds.add(e.target);
        }
      }
    }

    const nodes = data.nodes.filter((n) => matchedIds.has(n.id));
    const edges = data.edges.filter((e) => matchedIds.has(e.source) && matchedIds.has(e.target));
    return { filteredNodes: nodes, filteredEdges: edges };
  }, [data, diffFilters]);

  const graphData = useMemo(() => {
    const n = filteredNodes.length;
    if (n === 0) return null;

    const maxBcDiff = Math.max(...filteredNodes.map((nd) => nd.bc_diff ?? 0), 0.001);
    const nodeIndexMap = new Map<string, number>();
    const positions = new Float32Array(n * 2);
    const colors = new Float32Array(n * 4);
    const sizes = new Float32Array(n);
    const shapes = new Float32Array(n);
    const clusters: (number | undefined)[] = [];

    for (let i = 0; i < n; i++) {
      const nd = filteredNodes[i];
      nodeIndexMap.set(nd.id, i);

      const pos = data.positions![nd.id];
      positions[i * 2] = pos[0];
      positions[i * 2 + 1] = pos[1];

      const termType = getTermType(nd.id, nd.is_bnode);
      const hex = TERM_TYPE_COLORS[termType] ?? DEFAULT_COLOR;
      const [r, g, b, a] = hexToRgba(hex);
      colors[i * 4] = r;
      colors[i * 4 + 1] = g;
      colors[i * 4 + 2] = b;
      colors[i * 4 + 3] = a;

      const bcNorm = (nd.bc_diff ?? 0) / maxBcDiff;
      const typeScale = termType === "uri" ? 1.0 : termType === "bnode" ? 0.75 : 0.60;
      sizes[i] = (NODE_SIZE_MIN + bcNorm * (NODE_SIZE_MAX - NODE_SIZE_MIN)) * typeScale;
      shapes[i] = SHAPE_BY_TERM[termType];
      clusters.push(STATUS_CLUSTER_MAP.get(nd.status) ?? UNCHANGED_CLUSTER);
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

    return { positions, colors, sizes, shapes, clusters, links, linkColors, linkArrows, nodeIndexMap, validEdges };
  }, [filteredNodes, filteredEdges, data.positions]);

  // Effect 1: Graph lifecycle — only recreate when the underlying diff result changes
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || data.nodes.length === 0) {
      if (graphRef.current) {
        console.debug("[DiffGraph] destroying graph (no data)");
        graphRef.current.destroy();
        graphRef.current = null;
      }
      return;
    }

    if (graphRef.current) {
      console.debug("[DiffGraph] destroying previous graph instance");
      graphRef.current.destroy();
      graphRef.current = null;
    }
    console.info("[DiffGraph] creating graph: nodes=%d, edges=%d", data.nodes.length, data.edges.length);

    const graph = new Graph(el, {
      ...GRAPH_CONFIG,
      onPointClick: (index: number) => {
        setTooltip(EMPTY_TOOLTIP);
        const node = nodesRef.current[index];
        if (node) { setSelectedNode(node); graph.selectPointByIndex(index, true); }
      },
      onBackgroundClick: () => {
        setTooltip(EMPTY_TOOLTIP);
        setEdgeTooltip(EMPTY_EDGE_TOOLTIP);
        setSelectedNode(null);
        graph.unselectPoints();
      },
      onPointMouseOver: (index: number, _pos, event) => {
        setEdgeTooltip(EMPTY_EDGE_TOOLTIP);
        const node = nodesRef.current[index];
        if (!node || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const me = event as MouseEvent | undefined;
        if (!me) return;
        setTooltip({
          visible: true,
          x: Math.min(me.clientX - rect.left, rect.width - 240),
          y: Math.max(me.clientY - rect.top - 10, 10),
          node,
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
      console.debug("[DiffGraph] cleanup: destroying graph");
      graph.destroy();
      graphRef.current = null;
    };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Buffer updates — runs when filters change without recreating the Graph
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    if (!graphData) {
      graph.setPointPositions(new Float32Array(0));
      graph.setLinks(new Float32Array(0));
      graph.render(1);
      nodesRef.current = [];
      edgesRef.current = [];
      console.debug("[DiffGraph] render: empty (no filtered data)");
      return;
    }

    console.debug("[DiffGraph] render update: visible_nodes=%d, visible_edges=%d",
      filteredNodes.length, filteredEdges.length);
    nodesRef.current = filteredNodes;
    edgesRef.current = graphData.validEdges;

    graph.setPointPositions(graphData.positions);
    graph.setPointColors(graphData.colors);
    graph.setPointSizes(graphData.sizes);
    graph.setPointShapes(graphData.shapes);
    graph.setPointClusters(graphData.clusters);
    graph.setLinks(graphData.links);
    graph.setLinkColors(graphData.linkColors);
    graph.setLinkArrows(graphData.linkArrows);

    graph.render(1);
  }, [graphData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!highlightNode || !graphRef.current || !graphData) return;
    const idx = graphData.nodeIndexMap.get(highlightNode);
    if (idx !== undefined) {
      graphRef.current.selectPointByIndex(idx, true);
    }
    setHighlightNode(null);
  }, [highlightNode, graphData, setHighlightNode]);

  if (data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
        No graph changes detected
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full pointer-events-none">
      {data.sampled && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 glass rounded-lg px-4 py-2 text-sm text-amber-400 pointer-events-auto">
          Showing {filteredNodes.length.toLocaleString()} of {data.original_node_count?.toLocaleString()} nodes
        </div>
      )}

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
        <div className="glass rounded-md px-2.5 py-1.5 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium tabular-nums">{filteredNodes.length}</span> nodes
          </span>
          <span className="w-px h-3 bg-border" />
          <span className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium tabular-nums">{filteredEdges.length}</span> edges
          </span>
        </div>
      </div>

      <div ref={canvasRef} className="w-full h-full graph-bg rounded-lg overflow-hidden border border-border pointer-events-auto" />

      {tooltip.visible && tooltip.node && (
        <NodeTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} onClose={() => setTooltip(EMPTY_TOOLTIP)} />
      )}

      {edgeTooltip.visible && edgeTooltip.edge && (
        <EdgeTooltip edge={edgeTooltip.edge} x={edgeTooltip.x} y={edgeTooltip.y} onClose={() => setEdgeTooltip(EMPTY_EDGE_TOOLTIP)} />
      )}

      <LegendOverlay activeStatuses={activeStatuses} />
    </div>
  );
}
