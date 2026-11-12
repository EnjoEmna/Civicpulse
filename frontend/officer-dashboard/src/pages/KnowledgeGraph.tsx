import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowsClockwise,
  Buildings,
  CaretDown,
  CheckCircle,
  Crosshair,
  Drop,
  FlowArrow,
  Funnel,
  GlobeHemisphereEast,
  Graph,
  Heartbeat,
  Info,
  Lightbulb,
  LinkSimple,
  MagnifyingGlass,
  MapPin,
  Path,
  RoadHorizon,
  ShareNetwork,
  ShieldWarning,
  Sparkle,
  Trash,
  TreeStructure,
  UserCheck,
  WarningCircle,
  Waves,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { api } from "../api/client";
import type { ActiveCitiesResponse } from "../types/spatial";
import type {
  AssetInvestigationResponse,
  ComplaintInvestigationResponse,
  EvidenceChain,
  FlagshipTarget,
  GraphEdge,
  GraphEntityType,
  GraphMetricsResponse,
  GraphNode,
  GraphOverviewResponse,
  NodeNeighborhoodResponse,
  PotentialContributingAsset,
  ShortestPathResponse,
} from "../types/graph";

type InvestigationMode = "asset" | "complaint" | "node";

interface EntityVisualTheme {
  label: string;
  shortLabel: string;
  fill: string;
  stroke: string;
  badgeCls: string;
  pillCls: string;
}

const ENTITY_THEME: Record<GraphEntityType, EntityVisualTheme> = {
  INFRASTRUCTURE_ASSET: {
    label: "Infrastructure Asset",
    shortLabel: "Asset",
    fill: "#0f766e",
    stroke: "#14b8a6",
    badgeCls: "border-teal-300 bg-teal-500/15 text-teal-900",
    pillCls: "bg-teal-50 text-teal-800 border-teal-200",
  },
  COMPLAINT: {
    label: "Complaint",
    shortLabel: "Complaint",
    fill: "#1d4ed8",
    stroke: "#60a5fa",
    badgeCls: "border-blue-300 bg-blue-500/15 text-blue-900",
    pillCls: "bg-blue-50 text-blue-800 border-blue-200",
  },
  HOTSPOT: {
    label: "Spatial Hotspot",
    shortLabel: "Hotspot",
    fill: "#be123c",
    stroke: "#fb7185",
    badgeCls: "border-rose-300 bg-rose-500/15 text-rose-900",
    pillCls: "bg-rose-50 text-rose-800 border-rose-200",
  },
  MAINTENANCE_EVENT: {
    label: "Maintenance Event",
    shortLabel: "Maintenance",
    fill: "#047857",
    stroke: "#34d399",
    badgeCls: "border-emerald-300 bg-emerald-500/15 text-emerald-900",
    pillCls: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  WARD: {
    label: "Ward",
    shortLabel: "Ward",
    fill: "#0369a1",
    stroke: "#38bdf8",
    badgeCls: "border-sky-300 bg-sky-500/15 text-sky-900",
    pillCls: "bg-sky-50 text-sky-800 border-sky-200",
  },
  DEPARTMENT: {
    label: "Department",
    shortLabel: "Department",
    fill: "#4338ca",
    stroke: "#818cf8",
    badgeCls: "border-indigo-300 bg-indigo-500/15 text-indigo-900",
    pillCls: "bg-indigo-50 text-indigo-800 border-indigo-200",
  },
  OFFICER: {
    label: "Officer",
    shortLabel: "Officer",
    fill: "#6d28d9",
    stroke: "#a78bfa",
    badgeCls: "border-violet-300 bg-violet-500/15 text-violet-900",
    pillCls: "bg-violet-50 text-violet-800 border-violet-200",
  },
  CATEGORY: {
    label: "Category",
    shortLabel: "Category",
    fill: "#0e7490",
    stroke: "#22d3ee",
    badgeCls: "border-cyan-300 bg-cyan-500/15 text-cyan-900",
    pillCls: "bg-cyan-50 text-cyan-800 border-cyan-200",
  },
};

const ENTITY_FILTER_OPTIONS: Array<{ value: "all" | GraphEntityType; label: string }> = [
  { value: "all", label: "All Entities" },
  { value: "INFRASTRUCTURE_ASSET", label: "Assets" },
  { value: "COMPLAINT", label: "Complaints" },
  { value: "HOTSPOT", label: "Hotspots" },
  { value: "MAINTENANCE_EVENT", label: "Maintenance" },
  { value: "WARD", label: "Wards" },
  { value: "DEPARTMENT", label: "Departments" },
  { value: "OFFICER", label: "Officers" },
  { value: "CATEGORY", label: "Categories" },
];

const ENTITY_RING_PRIORITY: Record<GraphEntityType, number> = {
  INFRASTRUCTURE_ASSET: 0,
  HOTSPOT: 1,
  COMPLAINT: 2,
  MAINTENANCE_EVENT: 3,
  DEPARTMENT: 4,
  WARD: 5,
  OFFICER: 6,
  CATEGORY: 7,
};

const SVG_WIDTH = 920;
const SVG_HEIGHT = 620;
const CENTER_X = SVG_WIDTH / 2;
const CENTER_Y = SVG_HEIGHT / 2;

function getEntityIcon(entityType: GraphEntityType, assetType?: unknown) {
  if (entityType === "INFRASTRUCTURE_ASSET") {
    const t = String(assetType || "").toUpperCase();
    if (t === "ROAD_SEGMENT") return RoadHorizon;
    if (t === "WATER_PIPELINE") return Drop;
    if (t === "DRAINAGE") return Waves;
    if (t === "STREETLIGHT_CLUSTER") return Lightbulb;
    if (t === "WASTE_POINT") return Trash;
    return Heartbeat;
  }
  switch (entityType) {
    case "HOTSPOT":
      return Crosshair;
    case "MAINTENANCE_EVENT":
      return Wrench;
    case "WARD":
      return MapPin;
    case "DEPARTMENT":
      return Buildings;
    case "OFFICER":
      return UserCheck;
    case "CATEGORY":
      return Sparkle;
    default:
      return Graph;
  }
}

function truncateText(value: string, maxLen: number): string {
  const s = String(value || "").trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(1, maxLen - 1)).trim()}…`;
}

function getShortNodeLabel(node: GraphNode): string {
  const props = node.properties || {};
  if (node.entityType === "INFRASTRUCTURE_ASSET" && props.assetCode) {
    return String(props.assetCode);
  }
  if (node.entityType === "COMPLAINT" && props.referenceId) {
    const ref = String(props.referenceId);
    const title = props.title ? ` · ${truncateText(String(props.title), 14)}` : "";
    return `${ref}${title}`;
  }
  if (node.entityType === "MAINTENANCE_EVENT") {
    return truncateText(node.label.replace(/^Maintenance:\s*/i, ""), 18);
  }
  return truncateText(node.label, 20);
}

function getGradeBadgeCls(grade?: unknown): string {
  const g = String(grade || "").toUpperCase();
  if (g === "CRITICAL") return "border-rose-300 bg-rose-500/15 text-rose-800";
  if (g === "POOR") return "border-amber-300 bg-amber-500/15 text-amber-900";
  if (g === "FAIR") return "border-sky-300 bg-sky-500/15 text-sky-900";
  return "border-emerald-300 bg-emerald-500/15 text-emerald-800";
}

function formatRelationLabel(relation: string): string {
  return relation
    .toLowerCase()
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "Not recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not recorded";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PositionedNode {
  node: GraphNode;
  x: number;
  y: number;
  ring: number;
  radius: number;
}

function computeRadialLayout(
  centerNode: GraphNode | null,
  nodes: GraphNode[],
  edges: GraphEdge[],
  highlightedNodeIds: Set<string>,
): {
  positioned: PositionedNode[];
  visibleIds: Set<string>;
  hiddenCount: number;
} {
  if (!centerNode || nodes.length === 0) {
    return { positioned: [], visibleIds: new Set(), hiddenCount: 0 };
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  const inferredAdj = new Set<string>();

  for (const e of edges) {
    if (!adj.has(e.sourceNodeId)) adj.set(e.sourceNodeId, []);
    if (!adj.has(e.targetNodeId)) adj.set(e.targetNodeId, []);
    adj.get(e.sourceNodeId)!.push(e.targetNodeId);
    adj.get(e.targetNodeId)!.push(e.sourceNodeId);
    if (e.isInferred) {
      inferredAdj.add(e.sourceNodeId);
      inferredAdj.add(e.targetNodeId);
    }
  }

  const hopMap = new Map<string, number>();
  hopMap.set(centerNode.id, 0);
  const queue: string[] = [centerNode.id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curHop = hopMap.get(cur) ?? 0;
    for (const next of adj.get(cur) || []) {
      if (!hopMap.has(next)) {
        hopMap.set(next, Math.min(2, curHop + 1));
        queue.push(next);
      }
    }
  }

  const sortPriority = (a: GraphNode, b: GraphNode) => {
    const aPath = highlightedNodeIds.has(a.id) ? 0 : 1;
    const bPath = highlightedNodeIds.has(b.id) ? 0 : 1;
    if (aPath !== bPath) return aPath - bPath;
    const aInf = inferredAdj.has(a.id) ? 0 : 1;
    const bInf = inferredAdj.has(b.id) ? 0 : 1;
    if (aInf !== bInf) return aInf - bInf;
    const pa = ENTITY_RING_PRIORITY[a.entityType] ?? 9;
    const pb = ENTITY_RING_PRIORITY[b.entityType] ?? 9;
    if (pa !== pb) return pa - pb;
    return a.label.localeCompare(b.label);
  };

  const ring1Raw = nodes
    .filter((n) => n.id !== centerNode.id && hopMap.get(n.id) === 1)
    .sort(sortPriority);
  const ring2Raw = nodes
    .filter((n) => n.id !== centerNode.id && (hopMap.get(n.id) ?? 2) >= 2)
    .sort(sortPriority);

  const MAX_RING1 = 10;
  const MAX_RING2 = 10;
  const ring1 = ring1Raw.slice(0, MAX_RING1);
  const ring2 = ring2Raw.slice(0, MAX_RING2);

  // Ensure any path node is always included
  for (const pid of highlightedNodeIds) {
    if (pid === centerNode.id) continue;
    const pn = nodeMap.get(pid);
    if (!pn) continue;
    if (!ring1.some((x) => x.id === pid) && !ring2.some((x) => x.id === pid)) {
      if (hopMap.get(pid) === 1) {
        if (ring1.length >= MAX_RING1) ring1.pop();
        ring1.push(pn);
      } else {
        if (ring2.length >= MAX_RING2) ring2.pop();
        ring2.push(pn);
      }
    }
  }

  const positioned: PositionedNode[] = [
    { node: centerNode, x: CENTER_X, y: CENTER_Y, ring: 0, radius: 28 },
  ];

  ring1.forEach((node, idx) => {
    const angle = (2 * Math.PI * idx) / Math.max(1, ring1.length) - Math.PI / 2;
    const r = ring1.length > 6 ? (idx % 2 === 0 ? 148 : 186) : 162;
    positioned.push({
      node,
      x: CENTER_X + r * Math.cos(angle),
      y: CENTER_Y + r * Math.sin(angle),
      ring: 1,
      radius: 17,
    });
  });

  ring2.forEach((node, idx) => {
    const angle =
      (2 * Math.PI * idx) / Math.max(1, ring2.length) -
      Math.PI / 2 +
      Math.PI / Math.max(2, ring2.length);
    const r = ring2.length > 6 ? (idx % 2 === 0 ? 246 : 276) : 262;
    positioned.push({
      node,
      x: CENTER_X + r * Math.cos(angle),
      y: CENTER_Y + r * Math.sin(angle),
      ring: 2,
      radius: 13.5,
    });
  });

  const visibleIds = new Set(positioned.map((p) => p.node.id));
  const hiddenCount = Math.max(0, nodes.length - visibleIds.size);

  return { positioned, visibleIds, hiddenCount };
}

export default function KnowledgeGraph() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<"all" | GraphEntityType>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [includeInferred, setIncludeInferred] = useState<boolean>(true);
  const [metricsOpen, setMetricsOpen] = useState<boolean>(false);

  const [citiesData, setCitiesData] = useState<ActiveCitiesResponse | null>(null);
  const [overview, setOverview] = useState<GraphOverviewResponse | null>(null);
  const [metrics, setMetrics] = useState<GraphMetricsResponse | null>(null);

  const [mode, setMode] = useState<InvestigationMode>("asset");
  const [targetKey, setTargetKey] = useState<string>("");

  const [centerNode, setCenterNode] = useState<GraphNode | null>(null);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [investigationSummary, setInvestigationSummary] = useState<string>("");
  const [guardrailNotice, setGuardrailNotice] = useState<string>("");
  const [evidenceChains, setEvidenceChains] = useState<EvidenceChain[]>([]);
  const [potentialAssets, setPotentialAssets] = useState<PotentialContributingAsset[]>([]);
  const [expandedChains, setExpandedChains] = useState<Record<string, boolean>>({});

  const [selectedInspectorNode, setSelectedInspectorNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const [history, setHistory] = useState<Array<{ mode: InvestigationMode; key: string; label: string }>>([]);

  // Shortest Path Tracer state
  const [pathFrom, setPathFrom] = useState<string>("");
  const [pathTo, setPathTo] = useState<string>("");
  const [pathResult, setPathResult] = useState<ShortestPathResponse | null>(null);
  const [tracingPath, setTracingPath] = useState<boolean>(false);

  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [loadingGraph, setLoadingGraph] = useState<boolean>(false);
  const [rebuilding, setRebuilding] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const didHandleInitialParams = useRef(false);

  const applyInvestigationPayload = useCallback(
    (
      nextMode: InvestigationMode,
      nextKey: string,
      payload: AssetInvestigationResponse | ComplaintInvestigationResponse | NodeNeighborhoodResponse,
      recordHistory = false,
    ) => {
      if (recordHistory && centerNode && targetKey && targetKey !== nextKey) {
        setHistory((prev) =>
          [
            ...prev.filter((item) => item.key !== targetKey),
            { mode, key: targetKey, label: centerNode.label },
          ].slice(-6),
        );
      }

      setMode(nextMode);
      setTargetKey(nextKey);
      setCenterNode(payload.centerNode);
      setGraphNodes(payload.nodes);
      setGraphEdges(payload.edges);
      setGuardrailNotice(payload.guardrailNotice);
      setSelectedInspectorNode(payload.centerNode);
      setSelectedEdge(null);

      if ("investigationSummary" in payload) {
        setInvestigationSummary(payload.investigationSummary || "");
        setEvidenceChains(payload.evidenceChains || []);
        setPotentialAssets(payload.potentialContributingAssets || []);
        const initExpanded: Record<string, boolean> = {};
        (payload.evidenceChains || []).slice(0, 2).forEach((ch) => {
          initExpanded[ch.id] = true;
        });
        setExpandedChains(initExpanded);
      } else {
        const counts = Object.entries(payload.neighborCountsByType || {})
          .map(([k, v]) => `${v} ${ENTITY_THEME[k as GraphEntityType]?.shortLabel || k}`)
          .join(" · ");
        setInvestigationSummary(
          counts
            ? `Neighborhood (${payload.depth}-hop): ${counts}`
            : `Focused on ${payload.centerNode.label}`,
        );
        setEvidenceChains([]);
        setPotentialAssets([]);
        setExpandedChains({});
      }
    },
    [centerNode, mode, targetKey],
  );

  const loadTarget = useCallback(
    async (
      nextMode: InvestigationMode,
      rawKey: string,
      opts?: { inferred?: boolean; recordHistory?: boolean; syncUrl?: boolean },
    ) => {
      const cleanKey = rawKey.trim();
      if (!cleanKey) return;
      const useInferred = opts?.inferred ?? includeInferred;

      setLoadingGraph(true);
      setError(null);
      try {
        if (nextMode === "asset") {
          const codeOrId = cleanKey.replace(/^asset:/i, "");
          const res = await api.investigateGraphAsset(codeOrId, {
            includeInferred: useInferred,
          });
          applyInvestigationPayload("asset", res.centerNode.nodeKey, res, opts?.recordHistory);
          if (opts?.syncUrl !== false) {
            const ac = String(res.centerNode.properties?.assetCode || codeOrId);
            setSearchParams({ assetCode: ac }, { replace: true });
          }
        } else if (nextMode === "complaint") {
          const cid = cleanKey.replace(/^complaint:/i, "");
          const res = await api.investigateGraphComplaint(cid, {
            includeInferred: useInferred,
          });
          applyInvestigationPayload("complaint", res.centerNode.nodeKey, res, opts?.recordHistory);
          if (opts?.syncUrl !== false) {
            setSearchParams({ complaintId: cid }, { replace: true });
          }
        } else {
          const res = await api.getGraphNodeNeighborhood(cleanKey, {
            depth: 2,
            maxNodes: 75,
            includeInferred: useInferred,
          });
          applyInvestigationPayload("node", res.centerNode.nodeKey, res, opts?.recordHistory);
          if (opts?.syncUrl !== false) {
            setSearchParams({ nodeKey: res.centerNode.nodeKey }, { replace: true });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load Knowledge Graph entity");
      } finally {
        setLoadingGraph(false);
      }
    },
    [applyInvestigationPayload, includeInferred, setSearchParams],
  );

  const refreshOverviewAndMetrics = useCallback(
    async (cityParam: string, entityFilterParam: "all" | GraphEntityType, qParam: string) => {
      setLoadingOverview(true);
      try {
        const [ov, gm] = await Promise.all([
          api.getGraphOverview({
            city: cityParam !== "all" ? cityParam : undefined,
            entityType: entityFilterParam !== "all" ? entityFilterParam : undefined,
            q: qParam.trim() || undefined,
            limit: 160,
          }),
          api.getGraphMetrics(cityParam !== "all" ? cityParam : undefined),
        ]);
        setOverview(ov);
        setMetrics(gm);
        if (ov.guardrailNotice) {
          setGuardrailNotice((prev) => prev || ov.guardrailNotice);
        }
        return ov;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load Knowledge Graph overview");
        return null;
      } finally {
        setLoadingOverview(false);
      }
    },
    [],
  );

  // Initial mount: read cities, overview, and deep link query params
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const cities = await api.getSpatialCities();
        if (active) setCitiesData(cities);
      } catch {
        // Non-blocking city list fallback
      }

      const ov = await refreshOverviewAndMetrics("all", "all", "");
      if (!active) return;

      const paramAssetCode = searchParams.get("assetCode") || searchParams.get("assetId");
      const paramComplaintId = searchParams.get("complaintId");
      const paramNodeKey = searchParams.get("nodeKey");
      didHandleInitialParams.current = true;

      if (paramAssetCode) {
        await loadTarget("asset", paramAssetCode, { syncUrl: false });
      } else if (paramComplaintId) {
        await loadTarget("complaint", paramComplaintId, { syncUrl: false });
      } else if (paramNodeKey) {
        await loadTarget("node", paramNodeKey, { syncUrl: false });
      } else if (ov) {
        const flagship = ov.flagshipTargets?.[0];
        if (flagship) {
          await loadTarget("asset", flagship.assetCode, { syncUrl: false });
        } else {
          const firstAsset = ov.nodes.find((n) => n.entityType === "INFRASTRUCTURE_ASSET");
          const firstAny = firstAsset || ov.nodes[0];
          if (firstAny) {
            await loadTarget(
              firstAny.entityType === "INFRASTRUCTURE_ASSET"
                ? "asset"
                : firstAny.entityType === "COMPLAINT"
                  ? "complaint"
                  : "node",
              firstAny.nodeKey,
              { syncUrl: false },
            );
          }
        }
      }
    }
    void init();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch overview on city / entity filter / search changes after initial load
  useEffect(() => {
    if (!didHandleInitialParams.current) return;
    const handle = window.setTimeout(() => {
      void refreshOverviewAndMetrics(selectedCity, entityTypeFilter, searchTerm);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [selectedCity, entityTypeFilter, searchTerm, refreshOverviewAndMetrics]);

  // Select good default Shortest Path endpoints when center or overview changes
  const selectablePathNodes = useMemo(() => {
    const merged = new Map<string, GraphNode>();
    for (const n of graphNodes) merged.set(n.nodeKey, n);
    for (const n of overview?.nodes || []) {
      if (!merged.has(n.nodeKey)) merged.set(n.nodeKey, n);
    }
    return Array.from(merged.values()).sort((a, b) => {
      const pa = ENTITY_RING_PRIORITY[a.entityType] ?? 9;
      const pb = ENTITY_RING_PRIORITY[b.entityType] ?? 9;
      if (pa !== pb) return pa - pb;
      return a.label.localeCompare(b.label);
    });
  }, [graphNodes, overview?.nodes]);

  useEffect(() => {
    if (!centerNode || selectablePathNodes.length < 2) return;
    setPathTo(centerNode.nodeKey);

    if (potentialAssets[0]?.upstreamComplaints?.[0]?.nodeKey) {
      setPathFrom(potentialAssets[0].upstreamComplaints[0].nodeKey);
      return;
    }
    if (potentialAssets[0]?.nodeKey) {
      setPathFrom(potentialAssets[0].nodeKey);
      return;
    }
    const candidate = selectablePathNodes.find(
      (n) =>
        n.nodeKey !== centerNode.nodeKey &&
        (n.entityType === "COMPLAINT" || n.entityType === "INFRASTRUCTURE_ASSET"),
    );
    if (candidate) {
      setPathFrom(candidate.nodeKey);
    }
  }, [centerNode, potentialAssets, selectablePathNodes]);

  async function handleSelectCity(city: string) {
    setSelectedCity(city);
    setPathResult(null);
    const ov = await refreshOverviewAndMetrics(city, entityTypeFilter, searchTerm);
    if (!ov) return;
    const flagship = ov.flagshipTargets?.[0];
    if (flagship) {
      await loadTarget("asset", flagship.assetCode, { recordHistory: true });
    } else if (ov.nodes[0]) {
      const n = ov.nodes[0];
      await loadTarget(
        n.entityType === "INFRASTRUCTURE_ASSET"
          ? "asset"
          : n.entityType === "COMPLAINT"
            ? "complaint"
            : "node",
        n.nodeKey,
        { recordHistory: true },
      );
    }
  }

  async function handleToggleInferred() {
    const next = !includeInferred;
    setIncludeInferred(next);
    if (targetKey) {
      await loadTarget(mode, targetKey, { inferred: next, recordHistory: false });
    }
    if (pathFrom && pathTo && pathResult) {
      setTracingPath(true);
      try {
        const res = await api.findGraphShortestPath({
          from: pathFrom,
          to: pathTo,
          maxDepth: 5,
          includeInferred: next,
        });
        setPathResult(res);
      } catch {
        setPathResult(null);
      } finally {
        setTracingPath(false);
      }
    }
  }

  async function handleRebuildGraph() {
    setRebuilding(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.rebuildKnowledgeGraph(
        selectedCity !== "all" ? selectedCity : undefined,
      );
      setNotice(
        `Knowledge Graph rebuilt (${res.nodesSynced} nodes · ${res.edgesSynced} edges · ${res.inferredEdgesCount} inferred links in ${res.durationMs}ms).`,
      );
      await refreshOverviewAndMetrics(selectedCity, entityTypeFilter, searchTerm);
      if (targetKey) {
        await loadTarget(mode, targetKey, { syncUrl: false });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rebuild Knowledge Graph");
    } finally {
      setRebuilding(false);
    }
  }

  async function handleTracePath() {
    if (!pathFrom || !pathTo) return;
    setTracingPath(true);
    setError(null);
    try {
      const res = await api.findGraphShortestPath({
        from: pathFrom,
        to: pathTo,
        maxDepth: 5,
        includeInferred,
      });
      setPathResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shortest path lookup failed");
    } finally {
      setTracingPath(false);
    }
  }

  function focusEntityNode(node: GraphNode) {
    setSelectedInspectorNode(node);
    setSelectedEdge(null);
    if (node.id === centerNode?.id) return;

    if (node.entityType === "INFRASTRUCTURE_ASSET") {
      const code = String(node.properties?.assetCode || node.nodeKey);
      void loadTarget("asset", code, { recordHistory: true });
    } else if (node.entityType === "COMPLAINT") {
      void loadTarget("complaint", node.externalId || node.nodeKey, { recordHistory: true });
    } else {
      void loadTarget("node", node.nodeKey, { recordHistory: true });
    }
  }

  function handleStepBack() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    void loadTarget(prev.mode, prev.key, { recordHistory: false });
  }

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    for (const c of citiesData?.cities || []) {
      if (c.city && c.city !== "General Jurisdiction") set.add(c.city);
    }
    for (const f of overview?.flagshipTargets || []) {
      if (f.city && f.city !== "General Jurisdiction") set.add(f.city);
    }
    for (const n of overview?.nodes || []) {
      if (n.city && n.city !== "General Jurisdiction") set.add(n.city);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [citiesData, overview]);

  const highlightedNodeIds = useMemo(
    () => new Set((pathResult?.found ? pathResult.pathNodes : []).map((n) => n.id)),
    [pathResult],
  );
  const highlightedEdgeIds = useMemo(
    () => new Set((pathResult?.found ? pathResult.pathEdges : []).map((e) => e.id)),
    [pathResult],
  );

  // Merge active neighborhood + shortest path nodes/edges so traced paths render completely on canvas
  const canvasNodes = useMemo(() => {
    const byId = new Map<string, GraphNode>();
    for (const n of graphNodes) byId.set(n.id, n);
    if (pathResult?.found) {
      for (const n of pathResult.pathNodes) byId.set(n.id, n);
    }
    return Array.from(byId.values());
  }, [graphNodes, pathResult]);

  const canvasEdges = useMemo(() => {
    const byId = new Map<string, GraphEdge>();
    for (const e of graphEdges) byId.set(e.id, e);
    if (pathResult?.found) {
      for (const e of pathResult.pathEdges) byId.set(e.id, e);
    }
    return Array.from(byId.values());
  }, [graphEdges, pathResult]);

  const radial = useMemo(
    () => computeRadialLayout(centerNode, canvasNodes, canvasEdges, highlightedNodeIds),
    [centerNode, canvasNodes, canvasEdges, highlightedNodeIds],
  );

  const posMap = useMemo(
    () => new Map(radial.positioned.map((p) => [p.node.id, p])),
    [radial.positioned],
  );

  const renderedEdges = useMemo(
    () =>
      canvasEdges.filter(
        (e) =>
          radial.visibleIds.has(e.sourceNodeId) &&
          radial.visibleIds.has(e.targetNodeId) &&
          (includeInferred || !e.isInferred),
      ),
    [canvasEdges, includeInferred, radial.visibleIds],
  );

  const navigatorNodes = useMemo(() => {
    const byKey = new Map<string, GraphNode>();
    for (const n of overview?.nodes || []) byKey.set(n.nodeKey, n);
    for (const n of graphNodes) if (!byKey.has(n.nodeKey)) byKey.set(n.nodeKey, n);

    const q = searchTerm.trim().toLowerCase();
    return Array.from(byKey.values())
      .filter((n) => {
        if (entityTypeFilter !== "all" && n.entityType !== entityTypeFilter) return false;
        if (selectedCity !== "all") {
          const isGlobal = ["DEPARTMENT", "CATEGORY", "OFFICER"].includes(n.entityType);
          if (!isGlobal && (n.city || "").toLowerCase() !== selectedCity.toLowerCase()) {
            return false;
          }
        }
        if (q) {
          return (
            n.label.toLowerCase().includes(q) ||
            n.nodeKey.toLowerCase().includes(q) ||
            String(n.ward || "").toLowerCase().includes(q) ||
            String(n.city || "").toLowerCase().includes(q)
          );
        }
        return true;
      })
      .slice(0, 24);
  }, [overview?.nodes, graphNodes, entityTypeFilter, selectedCity, searchTerm]);

  const activeProvenance = selectedEdge
    ? {
        title: `${formatRelationLabel(selectedEdge.relationType)} Edge`,
        isInferred: selectedEdge.isInferred,
        confidence: selectedEdge.confidence,
        evidence: selectedEdge.evidence || selectedEdge.provenance?.evidenceSummary,
        provenance: selectedEdge.provenance,
      }
    : selectedInspectorNode
      ? {
          title: `${ENTITY_THEME[selectedInspectorNode.entityType]?.label || selectedInspectorNode.entityType}: ${getShortNodeLabel(selectedInspectorNode)}`,
          isInferred: Boolean(selectedInspectorNode.provenance?.isInferred),
          confidence: selectedInspectorNode.provenance?.confidence ?? 1.0,
          evidence:
            selectedInspectorNode.provenance?.evidenceSummary || selectedInspectorNode.label,
          provenance: selectedInspectorNode.provenance,
        }
      : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-800">
            <ShareNetwork size={13} weight="bold" />
            Connected Civic Context · Layer 4
          </span>
          <h1 className="pt-1.5 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Civic Knowledge Graph
          </h1>
          <p className="text-sm font-medium text-ink-soft">
            Explore multi-hop relationships connecting complaints, physical infrastructure assets, spatial hotspots, maintenance events, wards, and departments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMetricsOpen((prev) => !prev)}
            aria-expanded={metricsOpen}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/75 bg-white/65 px-3.5 py-2 text-xs font-bold text-ink-soft shadow-sm backdrop-blur-md transition hover:bg-white hover:text-ink cursor-pointer"
          >
            <TreeStructure size={14} weight="bold" />
            Graph Metrics &amp; Coverage
            <CaretDown
              size={12}
              weight="bold"
              className={`transition-transform ${metricsOpen ? "rotate-180" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={() => void handleRebuildGraph()}
            disabled={rebuilding}
            className="ios-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
          >
            <ArrowsClockwise size={14} className={rebuilding ? "animate-spin" : ""} />
            {rebuilding
              ? "Syncing Graph…"
              : selectedCity !== "all"
                ? `Sync ${selectedCity} Graph`
                : "Rebuild Graph"}
          </button>
        </div>
      </div>

      {/* Collapsible Graph Evaluation Metrics & Coverage Drawer */}
      <AnimatePresence initial={false}>
        {metricsOpen && metrics && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="glass-panel border border-indigo-200/75 bg-gradient-to-r from-indigo-50/80 via-white/80 to-sky-50/75 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkle size={15} weight="duotone" className="text-indigo-700" />
                  <span className="font-extrabold text-ink">
                    Knowledge Graph Coverage, Provenance &amp; Connectivity
                    {metrics.city ? ` (${metrics.city})` : " (All Jurisdictions)"}
                  </span>
                </div>
                <span className="text-[11px] text-ink-soft">
                  Last synced: {formatDateTime(metrics.lastSyncedAt)}
                </span>
              </div>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-white/85 bg-white/75 px-3 py-2.5">
                  <span className="block text-[10px] font-bold uppercase text-ink-soft">
                    Entities &amp; Links
                  </span>
                  <span className="mt-0.5 block font-mono text-base font-extrabold text-ink">
                    {metrics.totalNodes} nodes · {metrics.totalEdges} edges
                  </span>
                  <span className="text-[10px] text-ink-soft">PostgreSQL graph store</span>
                </div>

                <div className="rounded-xl border border-white/85 bg-white/75 px-3 py-2.5">
                  <span className="block text-[10px] font-bold uppercase text-ink-soft">
                    Provenance Completeness
                  </span>
                  <span className="mt-0.5 block font-mono text-base font-extrabold text-emerald-700">
                    {metrics.provenanceCompletenessPercent}%
                  </span>
                  <span className="text-[10px] text-ink-soft">
                    Source table &amp; confidence tracked
                  </span>
                </div>

                <div className="rounded-xl border border-white/85 bg-white/75 px-3 py-2.5">
                  <span className="block text-[10px] font-bold uppercase text-ink-soft">
                    Asset Connectivity
                  </span>
                  <span className="mt-0.5 block font-mono text-base font-extrabold text-indigo-800">
                    {metrics.relationshipCoverage.assetConnectivityPercent}%
                  </span>
                  <span className="text-[10px] text-ink-soft">
                    {metrics.relationshipCoverage.connectedAssets}/
                    {metrics.relationshipCoverage.assetCount} assets linked
                  </span>
                </div>

                <div className="rounded-xl border border-white/85 bg-white/75 px-3 py-2.5">
                  <span className="block text-[10px] font-bold uppercase text-ink-soft">
                    Complaint Coverage
                  </span>
                  <span className="mt-0.5 block font-mono text-base font-extrabold text-blue-700">
                    {metrics.relationshipCoverage.complaintConnectivityPercent}%
                  </span>
                  <span className="text-[10px] text-ink-soft">
                    {metrics.relationshipCoverage.connectedComplaints}/
                    {metrics.relationshipCoverage.complaintCount} complaints connected
                  </span>
                </div>

                <div className="rounded-xl border border-white/85 bg-white/75 px-3 py-2.5">
                  <span className="block text-[10px] font-bold uppercase text-ink-soft">
                    Verified vs Inferred
                  </span>
                  <span className="mt-0.5 block font-mono text-base font-extrabold text-amber-800">
                    {metrics.factualEdgesCount} factual · {metrics.inferredEdgesCount} inferred
                  </span>
                  <span className="text-[10px] text-ink-soft">
                    {metrics.crossInfrastructurePotentialLinks} cross-infra potential link(s)
                  </span>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {Object.entries(metrics.nodesByType || {}).map(([type, count]) => {
                  const theme = ENTITY_THEME[type as GraphEntityType];
                  return (
                    <span
                      key={type}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        theme?.pillCls || "border-slate-200 bg-white/80 text-slate-700"
                      }`}
                    >
                      {theme?.shortLabel || type}: {count}
                    </span>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guardrail Banner */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300/65 bg-amber-50/75 px-4 py-2.5 text-xs text-amber-950 backdrop-blur-md">
        <ShieldWarning size={17} weight="fill" className="mt-0.5 shrink-0 text-amber-700" />
        <p className="leading-relaxed">
          <strong className="font-bold">Non-Causal Inference Guardrail: </strong>
          {guardrailNotice ||
            "Confirmed records appear as solid lines; spatial or semantic inferences appear as dashed amber links marked 'Potential Relationship (Non-Causal)' and require field verification."}
        </p>
      </div>

      {/* Notices & Errors */}
      {notice && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300/70 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="shrink-0 text-emerald-700" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notice"
            className="rounded-md p-1 text-emerald-800 hover:bg-emerald-500/20 cursor-pointer"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2.5 rounded-xl border border-rose-300/70 bg-rose-500/15 px-4 py-3 text-xs font-semibold text-rose-900"
        >
          <div className="flex items-center gap-2">
            <WarningCircle size={18} weight="fill" className="shrink-0 text-rose-700" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="rounded-md p-1 text-rose-800 hover:bg-rose-500/20 cursor-pointer"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      )}

      {/* Filter, Flagship Targets & Inferred Link Controls */}
      <div className="glass-panel flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          {/* City Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              <GlobeHemisphereEast size={14} className="text-primary" />
              Jurisdiction:
            </span>
            <button
              type="button"
              onClick={() => void handleSelectCity("all")}
              className={`rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                selectedCity === "all"
                  ? "bg-primary text-white shadow-sm"
                  : "border border-white/70 bg-white/65 text-ink-soft hover:bg-white"
              }`}
            >
              All Cities
            </button>
            {availableCities.map((city) => {
              const active = selectedCity.toLowerCase() === city.toLowerCase();
              return (
                <button
                  key={city}
                  type="button"
                  onClick={() => void handleSelectCity(city)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                    active
                      ? "bg-primary text-white shadow-sm"
                      : "border border-white/70 bg-white/65 text-ink-soft hover:bg-white"
                  }`}
                >
                  {city}
                </button>
              );
            })}
          </div>

          {/* Toggle Inferred Relationships */}
          <button
            type="button"
            onClick={() => void handleToggleInferred()}
            aria-pressed={includeInferred}
            className={`inline-flex items-center gap-2 self-start rounded-full border px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              includeInferred
                ? "border-amber-300 bg-amber-50/90 text-amber-900 shadow-sm"
                : "border-slate-200 bg-white/70 text-ink-soft hover:bg-white"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                includeInferred ? "bg-amber-500" : "bg-slate-400"
              }`}
            />
            Show Inferred Links {includeInferred ? "(On)" : "(Off)"}
          </button>
        </div>

        {/* Flagship Investigation Targets */}
        {overview && overview.flagshipTargets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/50 pt-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Priority Asset Targets:
            </span>
            {overview.flagshipTargets.map((target: FlagshipTarget) => {
              const isActive =
                centerNode?.nodeKey === target.nodeKey ||
                String(centerNode?.properties?.assetCode || "") === target.assetCode;
              return (
                <button
                  key={target.nodeKey}
                  type="button"
                  onClick={() => void loadTarget("asset", target.assetCode, { recordHistory: true })}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                    isActive
                      ? "border-indigo-400 bg-indigo-600 text-white shadow-sm"
                      : "border-white/80 bg-white/70 text-ink hover:bg-white"
                  }`}
                >
                  <span className="font-mono">{target.assetCode}</span>
                  {target.healthScore != null && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                        isActive
                          ? "bg-white/20 text-white"
                          : getGradeBadgeCls(target.healthGrade)
                      }`}
                    >
                      {target.healthScore} {target.healthGrade}
                    </span>
                  )}
                  {target.city && (
                    <span className={isActive ? "text-indigo-100" : "text-ink-soft"}>
                      · {target.city}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Search + Entity Type Filter */}
        <div className="flex flex-col gap-2.5 border-t border-white/50 pt-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search node by asset code, CP reference, ward, or issue..."
              aria-label="Search Knowledge Graph entities"
              className="glass-input w-full py-1.5 pl-8 pr-3 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Funnel size={13} className="mr-1 text-ink-soft" />
            {ENTITY_FILTER_OPTIONS.map((opt) => {
              const active = entityTypeFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEntityTypeFilter(opt.value)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                    active
                      ? "bg-slate-800 text-white shadow-sm"
                      : "border border-white/70 bg-white/60 text-ink-soft hover:bg-white"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Split Explorer */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.28fr)_minmax(0,0.92fr)] xl:items-start">
        {/* LEFT PANE: Interactive Radial Graph + Entity Navigator */}
        <div className="glass-panel flex flex-col gap-3.5 p-4 sm:p-5">
          {/* Canvas Header + Navigation History */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={handleStepBack}
                disabled={history.length === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-white/80 bg-white/75 px-2.5 py-1 text-[11px] font-bold text-ink transition hover:bg-white disabled:opacity-45 cursor-pointer"
              >
                <ArrowLeft size={12} weight="bold" />
                Back
              </button>

              {history.slice(-2).map((h) => (
                <span
                  key={h.key}
                  className="hidden sm:inline-flex items-center gap-1 text-[11px] text-ink-soft"
                >
                  <span className="truncate max-w-[110px]">{h.label}</span>
                  <span>→</span>
                </span>
              ))}

              {centerNode && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${
                    ENTITY_THEME[centerNode.entityType]?.badgeCls || ""
                  }`}
                >
                  {ENTITY_THEME[centerNode.entityType]?.shortLabel || centerNode.entityType}:{" "}
                  {truncateText(centerNode.label, 34)}
                </span>
              )}
            </div>

            {/* Edge Legend */}
            <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-bold text-ink-soft">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-0.5 w-4 bg-blue-600" />
                Confirmed Fact
              </span>
              <span className="inline-flex items-center gap-1 text-amber-800">
                <span className="inline-block h-0 w-4 border-t-2 border-dashed border-amber-600" />
                Inferred (Non-Causal)
              </span>
              {pathResult?.found && (
                <span className="inline-flex items-center gap-1 text-violet-700">
                  <span className="inline-block h-1 w-4 rounded bg-violet-600" />
                  Shortest Path
                </span>
              )}
            </div>
          </div>

          {/* Interactive SVG Radial Graph */}
          <div className="relative min-h-[540px] w-full overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-slate-50/90 via-white/85 to-indigo-50/70 shadow-inner">
            {(loadingGraph || (loadingOverview && !centerNode)) && (
              <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-white/60 text-xs font-bold text-ink backdrop-blur-[2px]">
                <ArrowsClockwise size={17} className="animate-spin text-primary" />
                Traversing civic graph neighborhood…
              </div>
            )}

            {!centerNode && !loadingGraph && !loadingOverview ? (
              <div className="flex h-[540px] flex-col items-center justify-center gap-2 px-6 text-center text-xs text-ink-soft">
                <ShareNetwork size={28} className="text-indigo-500" />
                <p className="font-semibold text-ink">No graph nodes available for current filter.</p>
                <p>Click “Rebuild Graph” or choose another jurisdiction above.</p>
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className="h-[540px] w-full select-none"
                role="img"
                aria-label="Interactive Civic Knowledge Graph Radial Explorer"
              >
                <defs>
                  <marker
                    id="kg-arrow-factual"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#64748b" />
                  </marker>
                  <marker
                    id="kg-arrow-inferred"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#d97706" />
                  </marker>
                  <marker
                    id="kg-arrow-path"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#7c3aed" />
                  </marker>
                </defs>

                {/* Subtle Concentric Guide Rings */}
                <circle
                  cx={CENTER_X}
                  cy={CENTER_Y}
                  r={162}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeOpacity={0.5}
                  strokeDasharray="4 6"
                />
                <circle
                  cx={CENTER_X}
                  cy={CENTER_Y}
                  r={262}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeOpacity={0.75}
                  strokeDasharray="3 6"
                />

                {/* Edges */}
                {renderedEdges.map((edge) => {
                  const src = posMap.get(edge.sourceNodeId);
                  const tgt = posMap.get(edge.targetNodeId);
                  if (!src || !tgt) return null;

                  const dx = tgt.x - src.x;
                  const dy = tgt.y - src.y;
                  const dist = Math.hypot(dx, dy) || 1;
                  const ux = dx / dist;
                  const uy = dy / dist;

                  const startX = src.x + ux * (src.radius + 3);
                  const startY = src.y + uy * (src.radius + 3);
                  const endX = tgt.x - ux * (tgt.radius + 6);
                  const endY = tgt.y - uy * (tgt.radius + 6);

                  const isOnPath = highlightedEdgeIds.has(edge.id);
                  const isSelected = selectedEdge?.id === edge.id;
                  const isHovered = hoveredEdgeId === edge.id;

                  const strokeColor = isOnPath
                    ? "#7c3aed"
                    : isSelected || isHovered
                      ? "#0f172a"
                      : edge.isInferred
                        ? "#d97706"
                        : "#94a3b8";

                  const markerId = isOnPath
                    ? "url(#kg-arrow-path)"
                    : edge.isInferred
                      ? "url(#kg-arrow-inferred)"
                      : "url(#kg-arrow-factual)";

                  return (
                    <g
                      key={edge.id}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredEdgeId(edge.id)}
                      onMouseLeave={() => setHoveredEdgeId((prev) => (prev === edge.id ? null : prev))}
                      onClick={() => {
                        setSelectedEdge(edge);
                      }}
                    >
                      {/* Invisible wide hit area */}
                      <line
                        x1={startX}
                        y1={startY}
                        x2={endX}
                        y2={endY}
                        stroke="transparent"
                        strokeWidth={14}
                      />
                      <line
                        x1={startX}
                        y1={startY}
                        x2={endX}
                        y2={endY}
                        stroke={strokeColor}
                        strokeWidth={
                          isOnPath ? 3.2 : isSelected || isHovered ? 2.6 : edge.isInferred ? 2 : 1.4
                        }
                        strokeOpacity={
                          isOnPath || isSelected || isHovered || edge.isInferred ? 0.92 : 0.65
                        }
                        strokeDasharray={edge.isInferred ? "6 4" : undefined}
                        markerEnd={markerId}
                      />
                    </g>
                  );
                })}

                {/* Nodes */}
                {radial.positioned.map(({ node, x, y, ring, radius }) => {
                  const theme = ENTITY_THEME[node.entityType] || ENTITY_THEME.COMPLAINT;
                  const isCenter = ring === 0;
                  const isPathNode = highlightedNodeIds.has(node.id);
                  const isInspected = selectedInspectorNode?.id === node.id && !selectedEdge;
                  const shortLabel = getShortNodeLabel(node);
                  const badgeScore =
                    node.entityType === "INFRASTRUCTURE_ASSET" &&
                    node.properties?.healthScore != null
                      ? `${node.properties.healthScore}`
                      : null;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${x}, ${y})`}
                      className="cursor-pointer group"
                      onClick={() => focusEntityNode(node)}
                    >
                      {(isCenter || isPathNode || isInspected) && (
                        <circle
                          r={radius + 6}
                          fill="none"
                          stroke={isPathNode ? "#7c3aed" : theme.stroke}
                          strokeWidth={isPathNode ? 2.5 : 2}
                          strokeOpacity={0.45}
                        />
                      )}

                      <circle
                        r={radius}
                        fill={theme.fill}
                        stroke="#ffffff"
                        strokeWidth={isCenter ? 3 : 2}
                      />

                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={isCenter ? 9.5 : 8}
                        fontWeight={800}
                        fill="#ffffff"
                      >
                        {badgeScore
                          ? badgeScore
                          : (ENTITY_THEME[node.entityType]?.shortLabel || "NODE")
                              .slice(0, 3)
                              .toUpperCase()}
                      </text>

                      {/* Readable label badge under node */}
                      <g transform={`translate(0, ${radius + 12})`}>
                        <rect
                          x={-54}
                          y={-8.5}
                          width={108}
                          height={17}
                          rx={6}
                          fill="#ffffff"
                          fillOpacity={isCenter ? 0.97 : 0.9}
                          stroke={isPathNode ? "#8b5cf6" : "#e2e8f0"}
                          strokeWidth={0.9}
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={isCenter ? 9 : 8}
                          fontWeight={isCenter ? 800 : 700}
                          fill="#0f172a"
                        >
                          {truncateText(shortLabel, 17)}
                        </text>
                      </g>
                    </g>
                  );
                })}

                {/* Top Overlay Layer for Selected / Hovered / Path / Upstream Potential Edge Badges */}
                {renderedEdges.map((edge) => {
                  const isOnPath = highlightedEdgeIds.has(edge.id);
                  const isSelected = selectedEdge?.id === edge.id;
                  const isHovered = hoveredEdgeId === edge.id;
                  const isPrimaryPotential = edge.relationType === "POTENTIALLY_IMPACTS";
                  if (!isOnPath && !isSelected && !isHovered && !isPrimaryPotential) return null;

                  const src = posMap.get(edge.sourceNodeId);
                  const tgt = posMap.get(edge.targetNodeId);
                  if (!src || !tgt) return null;

                  const dx = tgt.x - src.x;
                  const dy = tgt.y - src.y;
                  const dist = Math.hypot(dx, dy) || 1;
                  const ux = dx / dist;
                  const uy = dy / dist;
                  const startX = src.x + ux * (src.radius + 3);
                  const startY = src.y + uy * (src.radius + 3);
                  const endX = tgt.x - ux * (tgt.radius + 6);
                  const endY = tgt.y - uy * (tgt.radius + 6);
                  const t = isPrimaryPotential && !isSelected && !isHovered ? 0.42 : 0.5;
                  const labelX = startX + (endX - startX) * t;
                  const labelY = startY + (endY - startY) * t;
                  const labelText = edge.isInferred
                    ? `${truncateText(edge.relationType, 14)} ?`
                    : truncateText(edge.relationType, 16);

                  return (
                    <g
                      key={`lbl-${edge.id}`}
                      transform={`translate(${labelX}, ${labelY})`}
                      className="pointer-events-none"
                    >
                      <rect
                        x={-56}
                        y={-9}
                        width={112}
                        height={18}
                        rx={9}
                        fill={isOnPath ? "#f3e8ff" : edge.isInferred ? "#fef3c7" : "#f1f5f9"}
                        stroke={isOnPath ? "#a855f7" : edge.isInferred ? "#f59e0b" : "#94a3b8"}
                        strokeWidth={1}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={8.5}
                        fontWeight={800}
                        fill={isOnPath ? "#6b21a8" : edge.isInferred ? "#92400e" : "#1e293b"}
                      >
                        {labelText}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Bottom-right node count / cap chip */}
            {centerNode && (
              <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full border border-white/80 bg-white/85 px-2.5 py-1 text-[10px] font-semibold text-ink-soft shadow-sm backdrop-blur-sm">
                  Showing {radial.positioned.length} nodes &amp; {renderedEdges.length} edges
                  {radial.hiddenCount > 0 ? ` (${radial.hiddenCount} more in list below)` : ""}
                  {" · Click any node to pivot or any edge for provenance"}
                </span>
              </div>
            )}
          </div>

          {/* Compact Entity Navigator Chips */}
          <div className="border-t border-white/50 pt-3">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              <span>Entity Navigator ({navigatorNodes.length})</span>
              <span className="font-normal normal-case">
                Click any item to focus graph exploration
              </span>
            </div>

            {navigatorNodes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/75 bg-white/45 px-3 py-3 text-center text-xs text-ink-soft">
                No entities matched your search/filter.
              </p>
            ) : (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {navigatorNodes.map((n) => {
                  const theme = ENTITY_THEME[n.entityType] || ENTITY_THEME.COMPLAINT;
                  const active = centerNode?.nodeKey === n.nodeKey;
                  const Icon = getEntityIcon(n.entityType, n.properties?.assetType);
                  return (
                    <button
                      key={n.nodeKey}
                      type="button"
                      onClick={() => focusEntityNode(n)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-left text-[11px] font-semibold transition cursor-pointer ${
                        active
                          ? "border-indigo-400 bg-indigo-600 text-white shadow-sm"
                          : "border-white/80 bg-white/70 text-ink hover:bg-white"
                      }`}
                    >
                      <Icon size={12} weight="duotone" className={active ? "text-white" : "text-primary"} />
                      <span
                        className={`rounded px-1 py-0.5 text-[9px] font-extrabold uppercase ${
                          active ? "bg-white/20 text-white" : theme.pillCls
                        }`}
                      >
                        {theme.shortLabel}
                      </span>
                      <span className="max-w-[175px] truncate">{n.label}</span>
                      {n.entityType === "INFRASTRUCTURE_ASSET" &&
                        n.properties?.healthScore != null && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-extrabold ${
                              active
                                ? "bg-white/20 text-white"
                                : getGradeBadgeCls(n.properties?.healthGrade)
                            }`}
                          >
                            {String(n.properties.healthScore)}
                          </span>
                        )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE: Investigation Summary, Potential Contributors, Evidence Chains, Path Tracer & Provenance */}
        <div className="flex flex-col gap-4">
          {/* 1. Investigation Summary Card */}
          <div className="glass-panel flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                  <LinkSimple size={13} weight="bold" className="text-primary" />
                  Focused Investigation
                </span>
                <h2 className="mt-1 text-base font-extrabold leading-snug text-ink">
                  {centerNode ? centerNode.label : "Select an entity"}
                </h2>
                {centerNode && (
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {[
                      ENTITY_THEME[centerNode.entityType]?.label,
                      centerNode.ward,
                      centerNode.city,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>

              {centerNode?.entityType === "INFRASTRUCTURE_ASSET" &&
                centerNode.properties?.healthScore != null && (
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-xs font-extrabold ${getGradeBadgeCls(
                      centerNode.properties?.healthGrade,
                    )}`}
                  >
                    {String(centerNode.properties.healthScore)}/100 ·{" "}
                    {String(centerNode.properties.healthGrade || "")}
                  </span>
                )}
            </div>

            {investigationSummary && (
              <p className="rounded-xl border border-white/75 bg-white/65 px-3.5 py-2.5 text-xs leading-relaxed text-ink">
                {investigationSummary}
              </p>
            )}

            {/* Deep Links back into Layer 2 / Layer 3 / Case Review */}
            {centerNode && (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {centerNode.entityType === "INFRASTRUCTURE_ASSET" && (
                  <Link
                    to={`/officer/infrastructure-health?assetId=${encodeURIComponent(
                      centerNode.externalId || String(centerNode.properties?.assetCode || ""),
                    )}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50/85 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
                  >
                    <Heartbeat size={13} weight="bold" />
                    Open Health Breakdown
                    <ArrowUpRight size={12} weight="bold" />
                  </Link>
                )}

                {centerNode.entityType === "INFRASTRUCTURE_ASSET" &&
                  centerNode.properties?.latitude != null &&
                  centerNode.properties?.longitude != null && (
                    <Link
                      to={`/officer/spatial-intelligence?city=${encodeURIComponent(
                        centerNode.city || "all",
                      )}&lat=${String(centerNode.properties.latitude)}&lng=${String(
                        centerNode.properties.longitude,
                      )}&ward=${encodeURIComponent(centerNode.ward || "")}&ref=${encodeURIComponent(
                        String(centerNode.properties.assetCode || ""),
                      )}`}
                      className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50/85 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-blue-100"
                    >
                      <Crosshair size={13} weight="bold" />
                      Spatial Map
                    </Link>
                  )}

                {centerNode.entityType === "COMPLAINT" && centerNode.externalId && (
                  <Link
                    to={`/officer/complaints/${encodeURIComponent(centerNode.externalId)}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50/85 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-blue-100"
                  >
                    Open Complaint Review
                    <ArrowUpRight size={12} weight="bold" />
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* 2. Potential Contributing Infrastructure Cards (Non-Causal Guardrail) */}
          {potentialAssets.length > 0 && (
            <div className="glass-panel flex flex-col gap-3 border border-amber-300/75 bg-amber-50/55 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldWarning size={16} weight="fill" className="text-amber-700" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-950">
                    Potential Contributing Infrastructure ({potentialAssets.length})
                  </h3>
                </div>
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-900">
                  Potential Relationship (Non-Causal)
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {potentialAssets.map((pot) => (
                  <div
                    key={pot.assetNodeId}
                    className="rounded-2xl border border-amber-200/90 bg-white/85 p-3.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-extrabold text-primary">
                          {pot.assetCode}
                        </span>
                        <span className="font-bold text-ink">{pot.name}</span>
                      </div>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-extrabold text-amber-900">
                        {pot.distanceMeters != null ? `${Math.round(pot.distanceMeters)}m away · ` : ""}
                        {Math.round(pot.confidence * 100)}% conf
                      </span>
                    </div>

                    {pot.evidence && (
                      <p className="mt-1.5 leading-snug text-ink">{pot.evidence}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-amber-100 pt-2">
                      <span className="text-[11px] font-semibold text-ink-soft">
                        Upstream open complaints:{" "}
                        <strong className="font-mono text-ink">{pot.upstreamOpenComplaints}</strong>
                        {pot.healthScore != null ? ` · Health ${pot.healthScore}/100` : ""}
                      </span>

                      <button
                        type="button"
                        onClick={() => void loadTarget("asset", pot.assetCode, { recordHistory: true })}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 cursor-pointer"
                      >
                        Focus {pot.assetCode}
                        <ArrowUpRight size={11} weight="bold" />
                      </button>
                    </div>

                    <p className="mt-1.5 text-[10px] italic text-amber-900/90">
                      {pot.disclaimer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Multi-Hop Evidence Chains */}
          {evidenceChains.length > 0 && (
            <div className="glass-panel flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FlowArrow size={15} weight="bold" className="text-indigo-700" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink">
                    Evidence Chains ({evidenceChains.length})
                  </h3>
                </div>
                <span className="text-[11px] text-ink-soft">Click chain to expand steps</span>
              </div>

              <div className="flex flex-col gap-2">
                {evidenceChains.map((chain) => {
                  const isOpen = Boolean(expandedChains[chain.id]);
                  return (
                    <div
                      key={chain.id}
                      className="rounded-2xl border border-white/80 bg-white/65 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedChains((prev) => ({
                            ...prev,
                            [chain.id]: !prev[chain.id],
                          }))
                        }
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs hover:bg-white/75 cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-ink">{chain.title}</span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                chain.isInferred
                                  ? "border-amber-300 bg-amber-50 text-amber-900"
                                  : "border-emerald-300 bg-emerald-50 text-emerald-800"
                              }`}
                            >
                              {chain.isInferred ? "Potential (Inferred)" : "Confirmed Fact"} ·{" "}
                              {Math.round(chain.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                        <CaretDown
                          size={13}
                          weight="bold"
                          className={`shrink-0 text-ink-soft transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {isOpen && (
                        <div className="border-t border-white/60 bg-white/50 px-3.5 py-3 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {chain.steps.map((step, idx) => (
                              <div key={`${chain.id}-${step.nodeKey}-${idx}`} className="flex items-center gap-1.5">
                                <span
                                  className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${
                                    ENTITY_THEME[step.entityType]?.pillCls ||
                                    "border-slate-200 bg-white text-ink"
                                  }`}
                                >
                                  {step.label}
                                </span>
                                {step.edgeLabelAfter && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                                      step.isInferred
                                        ? "border border-dashed border-amber-400 bg-amber-50 text-amber-900"
                                        : "bg-slate-200/80 text-slate-700"
                                    }`}
                                  >
                                    → {step.edgeLabelAfter}
                                    {step.isInferred ? " ?" : ""} →
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          {chain.summary && (
                            <p className="mt-2 text-[11px] text-ink-soft">{chain.summary}</p>
                          )}
                          {chain.disclaimer && (
                            <p className="mt-1 text-[10px] italic text-amber-900">
                              {chain.disclaimer}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Shortest Path Tracer */}
          <div className="glass-panel flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Path size={15} weight="bold" className="text-violet-700" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink">
                  Shortest Path Tracer (BFS)
                </h3>
              </div>
              {pathResult && (
                <button
                  type="button"
                  onClick={() => setPathResult(null)}
                  className="text-[11px] font-bold text-ink-soft hover:text-ink cursor-pointer"
                >
                  Clear Path
                </button>
              )}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="kg-path-from" className="text-[11px] font-bold text-ink-soft">
                  From Entity
                </label>
                <select
                  id="kg-path-from"
                  value={pathFrom}
                  onChange={(e) => setPathFrom(e.target.value)}
                  className="glass-input w-full py-1.5 px-2.5 text-xs font-medium"
                >
                  {selectablePathNodes.map((n) => (
                    <option key={`from-${n.nodeKey}`} value={n.nodeKey}>
                      [{ENTITY_THEME[n.entityType]?.shortLabel || n.entityType}] {n.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="kg-path-to" className="text-[11px] font-bold text-ink-soft">
                  To Entity
                </label>
                <select
                  id="kg-path-to"
                  value={pathTo}
                  onChange={(e) => setPathTo(e.target.value)}
                  className="glass-input w-full py-1.5 px-2.5 text-xs font-medium"
                >
                  {selectablePathNodes.map((n) => (
                    <option key={`to-${n.nodeKey}`} value={n.nodeKey}>
                      [{ENTITY_THEME[n.entityType]?.shortLabel || n.entityType}] {n.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleTracePath()}
              disabled={tracingPath || !pathFrom || !pathTo}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60 cursor-pointer"
            >
              <Path size={14} weight="bold" />
              {tracingPath ? "Tracing Path…" : "Find Shortest Path"}
            </button>

            {pathResult && (
              <div className="rounded-2xl border border-violet-200/80 bg-violet-50/65 p-3.5 text-xs">
                {pathResult.found ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-extrabold text-violet-950">
                        {pathResult.hopCount}-Hop Path Found
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          pathResult.containsInferredEdge
                            ? "border-amber-300 bg-amber-100 text-amber-900"
                            : "border-emerald-300 bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {pathResult.containsInferredEdge
                          ? "Contains Inferred Link (Non-Causal)"
                          : "Confirmed Records Only"}
                      </span>
                    </div>
                    <ol className="space-y-1.5 text-[11px] text-ink">
                      {pathResult.narrativeSteps.map((step, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[9px] font-bold text-white">
                            {i + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <p className="font-medium text-ink-soft">
                    No connecting path found within 5 hops under the current “Show Inferred Links” setting.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 5. Provenance Metadata Inspector */}
          {activeProvenance && (
            <div className="glass-panel flex flex-col gap-2.5 p-5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Info size={15} weight="duotone" className="text-primary" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink">
                    Provenance Inspector
                  </h3>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    activeProvenance.isInferred
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {activeProvenance.isInferred ? "Inferred · Non-Causal" : "Confirmed Record"} ·{" "}
                  {Math.round(Number(activeProvenance.confidence ?? 1) * 100)}%
                </span>
              </div>

              <p className="font-bold text-ink">{activeProvenance.title}</p>
              {activeProvenance.evidence && (
                <p className="rounded-xl border border-white/75 bg-white/60 px-3 py-2 text-[11px] text-ink">
                  {activeProvenance.evidence}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl border border-white/70 bg-white/55 px-2.5 py-2">
                  <span className="block text-[10px] font-bold uppercase text-ink-soft">
                    Source Table
                  </span>
                  <span className="font-mono font-semibold text-ink">
                    {activeProvenance.provenance?.sourceTable || "derived"}
                  </span>
                </div>
                <div className="rounded-xl border border-white/70 bg-white/55 px-2.5 py-2">
                  <span className="block text-[10px] font-bold uppercase text-ink-soft">
                    Generator Model
                  </span>
                  <span className="font-mono font-semibold text-ink">
                    {activeProvenance.provenance?.model || "civicpulse-kg-builder"} v
                    {activeProvenance.provenance?.version || "1.0.0"}
                  </span>
                </div>
                <div className="col-span-2 rounded-xl border border-white/70 bg-white/55 px-2.5 py-2">
                  <span className="block text-[10px] font-bold uppercase text-ink-soft">
                    Source Record IDs &amp; Generated At
                  </span>
                  <span className="block truncate font-mono text-[10px] text-ink">
                    {(activeProvenance.provenance?.sourceRecordIds || []).join(", ") || "—"}
                  </span>
                  <span className="text-[10px] text-ink-soft">
                    Generated: {formatDateTime(activeProvenance.provenance?.generatedAt)}
                  </span>
                </div>
              </div>

              {activeProvenance.provenance?.disclaimer && (
                <p className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] font-medium text-amber-950">
                  {activeProvenance.provenance.disclaimer}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
