const knowledgeGraphRepository = require("../../../repositories/knowledge-graph.repository");
const graphBuilder = require("./graph-builder.service");

const DEFAULT_GUARDRAIL_NOTICE =
  "Civic Knowledge Graph relationships distinguish confirmed records from inferred links. Co-located assets and cross-category overlaps are surfaced as potential relationships for engineering verification — never confirmed causation.";

function serializeNode(row) {
  if (!row) return null;
  return {
    id: row.id,
    nodeKey: row.node_key,
    entityType: row.entity_type,
    externalId: row.external_id || null,
    label: row.label,
    city: row.city || null,
    ward: row.ward || null,
    properties: row.properties && typeof row.properties === "object" ? row.properties : {},
    provenance: row.provenance && typeof row.provenance === "object" ? row.provenance : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeEdge(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    relationType: row.relation_type,
    weight: Number(row.weight ?? 1.0),
    confidence: Number(row.confidence ?? 1.0),
    isInferred: Boolean(row.is_inferred),
    evidence: row.evidence || null,
    provenance: row.provenance && typeof row.provenance === "object" ? row.provenance : {},
    properties: row.properties && typeof row.properties === "object" ? row.properties : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanIdentifier(value) {
  return String(value || "").trim().replace(/^#/, "");
}

async function ensureGraphPopulated() {
  const count = await knowledgeGraphRepository.countNodes();
  if (count === 0) {
    await graphBuilder.syncKnowledgeGraph();
  }
}

async function collectNeighborhood(startNodeRow, {
  depth = 2,
  maxNodes = 75,
  includeInferred = true,
} = {}) {
  const maxHops = Math.min(Math.max(Number(depth) || 2, 1), 3);
  const capNodes = Math.min(Math.max(Number(maxNodes) || 75, 10), 150);

  const visitedNodes = new Map();
  visitedNodes.set(startNodeRow.id, serializeNode(startNodeRow));

  const collectedEdgeRows = new Map();
  let frontier = [startNodeRow.id];

  for (let hop = 0; hop < maxHops && frontier.length > 0 && visitedNodes.size < capNodes; hop += 1) {
    const connectedEdges = await knowledgeGraphRepository.findConnectedEdges(frontier, {
      includeInferred,
    });

    const nextIdsToFetch = new Set();
    for (const edge of connectedEdges) {
      collectedEdgeRows.set(edge.id, edge);
      if (!visitedNodes.has(edge.source_node_id)) {
        nextIdsToFetch.add(edge.source_node_id);
      }
      if (!visitedNodes.has(edge.target_node_id)) {
        nextIdsToFetch.add(edge.target_node_id);
      }
    }

    const remainingCapacity = Math.max(0, capNodes - visitedNodes.size);
    const candidateIds = Array.from(nextIdsToFetch).slice(0, remainingCapacity);
    if (candidateIds.length === 0) {
      break;
    }

    const fetchedRows = await knowledgeGraphRepository.findNodesByIds(candidateIds);
    const nextFrontier = [];
    for (const r of fetchedRows) {
      visitedNodes.set(r.id, serializeNode(r));
      nextFrontier.push(r.id);
    }
    frontier = nextFrontier;
  }

  // Ensure all edges strictly connecting loaded nodes are included for rich graph rendering
  const loadedIds = Array.from(visitedNodes.keys());
  const betweenEdges = await knowledgeGraphRepository.findEdgesBetweenNodes(loadedIds, {
    includeInferred,
  });
  for (const e of betweenEdges) {
    collectedEdgeRows.set(e.id, e);
  }

  const edges = Array.from(collectedEdgeRows.values())
    .filter((e) => visitedNodes.has(e.source_node_id) && visitedNodes.has(e.target_node_id))
    .map(serializeEdge);

  return {
    centerNode: serializeNode(startNodeRow),
    nodes: Array.from(visitedNodes.values()),
    edges,
  };
}

async function getNodeNeighborhood(identifier, {
  depth = 2,
  maxNodes = 75,
  includeInferred = true,
} = {}) {
  await ensureGraphPopulated();
  const cleanId = cleanIdentifier(identifier);
  let centerRow = await knowledgeGraphRepository.findNodeByIdentifier(cleanId);
  if (!centerRow && !cleanId.includes(":")) {
    centerRow = await knowledgeGraphRepository.findNodeByIdentifier(`complaint:${cleanId}`);
  }
  if (!centerRow) {
    const error = new Error(`Knowledge graph entity "${cleanId}" not found`);
    error.statusCode = 404;
    error.code = "GRAPH_NODE_NOT_FOUND";
    throw error;
  }

  const graph = await collectNeighborhood(centerRow, { depth, maxNodes, includeInferred });
  const neighborCountsByType = {};
  for (const n of graph.nodes) {
    if (n.id === graph.centerNode.id) continue;
    neighborCountsByType[n.entityType] = (neighborCountsByType[n.entityType] || 0) + 1;
  }

  return {
    ...graph,
    depth: Math.min(Math.max(Number(depth) || 2, 1), 3),
    includeInferred: Boolean(includeInferred),
    neighborCountsByType,
    guardrailNotice: DEFAULT_GUARDRAIL_NOTICE,
  };
}

function buildAssetEvidenceChains({
  centerNode,
  nodes,
  edges,
}) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const chains = [];

  const incomingToCenter = edges.filter((e) => e.targetNodeId === centerNode.id);
  const outgoingFromCenter = edges.filter((e) => e.sourceNodeId === centerNode.id);

  const primaryHotspotEdge = outgoingFromCenter.find((e) => e.relationType === "IN_HOTSPOT");
  const primaryHotspot = primaryHotspotEdge ? nodeById.get(primaryHotspotEdge.targetNodeId) : null;
  const primaryDeptEdge = outgoingFromCenter.find((e) => e.relationType === "MAINTAINED_BY");
  const primaryDept = primaryDeptEdge ? nodeById.get(primaryDeptEdge.targetNodeId) : null;

  // 1. Upstream co-located potentially contributing infrastructure -> complaints -> this asset
  const potentialUpstreamEdges = incomingToCenter.filter(
    (e) => e.relationType === "POTENTIALLY_IMPACTS",
  );
  const potentialContributingAssets = [];

  for (const potEdge of potentialUpstreamEdges) {
    const upstreamAsset = nodeById.get(potEdge.sourceNodeId);
    if (!upstreamAsset) continue;

    const upstreamComplaintEdges = edges.filter(
      (e) =>
        e.targetNodeId === upstreamAsset.id &&
        (e.relationType === "AFFECTS" || e.relationType === "CROSS_IMPACTS"),
    );
    const upstreamComplaints = upstreamComplaintEdges
      .map((ce) => nodeById.get(ce.sourceNodeId))
      .filter(Boolean);

    potentialContributingAssets.push({
      assetNodeId: upstreamAsset.id,
      nodeKey: upstreamAsset.nodeKey,
      assetCode: upstreamAsset.properties.assetCode || upstreamAsset.label,
      name: upstreamAsset.properties.name || upstreamAsset.label,
      assetType: upstreamAsset.properties.assetType,
      healthScore: upstreamAsset.properties.healthScore,
      healthGrade: upstreamAsset.properties.healthGrade,
      relationshipLabel: "Potential Relationship (Non-Causal)",
      distanceMeters: potEdge.properties?.distanceMeters ?? null,
      confidence: potEdge.confidence,
      evidence: potEdge.evidence,
      disclaimer:
        potEdge.provenance?.disclaimer ||
        "Potential relationship inferred from proximity; verify before major civil work.",
      upstreamOpenComplaints: upstreamComplaints.filter(
        (c) => !["RESOLVED", "REJECTED"].includes(String(c.properties.status || "").toUpperCase()),
      ).length,
      upstreamComplaints: upstreamComplaints.slice(0, 3).map((c) => ({
        nodeKey: c.nodeKey,
        externalId: c.externalId,
        referenceId: c.properties.referenceId,
        title: c.properties.title,
        status: c.properties.status,
      })),
    });

    const steps = [];
    if (upstreamComplaints[0]) {
      const uc = upstreamComplaints[0];
      steps.push({
        nodeKey: uc.nodeKey,
        entityType: uc.entityType,
        label: uc.label,
        edgeLabelAfter: upstreamComplaintEdges[0].relationType,
        isInferred: upstreamComplaintEdges[0].isInferred,
      });
    }
    steps.push({
      nodeKey: upstreamAsset.nodeKey,
      entityType: upstreamAsset.entityType,
      label: `${upstreamAsset.properties.assetCode || upstreamAsset.label} (${upstreamAsset.properties.healthScore ?? "?"}/100)`,
      edgeLabelAfter: "POTENTIALLY_IMPACTS",
      isInferred: true,
    });
    steps.push({
      nodeKey: centerNode.nodeKey,
      entityType: centerNode.entityType,
      label: `${centerNode.properties.assetCode || centerNode.label} (${centerNode.properties.healthScore ?? "?"}/100)`,
      edgeLabelAfter: primaryHotspot ? "IN_HOTSPOT" : primaryDept ? "MAINTAINED_BY" : null,
      isInferred: false,
    });
    if (primaryHotspot) {
      steps.push({
        nodeKey: primaryHotspot.nodeKey,
        entityType: primaryHotspot.entityType,
        label: primaryHotspot.label,
        edgeLabelAfter: primaryDept ? "LOCATED_IN / OVERLAP" : null,
        isInferred: Boolean(primaryHotspot.properties?.hasCrossCategoryOverlap),
      });
    } else if (primaryDept) {
      steps.push({
        nodeKey: primaryDept.nodeKey,
        entityType: primaryDept.entityType,
        label: primaryDept.label,
        edgeLabelAfter: null,
        isInferred: false,
      });
    }

    chains.push({
      id: `chain-potential-${upstreamAsset.nodeKey}`,
      chainType: "POTENTIAL_CROSS_INFRASTRUCTURE",
      title: `Potential Cross-System Chain via ${upstreamAsset.properties.assetCode || upstreamAsset.label}`,
      isInferred: true,
      confidence: potEdge.confidence,
      summary: potEdge.evidence,
      disclaimer:
        potEdge.provenance?.disclaimer ||
        "Potential relationship inferred from spatial proximity; NOT confirmed causation.",
      provenance: potEdge.provenance,
      steps,
    });
  }

  // 2. Direct & Cross-Impact Citizen Complaint Chains
  const complaintEdges = incomingToCenter.filter(
    (e) => e.relationType === "AFFECTS" || e.relationType === "CROSS_IMPACTS",
  );
  for (const ce of complaintEdges.slice(0, 6)) {
    const complaintNode = nodeById.get(ce.sourceNodeId);
    if (!complaintNode) continue;

    const assignedEdge = edges.find(
      (e) => e.sourceNodeId === complaintNode.id && e.relationType === "ASSIGNED_TO",
    );
    const officerNode = assignedEdge ? nodeById.get(assignedEdge.targetNodeId) : null;

    const steps = [
      {
        nodeKey: complaintNode.nodeKey,
        entityType: complaintNode.entityType,
        label: complaintNode.label,
        edgeLabelAfter: ce.relationType,
        isInferred: ce.isInferred,
      },
      {
        nodeKey: centerNode.nodeKey,
        entityType: centerNode.entityType,
        label: centerNode.properties.assetCode || centerNode.label,
        edgeLabelAfter: officerNode ? "ASSIGNED_TO (via complaint)" : primaryDept ? "MAINTAINED_BY" : null,
        isInferred: false,
      },
    ];
    if (officerNode) {
      steps.push({
        nodeKey: officerNode.nodeKey,
        entityType: officerNode.entityType,
        label: officerNode.label,
        edgeLabelAfter: null,
        isInferred: false,
      });
    } else if (primaryDept) {
      steps.push({
        nodeKey: primaryDept.nodeKey,
        entityType: primaryDept.entityType,
        label: primaryDept.label,
        edgeLabelAfter: null,
        isInferred: false,
      });
    }

    chains.push({
      id: `chain-complaint-${complaintNode.nodeKey}`,
      chainType: ce.relationType === "CROSS_IMPACTS" ? "CROSS_IMPACT_REPORT" : "DIRECT_COMPLAINT",
      title:
        ce.relationType === "CROSS_IMPACTS"
          ? `Cross-Category Incident · ${complaintNode.properties.referenceId || complaintNode.label}`
          : `Reported Issue · ${complaintNode.properties.referenceId || complaintNode.label}`,
      isInferred: ce.isInferred,
      confidence: ce.confidence,
      summary: ce.evidence,
      disclaimer: ce.isInferred
        ? "Cross-category complaint linked by catchment proximity."
        : null,
      provenance: ce.provenance,
      steps,
    });
  }

  // 3. Maintenance History Chains
  const maintEdges = outgoingFromCenter.filter((e) => e.relationType === "HAS_MAINTENANCE");
  for (const me of maintEdges.slice(0, 4)) {
    const maintNode = nodeById.get(me.targetNodeId);
    if (!maintNode) continue;
    chains.push({
      id: `chain-maint-${maintNode.nodeKey}`,
      chainType: "MAINTENANCE_HISTORY",
      title: `Maintenance Record · ${maintNode.properties.eventType || "Work"}`,
      isInferred: false,
      confidence: 1.0,
      summary: `${maintNode.label} — ${maintNode.properties.notes || maintNode.properties.performedBy}`,
      disclaimer: null,
      provenance: me.provenance,
      steps: [
        {
          nodeKey: centerNode.nodeKey,
          entityType: centerNode.entityType,
          label: centerNode.properties.assetCode || centerNode.label,
          edgeLabelAfter: "HAS_MAINTENANCE",
          isInferred: false,
        },
        {
          nodeKey: maintNode.nodeKey,
          entityType: maintNode.entityType,
          label: maintNode.label,
          edgeLabelAfter: null,
          isInferred: false,
        },
      ],
    });
  }

  return {
    chains,
    potentialContributingAssets: potentialContributingAssets.sort(
      (a, b) => b.confidence - a.confidence,
    ),
  };
}

async function investigateAsset(assetIdOrCode, { includeInferred = true } = {}) {
  await ensureGraphPopulated();
  const cleanId = cleanIdentifier(assetIdOrCode);
  let centerRow = await knowledgeGraphRepository.findNodeByIdentifier(cleanId, {
    entityType: "INFRASTRUCTURE_ASSET",
  });
  if (!centerRow && !cleanId.includes(":")) {
    centerRow = await knowledgeGraphRepository.findNodeByIdentifier(`asset:${cleanId}`, {
      entityType: "INFRASTRUCTURE_ASSET",
    });
  }

  if (!centerRow || centerRow.entity_type !== "INFRASTRUCTURE_ASSET") {
    const error = new Error(`Infrastructure asset "${cleanId}" not found in knowledge graph`);
    error.statusCode = 404;
    error.code = "ASSET_NOT_FOUND";
    throw error;
  }

  const graph = await collectNeighborhood(centerRow, {
    depth: 2,
    maxNodes: 85,
    includeInferred,
  });

  const { chains, potentialContributingAssets } = buildAssetEvidenceChains({
    centerNode: graph.centerNode,
    nodes: graph.nodes,
    edges: graph.edges,
  });

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const directComplaints = [];
  const crossImpactComplaints = [];
  const hotspots = [];
  const maintenanceEvents = [];
  const departments = [];
  const wards = [];

  for (const e of graph.edges) {
    if (e.targetNodeId === graph.centerNode.id && e.relationType === "AFFECTS") {
      const n = nodeById.get(e.sourceNodeId);
      if (n) directComplaints.push({ ...n, edgeConfidence: e.confidence, evidence: e.evidence });
    } else if (e.targetNodeId === graph.centerNode.id && e.relationType === "CROSS_IMPACTS") {
      const n = nodeById.get(e.sourceNodeId);
      if (n) crossImpactComplaints.push({ ...n, edgeConfidence: e.confidence, evidence: e.evidence });
    } else if (e.sourceNodeId === graph.centerNode.id && e.relationType === "IN_HOTSPOT") {
      const n = nodeById.get(e.targetNodeId);
      if (n) hotspots.push(n);
    } else if (e.sourceNodeId === graph.centerNode.id && e.relationType === "HAS_MAINTENANCE") {
      const n = nodeById.get(e.targetNodeId);
      if (n) maintenanceEvents.push(n);
    } else if (e.sourceNodeId === graph.centerNode.id && e.relationType === "MAINTAINED_BY") {
      const n = nodeById.get(e.targetNodeId);
      if (n) departments.push(n);
    } else if (e.sourceNodeId === graph.centerNode.id && e.relationType === "LOCATED_IN") {
      const n = nodeById.get(e.targetNodeId);
      if (n) wards.push(n);
    }
  }

  const props = graph.centerNode.properties;
  const observationParts = [
    `${props.assetCode || graph.centerNode.label} has health score ${props.healthScore ?? "—"}/100 (${props.healthGrade || "FAIR"}) with ${directComplaints.length} direct report${directComplaints.length === 1 ? "" : "s"}`,
  ];
  if (crossImpactComplaints.length > 0) {
    observationParts.push(
      `${crossImpactComplaints.length} adjacent cross-category report${crossImpactComplaints.length === 1 ? "" : "s"}`,
    );
  }
  if (potentialContributingAssets.length > 0) {
    const topUpstream = potentialContributingAssets[0];
    observationParts.push(
      `potentially impacted by nearby ${topUpstream.assetCode} (${topUpstream.distanceMeters != null ? `${Math.round(topUpstream.distanceMeters)}m away` : "co-located"})`,
    );
  }
  if (hotspots.length > 0) {
    observationParts.push(`inside spatial cluster "${hotspots[0].label}"`);
  }

  return {
    centerNode: graph.centerNode,
    asset: props,
    nodes: graph.nodes,
    edges: graph.edges,
    evidenceChains: chains,
    potentialContributingAssets,
    directComplaints,
    crossImpactComplaints,
    hotspots,
    maintenanceEvents,
    departments,
    wards,
    investigationSummary: `${observationParts.join("; ")}.`,
    guardrailNotice: DEFAULT_GUARDRAIL_NOTICE,
  };
}

async function investigateComplaint(complaintIdOrRef, { includeInferred = true } = {}) {
  await ensureGraphPopulated();
  const cleanId = cleanIdentifier(complaintIdOrRef);
  let centerRow = await knowledgeGraphRepository.findNodeByIdentifier(cleanId, {
    entityType: "COMPLAINT",
  });
  if (!centerRow && !cleanId.includes(":")) {
    centerRow = await knowledgeGraphRepository.findNodeByIdentifier(`complaint:${cleanId}`, {
      entityType: "COMPLAINT",
    });
  }

  if (!centerRow || centerRow.entity_type !== "COMPLAINT") {
    const error = new Error(`Complaint "${cleanId}" not found in knowledge graph`);
    error.statusCode = 404;
    error.code = "COMPLAINT_NOT_FOUND";
    throw error;
  }

  const graph = await collectNeighborhood(centerRow, {
    depth: 2,
    maxNodes: 80,
    includeInferred,
  });

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const chains = [];
  const potentialContributingAssets = [];

  for (const e of graph.edges) {
    if (
      e.sourceNodeId === graph.centerNode.id &&
      (e.relationType === "AFFECTS" || e.relationType === "CROSS_IMPACTS")
    ) {
      const assetNode = nodeById.get(e.targetNodeId);
      if (!assetNode) continue;

      chains.push({
        id: `chain-c-${assetNode.nodeKey}`,
        chainType: e.relationType === "CROSS_IMPACTS" ? "CROSS_IMPACT_REPORT" : "DIRECT_COMPLAINT",
        title: `${e.relationType === "CROSS_IMPACTS" ? "Cross-Impact on" : "Impacts"} ${assetNode.properties.assetCode || assetNode.label}`,
        isInferred: e.isInferred,
        confidence: e.confidence,
        summary: e.evidence,
        disclaimer: e.isInferred ? DEFAULT_GUARDRAIL_NOTICE : null,
        provenance: e.provenance,
        steps: [
          {
            nodeKey: graph.centerNode.nodeKey,
            entityType: graph.centerNode.entityType,
            label: graph.centerNode.label,
            edgeLabelAfter: e.relationType,
            isInferred: e.isInferred,
          },
          {
            nodeKey: assetNode.nodeKey,
            entityType: assetNode.entityType,
            label: `${assetNode.properties.assetCode || assetNode.label} (${assetNode.properties.healthScore ?? "?"}/100)`,
            edgeLabelAfter: null,
            isInferred: false,
          },
        ],
      });

      // Check potential upstream assets affecting that affected asset
      const upstreamEdges = graph.edges.filter(
        (pe) => pe.targetNodeId === assetNode.id && pe.relationType === "POTENTIALLY_IMPACTS",
      );
      for (const pe of upstreamEdges) {
        const up = nodeById.get(pe.sourceNodeId);
        if (!up) continue;
        potentialContributingAssets.push({
          assetNodeId: up.id,
          nodeKey: up.nodeKey,
          assetCode: up.properties.assetCode || up.label,
          name: up.properties.name || up.label,
          assetType: up.properties.assetType,
          healthScore: up.properties.healthScore,
          healthGrade: up.properties.healthGrade,
          relationshipLabel: "Potential Relationship (Non-Causal)",
          distanceMeters: pe.properties?.distanceMeters ?? null,
          confidence: pe.confidence,
          evidence: pe.evidence,
          disclaimer:
            pe.provenance?.disclaimer ||
            "Potential co-located contributor; inspect upstream asset before repair.",
          upstreamOpenComplaints: up.properties.openComplaintCount || 0,
          upstreamComplaints: [],
        });
      }
    } else if (
      (e.sourceNodeId === graph.centerNode.id || e.targetNodeId === graph.centerNode.id) &&
      e.relationType === "SIMILAR_TO"
    ) {
      const otherId =
        e.sourceNodeId === graph.centerNode.id ? e.targetNodeId : e.sourceNodeId;
      const other = nodeById.get(otherId);
      if (!other) continue;
      chains.push({
        id: `chain-sim-${other.nodeKey}`,
        chainType: "SEMANTIC_SIMILARITY",
        title: `Similar Report · ${other.properties.referenceId || other.label}`,
        isInferred: true,
        confidence: e.confidence,
        summary: e.evidence,
        disclaimer: "Semantic text similarity match; officers verify duplicate linkage.",
        provenance: e.provenance,
        steps: [
          {
            nodeKey: graph.centerNode.nodeKey,
            entityType: graph.centerNode.entityType,
            label: graph.centerNode.label,
            edgeLabelAfter: "SIMILAR_TO",
            isInferred: true,
          },
          {
            nodeKey: other.nodeKey,
            entityType: other.entityType,
            label: other.label,
            edgeLabelAfter: null,
            isInferred: false,
          },
        ],
      });
    }
  }

  return {
    centerNode: graph.centerNode,
    nodes: graph.nodes,
    edges: graph.edges,
    evidenceChains: chains,
    potentialContributingAssets,
    investigationSummary: `Complaint ${graph.centerNode.properties.referenceId || graph.centerNode.label} connects to ${graph.nodes.length - 1} civic entities across ${graph.edges.length} relationships.`,
    guardrailNotice: DEFAULT_GUARDRAIL_NOTICE,
  };
}

async function findShortestPath(
  fromIdentifier,
  toIdentifier,
  { maxDepth = 5, includeInferred = true } = {},
) {
  await ensureGraphPopulated();
  const cleanFrom = cleanIdentifier(fromIdentifier);
  const cleanTo = cleanIdentifier(toIdentifier);

  let fromRow = await knowledgeGraphRepository.findNodeByIdentifier(cleanFrom);
  if (!fromRow && !cleanFrom.includes(":")) {
    fromRow =
      (await knowledgeGraphRepository.findNodeByIdentifier(`asset:${cleanFrom}`)) ||
      (await knowledgeGraphRepository.findNodeByIdentifier(`complaint:${cleanFrom}`));
  }

  let toRow = await knowledgeGraphRepository.findNodeByIdentifier(cleanTo);
  if (!toRow && !cleanTo.includes(":")) {
    toRow =
      (await knowledgeGraphRepository.findNodeByIdentifier(`asset:${cleanTo}`)) ||
      (await knowledgeGraphRepository.findNodeByIdentifier(`complaint:${cleanTo}`));
  }

  if (!fromRow || !toRow) {
    const error = new Error(
      `Unable to resolve path endpoints (${!fromRow ? cleanFrom : cleanTo} not found)`,
    );
    error.statusCode = 404;
    error.code = "GRAPH_NODE_NOT_FOUND";
    throw error;
  }

  if (fromRow.id === toRow.id) {
    const node = serializeNode(fromRow);
    return {
      found: true,
      hopCount: 0,
      containsInferredEdge: false,
      pathNodes: [node],
      pathEdges: [],
      narrativeSteps: [node.label],
      guardrailNotice: DEFAULT_GUARDRAIL_NOTICE,
    };
  }

  const { nodes: rawNodes, edges: rawEdges } =
    await knowledgeGraphRepository.loadAllNodesAndEdges({ includeInferred });

  const nodeMap = new Map(rawNodes.map((r) => [r.id, serializeNode(r)]));
  const edgeList = rawEdges.map(serializeEdge);

  const adjacency = new Map();
  for (const edge of edgeList) {
    if (!adjacency.has(edge.sourceNodeId)) adjacency.set(edge.sourceNodeId, []);
    if (!adjacency.has(edge.targetNodeId)) adjacency.set(edge.targetNodeId, []);
    adjacency.get(edge.sourceNodeId).push({
      nextId: edge.targetNodeId,
      edge,
      direction: "OUTGOING",
    });
    adjacency.get(edge.targetNodeId).push({
      nextId: edge.sourceNodeId,
      edge,
      direction: "INCOMING",
    });
  }

  const depthLimit = Math.min(Math.max(Number(maxDepth) || 5, 1), 6);
  const queue = [{ nodeId: fromRow.id, depth: 0 }];
  const visited = new Set([fromRow.id]);
  const parent = new Map();

  let foundTarget = false;
  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift();
    if (depth >= depthLimit) continue;

    const neighbors = adjacency.get(nodeId) || [];
    // Prefer factual shortest paths slightly ahead of inferred edges when tie-breaking at equal hop depth
    const orderedNeighbors = [...neighbors].sort(
      (a, b) => Number(a.edge.isInferred) - Number(b.edge.isInferred),
    );

    for (const item of orderedNeighbors) {
      if (visited.has(item.nextId)) continue;
      visited.add(item.nextId);
      parent.set(item.nextId, {
        prevId: nodeId,
        edge: item.edge,
        direction: item.direction,
      });
      if (item.nextId === toRow.id) {
        foundTarget = true;
        break;
      }
      queue.push({ nodeId: item.nextId, depth: depth + 1 });
    }
    if (foundTarget) break;
  }

  if (!foundTarget) {
    return {
      found: false,
      hopCount: null,
      containsInferredEdge: false,
      pathNodes: [serializeNode(fromRow), serializeNode(toRow)],
      pathEdges: [],
      narrativeSteps: [],
      guardrailNotice: DEFAULT_GUARDRAIL_NOTICE,
    };
  }

  const pathNodes = [];
  const pathEdges = [];
  let cursor = toRow.id;
  while (cursor) {
    pathNodes.unshift(nodeMap.get(cursor));
    const p = parent.get(cursor);
    if (!p) break;
    pathEdges.unshift({ ...p.edge, traversalDirection: p.direction });
    cursor = p.prevId;
  }

  const containsInferredEdge = pathEdges.some((e) => e.isInferred);
  const narrativeSteps = pathEdges.map((edge, idx) => {
    const a = pathNodes[idx];
    const b = pathNodes[idx + 1];
    return `${a.label} —[${edge.relationType}${edge.isInferred ? " · Potential" : ""}]→ ${b.label}`;
  });

  return {
    found: true,
    hopCount: pathEdges.length,
    containsInferredEdge,
    pathNodes,
    pathEdges,
    narrativeSteps,
    guardrailNotice: DEFAULT_GUARDRAIL_NOTICE,
  };
}

async function getGraphMetrics({ city = null } = {}) {
  await ensureGraphPopulated();
  const { nodes: rawNodes, edges: rawEdges } =
    await knowledgeGraphRepository.loadAllNodesAndEdges({ city, includeInferred: true });

  const nodes = rawNodes.map(serializeNode);
  const edges = rawEdges.map(serializeEdge);

  const nodesByType = {};
  let nodesWithProvenance = 0;
  let lastSyncedAt = null;

  for (const n of nodes) {
    nodesByType[n.entityType] = (nodesByType[n.entityType] || 0) + 1;
    if (n.provenance?.sourceTable && Array.isArray(n.provenance?.sourceRecordIds)) {
      nodesWithProvenance += 1;
    }
    const ts = n.provenance?.generatedAt || n.updatedAt;
    if (ts && (!lastSyncedAt || new Date(ts) > new Date(lastSyncedAt))) {
      lastSyncedAt = ts;
    }
  }

  const edgesByRelation = {};
  let factualEdgesCount = 0;
  let inferredEdgesCount = 0;
  let edgesWithProvenance = 0;

  const connectedNodeIds = new Set();
  for (const e of edges) {
    edgesByRelation[e.relationType] = (edgesByRelation[e.relationType] || 0) + 1;
    if (e.isInferred) inferredEdgesCount += 1;
    else factualEdgesCount += 1;
    if (e.provenance?.sourceTable && e.confidence != null) {
      edgesWithProvenance += 1;
    }
    connectedNodeIds.add(e.sourceNodeId);
    connectedNodeIds.add(e.targetNodeId);
  }

  const complaintNodes = nodes.filter((n) => n.entityType === "COMPLAINT");
  const assetNodes = nodes.filter((n) => n.entityType === "INFRASTRUCTURE_ASSET");
  const connectedComplaints = complaintNodes.filter((n) => connectedNodeIds.has(n.id)).length;
  const connectedAssets = assetNodes.filter((n) => connectedNodeIds.has(n.id)).length;

  const totalEntitiesAndEdges = nodes.length + edges.length;
  const provenanceCompletenessPercent =
    totalEntitiesAndEdges > 0
      ? Math.round(((nodesWithProvenance + edgesWithProvenance) / totalEntitiesAndEdges) * 100)
      : 100;

  return {
    city: city && city !== "all" ? city : null,
    totalNodes: nodes.length,
    totalEdges: edges.length,
    nodesByType,
    edgesByRelation,
    factualEdgesCount,
    inferredEdgesCount,
    crossInfrastructurePotentialLinks: edgesByRelation.POTENTIALLY_IMPACTS || 0,
    provenanceCompletenessPercent,
    relationshipCoverage: {
      complaintCount: complaintNodes.length,
      connectedComplaints,
      complaintConnectivityPercent:
        complaintNodes.length > 0
          ? Math.round((connectedComplaints / complaintNodes.length) * 100)
          : 100,
      assetCount: assetNodes.length,
      connectedAssets,
      assetConnectivityPercent:
        assetNodes.length > 0
          ? Math.round((connectedAssets / assetNodes.length) * 100)
          : 100,
    },
    lastSyncedAt,
  };
}

async function getGraphOverview({
  city = null,
  entityType = null,
  q = null,
  limit = 120,
} = {}) {
  await ensureGraphPopulated();
  const [nodeRows, metrics] = await Promise.all([
    knowledgeGraphRepository.listNodes({ city, entityType, q, limit }),
    getGraphMetrics({ city }),
  ]);

  const nodes = nodeRows.map(serializeNode);
  const nodeIds = nodes.map((n) => n.id);
  const edgeRows =
    nodeIds.length > 0
      ? await knowledgeGraphRepository.findEdgesBetweenNodes(nodeIds, { includeInferred: true })
      : [];
  const edges = edgeRows.map(serializeEdge);

  let scopedNodes = nodes;
  if (city && city !== "all" && (!entityType || entityType === "all")) {
    const connectedIds = new Set();
    for (const e of edges) {
      connectedIds.add(e.sourceNodeId);
      connectedIds.add(e.targetNodeId);
    }
    const cityLower = city.toLowerCase();
    scopedNodes = nodes.filter(
      (n) =>
        (n.city && n.city.toLowerCase() === cityLower) ||
        connectedIds.has(n.id),
    );
  }

  const assetNodes = scopedNodes
    .filter((n) => n.entityType === "INFRASTRUCTURE_ASSET")
    .sort((a, b) => Number(a.properties.healthScore ?? 100) - Number(b.properties.healthScore ?? 100));

  const flagshipTargets = assetNodes.slice(0, 4).map((a) => ({
    nodeKey: a.nodeKey,
    assetCode: a.properties.assetCode || a.label,
    label: a.properties.name || a.label,
    city: a.city,
    ward: a.ward,
    healthScore: a.properties.healthScore ?? null,
    healthGrade: a.properties.healthGrade ?? null,
  }));

  return {
    filters: {
      city: city && city !== "all" ? city : null,
      entityType: entityType && entityType !== "all" ? entityType : null,
      q: q || null,
    },
    metrics,
    flagshipTargets,
    nodes: scopedNodes,
    edges,
    guardrailNotice: DEFAULT_GUARDRAIL_NOTICE,
  };
}

module.exports = {
  DEFAULT_GUARDRAIL_NOTICE,
  serializeNode,
  serializeEdge,
  getGraphOverview,
  getNodeNeighborhood,
  investigateAsset,
  investigateComplaint,
  findShortestPath,
  getGraphMetrics,
};
