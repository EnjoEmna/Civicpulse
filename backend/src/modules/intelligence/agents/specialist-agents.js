const {
  AI_MODELS,
  Type,
  hasGeminiApiKey,
  generateStructuredJson,
} = require("../../../config/ai");
const { executeAgentTool } = require("./agent-tools");
const {
  NON_CAUSAL_LABEL,
  registerSafeNumbers,
  enforceNonCausalFraming,
  validateTextAgainstGroundTruth,
  auditRecommendations,
} = require("./grounding.validator");

const KNOWN_CITIES = [
  "Hyderabad",
  "Thiruvananthapuram",
  "Trivandrum",
  "Bengaluru",
  "Bangalore",
  "Chennai",
  "Mumbai",
  "Pune",
  "Delhi",
  "Kochi",
];

const ASSET_CODE_RE = /\b(?:RD|WP|DR|SL|SN)-[A-Z]{2,5}-\d+\b/i;
const COMPLAINT_REF_RE = /\bCP-\d{4}-\d{3,}\b/i;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

function normalizeDetectedCity(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "trivandrum") return "Thiruvananthapuram";
  if (lower === "bangalore") return "Bengaluru";
  return raw;
}

function parseQueryHints({ question, targetType, targetId, assetCode, complaintId, city, ward }) {
  const q = String(question || "").trim();
  let detectedAssetCode = assetCode ? assetCode.toUpperCase() : null;
  let detectedComplaintId = complaintId || null;
  let detectedCity = city || null;
  let detectedWard = ward || null;
  let resolvedTargetType = targetType || null;
  let resolvedTargetId = targetId || null;

  if (!detectedAssetCode && resolvedTargetType === "ASSET" && resolvedTargetId) {
    detectedAssetCode = resolvedTargetId;
  }
  if (!detectedComplaintId && resolvedTargetType === "COMPLAINT" && resolvedTargetId) {
    detectedComplaintId = resolvedTargetId;
  }

  if (!detectedAssetCode) {
    const m = q.match(ASSET_CODE_RE);
    if (m) detectedAssetCode = m[0].toUpperCase();
  }
  if (!detectedComplaintId) {
    const m = q.match(COMPLAINT_REF_RE);
    if (m) detectedComplaintId = m[0].toUpperCase();
  }
  if (!detectedComplaintId && !detectedAssetCode && !resolvedTargetId) {
    const uuidMatch = q.match(UUID_RE);
    if (uuidMatch) {
      resolvedTargetId = uuidMatch[0];
    }
  }

  if (!detectedCity) {
    for (const c of KNOWN_CITIES) {
      if (new RegExp(`\\b${c}\\b`, "i").test(q)) {
        detectedCity = normalizeDetectedCity(c);
        break;
      }
    }
  }

  if (!resolvedTargetType) {
    if (detectedAssetCode) resolvedTargetType = "ASSET";
    else if (detectedComplaintId) resolvedTargetType = "COMPLAINT";
    else if (detectedWard) resolvedTargetType = "WARD";
    else if (detectedCity) resolvedTargetType = "CITY";
    else resolvedTargetType = "GENERAL";
  }

  if (!resolvedTargetId) {
    resolvedTargetId = detectedAssetCode || detectedComplaintId || detectedWard || detectedCity || null;
  }

  return {
    question: q,
    targetType: resolvedTargetType,
    targetId: resolvedTargetId,
    assetCode: detectedAssetCode,
    complaintId: detectedComplaintId,
    city: detectedCity,
    ward: detectedWard,
  };
}

function computeAssetPriorityScore(asset) {
  const healthDeficit = Math.max(0, 100 - Number(asset.healthScore ?? 100));
  const openCount = Number(asset.openComplaintCount || 0);
  const recurrenceCount = Number(asset.recurrenceCount || 0);
  const maintMonths = Number(asset.maintenanceAgeMonths || 0);
  const inHotspot = Boolean(asset.scoreBreakdown?.factors?.inActiveHotspot);
  const crossCount = Number(asset.scoreBreakdown?.factors?.crossImpactCount || 0);
  const trendBonus = asset.trend === "DETERIORATING" ? 12 : 0;

  return Math.round(
    healthDeficit * 0.45 +
      openCount * 9 +
      recurrenceCount * 5 +
      (inHotspot ? 14 : 0) +
      crossCount * 8 +
      (maintMonths >= 6 ? 10 : 0) +
      trendBonus,
  );
}

async function runPriorityAgent({ input, trace }) {
  const startedAt = Date.now();
  const hints = parseQueryHints(input);

  const [infraOverview, hotspotList, complaintsRes] = await Promise.all([
    executeAgentTool({
      toolName: "get_infrastructure_overview",
      agentName: "PriorityAgent",
      args: { city: hints.city || null, limit: 25 },
      trace,
    }).catch(() => ({ assets: [], wards: [], summary: {} })),
    executeAgentTool({
      toolName: "list_hotspots",
      agentName: "PriorityAgent",
      args: { city: hints.city || null, ward: hints.ward || null },
      trace,
    }).catch(() => ({ hotspots: [], activeCount: 0 })),
    executeAgentTool({
      toolName: "fetch_complaints",
      agentName: "PriorityAgent",
      args: {
        city: hints.city || null,
        query:
          !hints.assetCode && !hints.complaintId && hints.question.length <= 60
            ? null
            : null,
        limit: 30,
      },
      trace,
    }).catch(() => ({ complaints: [], total: 0 })),
  ]);

  let focalComplaint = null;
  if (hints.complaintId) {
    const cDetail = await executeAgentTool({
      toolName: "fetch_complaint_detail",
      agentName: "PriorityAgent",
      args: { complaintIdOrRef: hints.complaintId },
      trace,
    }).catch(() => ({ found: false }));
    if (cDetail?.found) {
      focalComplaint = cDetail.complaint;
      if (!hints.city && focalComplaint.city) hints.city = focalComplaint.city;
      if (!hints.ward && focalComplaint.ward) hints.ward = focalComplaint.ward;
    }
  }

  let assets = Array.isArray(infraOverview?.assets) ? infraOverview.assets : [];
  if (hints.ward && assets.length > 0) {
    const wardFiltered = assets.filter((a) =>
      String(a.ward || "").toLowerCase().includes(hints.ward.toLowerCase()),
    );
    if (wardFiltered.length > 0) assets = wardFiltered;
  }

  const rankedAssets = assets
    .map((a) => ({
      id: a.id,
      assetCode: a.assetCode,
      name: a.name,
      assetType: a.assetType,
      city: a.city,
      ward: a.ward,
      healthScore: a.healthScore,
      healthGrade: a.healthGrade,
      trend: a.trend,
      openComplaintCount: a.openComplaintCount,
      maintenanceAgeMonths: a.maintenanceAgeMonths,
      priorityScore: computeAssetPriorityScore(a),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore || a.healthScore - b.healthScore);

  let focalAsset = null;
  if (hints.assetCode) {
    focalAsset =
      rankedAssets.find(
        (a) =>
          String(a.assetCode || "").toLowerCase() === hints.assetCode.toLowerCase() ||
          a.id === hints.assetCode,
      ) || null;

    if (!focalAsset) {
      const directDetail = await executeAgentTool({
        toolName: "get_asset_details",
        agentName: "PriorityAgent",
        args: { assetIdOrCode: hints.assetCode },
        trace,
      }).catch(() => ({ found: false }));
      if (directDetail?.found && directDetail.asset) {
        focalAsset = {
          ...directDetail.asset,
          priorityScore: computeAssetPriorityScore(directDetail.asset),
        };
      }
    }
  }

  if (!focalAsset && !focalComplaint && rankedAssets.length > 0) {
    focalAsset = rankedAssets[0];
  }

  if (focalAsset) {
    hints.assetCode = focalAsset.assetCode;
    if (!hints.city && focalAsset.city) hints.city = focalAsset.city;
    if (!hints.ward && focalAsset.ward) hints.ward = focalAsset.ward;
    if (hints.targetType === "GENERAL" || hints.targetType === "CITY" || hints.targetType === "WARD") {
      hints.resolvedFocusAssetCode = focalAsset.assetCode;
    }
  }

  const openComplaints = (complaintsRes?.complaints || []).filter(
    (c) => !["RESOLVED", "REJECTED"].includes(String(c.status || "").toUpperCase()),
  );
  const criticalOrHighOpen = openComplaints.filter((c) =>
    ["CRITICAL", "HIGH"].includes(String(c.priority || "").toUpperCase()),
  );

  registerSafeNumbers(trace, [
    rankedAssets.length,
    openComplaints.length,
    criticalOrHighOpen.length,
    focalAsset?.priorityScore,
  ]);

  const rankedWards = (infraOverview?.wards || [])
    .slice(0, 5)
    .map((w) => ({
      city: w.city,
      ward: w.ward,
      healthScore: w.healthScore,
      healthGrade: w.healthGrade,
      openComplaints: w.openComplaints,
      worstAssetCode: w.worstAsset?.assetCode || null,
    }));

  const selectedMode = focalComplaint
    ? "COMPLAINT"
    : focalAsset
      ? "ASSET"
      : "CITY";

  return {
    agentName: "PriorityAgent",
    role: "Deterministic Severity & Risk Ranker",
    status: "COMPLETED",
    modelName: "deterministic-priority-ranker",
    modelVersion: "1.0.0",
    durationMs: Date.now() - startedAt,
    inputs: { question: hints.question, city: hints.city, ward: hints.ward },
    outputs: {
      resolvedScope: {
        ...hints,
        selectedMode,
        focalAssetCode: focalAsset?.assetCode || null,
        focalAssetId: focalAsset?.id || null,
        focalComplaintRef: focalComplaint?.referenceId || null,
        focalComplaintId: focalComplaint?.id || null,
      },
      topRankedAssets: rankedAssets.slice(0, 5),
      topRankedWards: rankedWards,
      activeHotspotCount: hotspotList?.activeCount ?? (hotspotList?.hotspots || []).filter((h) => h.status === "ACTIVE").length,
      openComplaintsCount: openComplaints.length,
      criticalOrHighOpenCount: criticalOrHighOpen.length,
      priorityRationale: focalAsset
        ? `Prioritized ${focalAsset.assetCode} (${focalAsset.city}, ${focalAsset.ward}) with deterministic priority score ${focalAsset.priorityScore}, health ${focalAsset.healthScore}/100 (${focalAsset.healthGrade}), and ${focalAsset.openComplaintCount} open linked complaints.`
        : focalComplaint
          ? `Prioritized complaint ${focalComplaint.referenceId || focalComplaint.id} (${focalComplaint.priority} severity, status ${focalComplaint.status}) in ${focalComplaint.city || "jurisdiction"}.`
          : `Assessed jurisdiction backlog across ${openComplaints.length} open complaints.`,
    },
  };
}

async function runInvestigationAgent({ priorityOutput, includeInferred = true, trace }) {
  const startedAt = Date.now();
  const scope = priorityOutput?.outputs?.resolvedScope || {};

  let assetGraph = null;
  let complaintGraph = null;
  let pathTrace = null;

  if (scope.focalComplaintId || scope.focalComplaintRef) {
    complaintGraph = await executeAgentTool({
      toolName: "investigate_complaint_graph",
      agentName: "InvestigationAgent",
      args: {
        complaintIdOrRef: scope.focalComplaintRef || scope.focalComplaintId,
        includeInferred,
      },
      trace,
    }).catch(() => null);

    // Also pull linked asset graph if the complaint impacts an asset
    const linkedAssetsRes = await executeAgentTool({
      toolName: "get_assets_for_complaint",
      agentName: "InvestigationAgent",
      args: { complaintId: scope.focalComplaintId || scope.focalComplaintRef },
      trace,
    }).catch(() => ({ assets: [] }));

    const primaryAsset = linkedAssetsRes?.assets?.[0];
    if (primaryAsset?.assetCode) {
      assetGraph = await executeAgentTool({
        toolName: "investigate_asset_graph",
        agentName: "InvestigationAgent",
        args: { assetIdOrCode: primaryAsset.assetCode, includeInferred },
        trace,
      }).catch(() => null);
    }
  } else if (scope.focalAssetCode || scope.focalAssetId) {
    assetGraph = await executeAgentTool({
      toolName: "investigate_asset_graph",
      agentName: "InvestigationAgent",
      args: {
        assetIdOrCode: scope.focalAssetCode || scope.focalAssetId,
        includeInferred,
      },
      trace,
    }).catch(() => null);
  }

  const activeGraph = assetGraph || complaintGraph;
  const potentialContributingAssets = activeGraph?.potentialContributingAssets || [];
  const evidenceChains = activeGraph?.evidenceChains || [];

  // If an upstream potential contributing asset exists, compute explicit graph path
  if (
    activeGraph?.centerNode?.nodeKey &&
    potentialContributingAssets[0]?.nodeKey
  ) {
    pathTrace = await executeAgentTool({
      toolName: "find_graph_path",
      agentName: "InvestigationAgent",
      args: {
        from: potentialContributingAssets[0].nodeKey,
        to: activeGraph.centerNode.nodeKey,
        maxDepth: 4,
        includeInferred,
      },
      trace,
    }).catch(() => null);
  }

  const hasInferredRelationships =
    potentialContributingAssets.length > 0 ||
    evidenceChains.some((c) => Boolean(c.isInferred));

  const upstreamSummaries = potentialContributingAssets.map((up) => ({
    assetCode: up.assetCode,
    name: up.name,
    assetType: up.assetType,
    healthScore: up.healthScore,
    healthGrade: up.healthGrade,
    distanceMeters: up.distanceMeters != null ? Math.round(up.distanceMeters) : null,
    confidence: up.confidence,
    relationshipLabel: NON_CAUSAL_LABEL,
    upstreamOpenComplaints: up.upstreamOpenComplaints || 0,
    disclaimer: up.disclaimer,
    evidence: up.evidence,
  }));

  registerSafeNumbers(trace, [
    evidenceChains.length,
    upstreamSummaries.length,
    ...(activeGraph?.nodes ? [activeGraph.nodes.length] : []),
    ...(activeGraph?.edges ? [activeGraph.edges.length] : []),
  ]);

  return {
    agentName: "InvestigationAgent",
    role: "Knowledge Graph Multi-Hop Investigator",
    status: "COMPLETED",
    modelName: "civicpulse-kg-investigator",
    modelVersion: "1.0.0",
    durationMs: Date.now() - startedAt,
    inputs: {
      focalAssetCode: scope.focalAssetCode || null,
      focalComplaintRef: scope.focalComplaintRef || null,
      includeInferred,
    },
    outputs: {
      centerNodeKey: activeGraph?.centerNode?.nodeKey || null,
      centerEntityLabel: activeGraph?.centerNode?.label || null,
      graphNodesCount: activeGraph?.nodes?.length || 0,
      graphEdgesCount: activeGraph?.edges?.length || 0,
      hasInferredRelationships,
      nonCausalGuardrail: NON_CAUSAL_LABEL,
      potentialContributingAssets: upstreamSummaries,
      evidenceChains: evidenceChains.slice(0, 6).map((c) => ({
        id: c.id,
        chainType: c.chainType,
        title: c.title,
        isInferred: Boolean(c.isInferred),
        relationshipLabel: c.isInferred ? NON_CAUSAL_LABEL : "Observed Record",
        confidence: c.confidence,
        summary: c.summary,
        disclaimer: c.disclaimer || null,
        steps: (c.steps || []).map((s) => ({
          nodeKey: s.nodeKey,
          entityType: s.entityType,
          label: s.label,
          edgeLabelAfter: s.edgeLabelAfter,
          isInferred: Boolean(s.isInferred),
        })),
      })),
      shortestPathExample: pathTrace?.found
        ? {
            hopCount: pathTrace.hopCount,
            containsInferredEdge: pathTrace.containsInferredEdge,
            narrativeSteps: pathTrace.narrativeSteps,
          }
        : null,
      investigationSummary:
        activeGraph?.investigationSummary ||
        "No matching knowledge graph entity found for the requested scope.",
    },
  };
}

async function runInfrastructureAgent({ priorityOutput, investigationOutput, trace }) {
  const startedAt = Date.now();
  const scope = priorityOutput?.outputs?.resolvedScope || {};
  const targetCode =
    scope.focalAssetCode ||
    investigationOutput?.outputs?.centerNodeKey?.replace(/^asset:/, "") ||
    null;

  let primaryAssetDetails = null;
  if (targetCode) {
    const res = await executeAgentTool({
      toolName: "get_asset_details",
      agentName: "InfrastructureAgent",
      args: { assetIdOrCode: targetCode },
      trace,
    }).catch(() => ({ found: false }));
    if (res?.found) primaryAssetDetails = res;
  }

  // Inspect top upstream asset condition as well if present
  const upstreamCodes = (investigationOutput?.outputs?.potentialContributingAssets || [])
    .map((u) => u.assetCode)
    .filter(Boolean)
    .slice(0, 2);

  const upstreamAssets = [];
  for (const upCode of upstreamCodes) {
    const upRes = await executeAgentTool({
      toolName: "get_asset_details",
      agentName: "InfrastructureAgent",
      args: { assetIdOrCode: upCode },
      trace,
    }).catch(() => ({ found: false }));
    if (upRes?.found && upRes.asset) {
      upstreamAssets.push({
        id: upRes.asset.id,
        assetCode: upRes.asset.assetCode,
        name: upRes.asset.name,
        assetType: upRes.asset.assetType,
        healthScore: upRes.asset.healthScore,
        healthGrade: upRes.asset.healthGrade,
        trend: upRes.asset.trend,
        openComplaintCount: upRes.asset.openComplaintCount,
        maintenanceAgeMonths: upRes.asset.maintenanceAgeMonths,
        scoreBreakdown: upRes.asset.scoreBreakdown,
        latestMaintenance: upRes.maintenanceEvents?.[0] || null,
      });
    }
  }

  const cityOverview = await executeAgentTool({
    toolName: "get_infrastructure_overview",
    agentName: "InfrastructureAgent",
    args: { city: scope.city || null, limit: 25 },
    trace,
  }).catch(() => ({ summary: {}, assets: [] }));

  const a = primaryAssetDetails?.asset || null;
  const breakdown = a?.scoreBreakdown || {};

  registerSafeNumbers(trace, [
    a?.healthScore,
    a?.maintenanceAgeMonths,
    a?.openComplaintCount,
    breakdown?.complaintImpactPenalty,
    breakdown?.recurrencePenalty,
    breakdown?.severityPenalty,
    breakdown?.unresolvedDurationPenalty,
    breakdown?.maintenanceAgePenalty,
  ]);

  return {
    agentName: "InfrastructureAgent",
    role: "Asset Health & Maintenance Analyst",
    status: "COMPLETED",
    modelName: "deterministic-health-model",
    modelVersion: "1.0.0",
    durationMs: Date.now() - startedAt,
    inputs: { targetAssetCode: targetCode, city: scope.city || null },
    outputs: {
      primaryAsset: a
        ? {
            id: a.id,
            assetCode: a.assetCode,
            name: a.name,
            assetType: a.assetType,
            city: a.city,
            ward: a.ward,
            department: a.department,
            latitude: a.latitude,
            longitude: a.longitude,
            healthScore: a.healthScore,
            healthGrade: a.healthGrade,
            trend: a.trend,
            complaintCount: a.complaintCount,
            openComplaintCount: a.openComplaintCount,
            recurrenceCount: a.recurrenceCount,
            maintenanceAgeMonths: a.maintenanceAgeMonths,
            scoreBreakdown: breakdown,
            linkedComplaintsCount: primaryAssetDetails.linkedComplaints?.length || 0,
            directLinkedCount: (primaryAssetDetails.linkedComplaints || []).filter(
              (c) => c.linkType === "DIRECT",
            ).length,
            crossImpactLinkedCount: (primaryAssetDetails.linkedComplaints || []).filter(
              (c) => c.linkType === "CROSS_IMPACT",
            ).length,
            maintenanceEvents: (primaryAssetDetails.maintenanceEvents || []).slice(0, 3),
            healthTrajectory: (primaryAssetDetails.healthHistory || []).slice(0, 5),
          }
        : null,
      upstreamContributingDetails: upstreamAssets,
      jurisdictionSummary: cityOverview?.summary || {},
    },
  };
}

async function runSpatialAgent({ priorityOutput, infrastructureOutput, trace }) {
  const startedAt = Date.now();
  const scope = priorityOutput?.outputs?.resolvedScope || {};
  const asset = infrastructureOutput?.outputs?.primaryAsset || null;

  const [hotspotsRes, wardAnalyticsRes] = await Promise.all([
    executeAgentTool({
      toolName: "list_hotspots",
      agentName: "SpatialAgent",
      args: { city: scope.city || asset?.city || null },
      trace,
    }).catch(() => ({ hotspots: [], activeCount: 0, crossCategoryOverlapCount: 0 })),
    executeAgentTool({
      toolName: "get_ward_analytics",
      agentName: "SpatialAgent",
      args: { city: scope.city || asset?.city || null },
      trace,
    }).catch(() => ({ wards: [] })),
  ]);

  let nearbyZone = null;
  if (asset?.latitude != null && asset?.longitude != null) {
    nearbyZone = await executeAgentTool({
      toolName: "analyze_nearby_complaints",
      agentName: "SpatialAgent",
      args: {
        latitude: asset.latitude,
        longitude: asset.longitude,
        radiusMeters: Math.max(350, Number(asset.catchmentRadiusMeters || 350)),
        city: asset.city || scope.city || null,
      },
      trace,
    }).catch(() => null);
  }

  const allHotspots = hotspotsRes?.hotspots || [];
  const relevantHotspots = allHotspots.filter((h) => {
    if (asset?.ward && h.ward && h.ward.toLowerCase() === asset.ward.toLowerCase()) {
      return true;
    }
    if (scope.ward && h.ward && h.ward.toLowerCase().includes(scope.ward.toLowerCase())) {
      return true;
    }
    return false;
  });

  const matchingHotspots =
    relevantHotspots.length > 0 ? relevantHotspots : allHotspots.slice(0, 3);

  const focalWard = (wardAnalyticsRes?.wards || []).find((w) =>
    (asset?.ward || scope.ward || "")
      ? String(w.ward || "")
          .toLowerCase()
          .includes(String(asset?.ward || scope.ward).toLowerCase())
      : true,
  );

  registerSafeNumbers(trace, [
    allHotspots.length,
    hotspotsRes?.crossCategoryOverlapCount || 0,
    nearbyZone?.returnedCount,
    nearbyZone?.openCount,
    focalWard?.densityPerSqKm,
  ]);

  return {
    agentName: "SpatialAgent",
    role: "DBSCAN Hotspot & Geographic Overlap Analyst",
    status: "COMPLETED",
    modelName: "deterministic-spatial-analyzer",
    modelVersion: "1.0.0",
    durationMs: Date.now() - startedAt,
    inputs: {
      city: scope.city || asset?.city || null,
      ward: scope.ward || asset?.ward || null,
    },
    outputs: {
      totalHotspots: allHotspots.length,
      activeHotspots: hotspotsRes?.activeCount ?? 0,
      crossCategoryOverlapCount: hotspotsRes?.crossCategoryOverlapCount ?? 0,
      focalHotspots: matchingHotspots.slice(0, 3).map((h) => ({
        id: h.id,
        hotspotKey: h.hotspotKey,
        title: h.title,
        ward: h.ward,
        severity: h.severity,
        status: h.status,
        complaintCount: h.complaintCount,
        openCount: h.openCount,
        densityPerSqKm: h.densityPerSqKm,
        hasCrossCategoryOverlap: h.hasCrossCategoryOverlap,
        overlapCategories: h.overlapCategories,
        overlapSummary: h.overlapSummary,
      })),
      focalWardAnalytics: focalWard || null,
      nearbyCatchmentZone: nearbyZone
        ? {
            radiusMeters: nearbyZone.radiusMeters,
            returnedCount: nearbyZone.returnedCount,
            openCount: nearbyZone.openCount,
            categoryCounts: nearbyZone.categoryCounts,
            hasCrossCategoryOverlap: nearbyZone.hasCrossCategoryOverlap,
            overlapAlert: nearbyZone.overlapAlert,
          }
        : null,
    },
  };
}

async function runComplaintAgent({ priorityOutput, infrastructureOutput, trace }) {
  const startedAt = Date.now();
  const scope = priorityOutput?.outputs?.resolvedScope || {};
  const asset = infrastructureOutput?.outputs?.primaryAsset || null;

  let focalDetail = null;
  let relatedData = null;

  if (scope.focalComplaintId || scope.focalComplaintRef) {
    const det = await executeAgentTool({
      toolName: "fetch_complaint_detail",
      agentName: "ComplaintAgent",
      args: { complaintIdOrRef: scope.focalComplaintRef || scope.focalComplaintId },
      trace,
    }).catch(() => ({ found: false }));
    if (det?.found) focalDetail = det.complaint;

    if (focalDetail?.id) {
      relatedData = await executeAgentTool({
        toolName: "find_related_complaints",
        agentName: "ComplaintAgent",
        args: { complaintId: focalDetail.id, limit: 6 },
        trace,
      }).catch(() => null);
    }
  }

  // Pull semantic search when question exists, plus structured list
  const searchQuery =
    scope.question && scope.question.length >= 3
      ? scope.question
      : asset?.ward || asset?.name || scope.city || "infrastructure";

  const [semanticRes, listRes] = await Promise.all([
    executeAgentTool({
      toolName: "semantic_search_complaints",
      agentName: "ComplaintAgent",
      args: {
        query: searchQuery,
        city: scope.city || asset?.city || null,
        limit: 12,
      },
      trace,
    }).catch(() => ({ results: [], embeddingSource: "unavailable" })),
    executeAgentTool({
      toolName: "fetch_complaints",
      agentName: "ComplaintAgent",
      args: {
        city: scope.city || asset?.city || null,
        limit: 20,
      },
      trace,
    }).catch(() => ({ complaints: [] })),
  ]);

  const allScoped = listRes?.complaints || [];
  const filteredByWard = asset?.ward
    ? allScoped.filter((c) =>
        String(c.ward || "").toLowerCase() === asset.ward.toLowerCase(),
      )
    : allScoped;

  const sampleComplaints =
    filteredByWard.length > 0 ? filteredByWard : semanticRes?.results || allScoped;

  const statusCounts = {};
  const categoryCounts = {};
  for (const c of sampleComplaints) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
    const cat = c.canonicalCategory || c.category || "OTHER";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  registerSafeNumbers(trace, [
    sampleComplaints.length,
    relatedData?.similarComplaints?.length || 0,
  ]);

  return {
    agentName: "ComplaintAgent",
    role: "Semantic Triage & Citizen Evidence Synthesizer",
    status: "COMPLETED",
    modelName: `layer1-${semanticRes?.embeddingSource || "semantic"}`,
    modelVersion: "1.0.0",
    durationMs: Date.now() - startedAt,
    inputs: {
      city: scope.city || asset?.city || null,
      ward: asset?.ward || scope.ward || null,
      queryUsed: searchQuery,
    },
    outputs: {
      focalComplaint: focalDetail,
      scopedComplaintCount: sampleComplaints.length,
      statusCounts,
      categoryCounts,
      semanticMatchCount: semanticRes?.results?.length || 0,
      similarComplaints: (relatedData?.similarComplaints || []).slice(0, 4).map((s) => ({
        id: s.complaintId,
        referenceId: s.referenceId,
        title: s.title,
        similarity: s.similarity,
        distanceMeters: s.distanceMeters,
        matchReasons: s.matchReasons,
      })),
      keyCitizenReports: sampleComplaints.slice(0, 6).map((c) => ({
        id: c.id,
        referenceId: c.referenceId,
        title: c.title,
        category: c.canonicalCategory || c.category,
        priority: c.priority,
        status: c.status,
        ward: c.ward,
        aiSummary: c.aiSummary || null,
        createdAt: c.createdAt,
      })),
    },
  };
}

async function runRecommendationAgent({
  priorityOutput,
  investigationOutput,
  infrastructureOutput,
  spatialOutput,
  complaintOutput,
  trace,
}) {
  const startedAt = Date.now();
  const asset = infrastructureOutput?.outputs?.primaryAsset || null;
  const upstreamList = investigationOutput?.outputs?.potentialContributingAssets || [];
  const upstreamDetails = infrastructureOutput?.outputs?.upstreamContributingDetails || [];
  const focalHotspots = spatialOutput?.outputs?.focalHotspots || [];
  const focalComplaint = complaintOutput?.outputs?.focalComplaint || null;
  const citizenReports = complaintOutput?.outputs?.keyCitizenReports || [];
  const scope = priorityOutput?.outputs?.resolvedScope || {};

  const recommendations = [];

  // 1. Cross-Infrastructure Non-Causal Joint Inspection Recommendation (if upstream asset detected)
  if (asset && upstreamList.length > 0) {
    const up = upstreamList[0];
    const upDetail = upstreamDetails.find((u) => u.assetCode === up.assetCode);
    const distPhrase =
      up.distanceMeters != null ? `${Math.round(up.distanceMeters)}m away` : "co-located nearby";
    const upstreamOpen = upDetail?.openComplaintCount ?? up.upstreamOpenComplaints ?? 0;

    recommendations.push({
      targetType: "ASSET",
      targetId: asset.assetCode,
      assetId: asset.id,
      complaintId: focalComplaint?.id || null,
      hotspotId: focalHotspots[0]?.id || null,
      city: asset.city,
      ward: asset.ward,
      category: "JOINT_INSPECTION",
      priority:
        asset.healthScore < 45 || (up.healthScore ?? 100) < 60 ? "CRITICAL" : "HIGH",
      actionTitle: `Joint inspection of ${up.assetCode} before repairing ${asset.assetCode}`,
      proposedAction: `Dispatch combined Engineering & Water Supply team to pressure-test and inspect ${up.assetCode} (${up.name}) prior to scheduling permanent resurfacing on ${asset.assetCode}.`,
      rationale: `Knowledge Graph analysis flagged ${up.assetCode} (${up.healthScore ?? "N/A"}/100, ${upstreamOpen} open complaints) located ${distPhrase} from ${asset.assetCode} (${asset.healthScore}/100, grade ${asset.healthGrade}) as a ${NON_CAUSAL_LABEL}. Repairing road surface before verifying subsurface leakage risks repeat degradation.`,
      evidenceCitations: [
        { entityType: "INFRASTRUCTURE_ASSET", entityCode: asset.assetCode, sourceTool: "get_asset_details", metric: `healthScore=${asset.healthScore}/100` },
        { entityType: "INFRASTRUCTURE_ASSET", entityCode: up.assetCode, sourceTool: "investigate_asset_graph", metric: `distance=${up.distanceMeters ?? "co-located"}m, confidence=${up.confidence}` },
      ],
      confidence: Math.min(0.95, Math.max(0.7, Number(up.confidence || 0.85))),
      requiresHumanConfirmation: true,
      isNonCausalInferred: true,
    });
  }

  // 2. Asset Maintenance & Backlog Resolution Recommendation
  if (asset && (asset.healthScore < 75 || (asset.maintenanceAgeMonths ?? 0) >= 6 || asset.openComplaintCount > 0)) {
    const maintMonths = asset.maintenanceAgeMonths != null ? `${asset.maintenanceAgeMonths} months` : "an unrecorded interval";
    recommendations.push({
      targetType: "ASSET",
      targetId: asset.assetCode,
      assetId: asset.id,
      complaintId: focalComplaint?.id || null,
      hotspotId: focalHotspots[0]?.id || null,
      city: asset.city,
      ward: asset.ward,
      category: "PREVENTIVE_REHABILITATION",
      priority: asset.healthGrade === "CRITICAL" ? "CRITICAL" : asset.healthGrade === "POOR" ? "HIGH" : "MEDIUM",
      actionTitle: `Execute maintenance & triage ${asset.openComplaintCount} open report(s) on ${asset.assetCode}`,
      proposedAction: `Assign ${asset.department || "Municipal Engineering"} crew to inspect and record completed ${asset.assetType === "ROAD_SEGMENT" ? "RESURFACING / REPAIR" : "REPAIR"} work order for ${asset.assetCode}, addressing open citizen complaints.`,
      rationale: `${asset.assetCode} is rated ${asset.healthGrade} (${asset.healthScore}/100, trend ${asset.trend}) with ${asset.openComplaintCount} open complaint(s) and last maintenance ${maintMonths} ago.`,
      evidenceCitations: [
        { entityType: "INFRASTRUCTURE_ASSET", entityCode: asset.assetCode, sourceTool: "get_asset_details", metric: `openComplaints=${asset.openComplaintCount}, maintAgeMonths=${asset.maintenanceAgeMonths}` },
      ],
      confidence: 0.91,
      requiresHumanConfirmation: true,
      isNonCausalInferred: false,
    });
  }

  // 3. Spatial Hotspot / Overlap Coordination Recommendation
  const overlapHotspot = focalHotspots.find((h) => h.hasCrossCategoryOverlap) || focalHotspots[0];
  if (overlapHotspot) {
    recommendations.push({
      targetType: "HOTSPOT",
      targetId: overlapHotspot.hotspotKey || overlapHotspot.id,
      assetId: asset?.id || null,
      complaintId: focalComplaint?.id || null,
      hotspotId: overlapHotspot.id,
      city: asset?.city || scope.city || null,
      ward: overlapHotspot.ward || asset?.ward || scope.ward || null,
      category: "SPATIAL_HOTSPOT_SWEEP",
      priority: overlapHotspot.severity === "CRITICAL" || overlapHotspot.severity === "HIGH" ? "HIGH" : "MEDIUM",
      actionTitle: `Coordinate inter-departmental sweep for cluster "${overlapHotspot.title}"`,
      proposedAction: overlapHotspot.hasCrossCategoryOverlap
        ? `Schedule a coordinated cross-department field sweep across ${(overlapHotspot.overlapCategories || []).join(", ")} in ${overlapHotspot.ward} covering ${overlapHotspot.openCount} open cluster tickets.`
        : `Assign rapid-response crew to resolve ${overlapHotspot.openCount} open complaints in hotspot ${overlapHotspot.ward}.`,
      rationale: `Layer 2 DBSCAN clustering detected ${overlapHotspot.complaintCount} clustered complaints (${overlapHotspot.openCount} open, ${overlapHotspot.densityPerSqKm} reports/sq.km)${overlapHotspot.overlapSummary ? ` — ${overlapHotspot.overlapSummary}` : ""}.`,
      evidenceCitations: [
        { entityType: "HOTSPOT", entityCode: overlapHotspot.hotspotKey, sourceTool: "list_hotspots", metric: `complaints=${overlapHotspot.complaintCount}, open=${overlapHotspot.openCount}` },
      ],
      confidence: 0.88,
      requiresHumanConfirmation: true,
      isNonCausalInferred: Boolean(overlapHotspot.hasCrossCategoryOverlap),
    });
  }

  // 4. Individual Complaint Triage Fallback (if investigation focused on complaint without asset matches)
  if (recommendations.length === 0 || focalComplaint) {
    const targetRef = focalComplaint?.referenceId || citizenReports[0]?.referenceId || null;
    const targetUuid = focalComplaint?.id || citizenReports[0]?.id || null;
    if (targetRef || citizenReports.length > 0) {
      recommendations.push({
        targetType: "COMPLAINT",
        targetId: targetRef || scope.city || "JURISDICTION",
        assetId: asset?.id || null,
        complaintId: targetUuid,
        hotspotId: focalHotspots[0]?.id || null,
        city: focalComplaint?.city || scope.city || null,
        ward: focalComplaint?.ward || scope.ward || null,
        category: "COMPLAINT_TRIAGE",
        priority: focalComplaint?.priority || "HIGH",
        actionTitle: targetRef
          ? `Prioritize field verification for ${targetRef}`
          : `Escalate top open complaints in ${scope.city || "jurisdiction"}`,
        proposedAction: targetRef
          ? `Review ${targetRef} ("${focalComplaint?.title || citizenReports[0]?.title}") and assign field inspection to ${focalComplaint?.department || citizenReports[0]?.department || "the responsible department"}.`
          : `Review the ${citizenReports.length} open complaints surfaced in ${scope.city || "the active queue"} and update assignment statuses.`,
        rationale: focalComplaint
          ? `Complaint ${targetRef} carries ${focalComplaint.priority} priority in status ${focalComplaint.status} within ${focalComplaint.ward || "ward"}.`
          : `Priority scan identified ${citizenReports.length} citizen reports requiring officer attention.`,
        evidenceCitations: targetRef
          ? [{ entityType: "COMPLAINT", entityCode: targetRef, sourceTool: "fetch_complaint_detail", metric: `priority=${focalComplaint?.priority || citizenReports[0]?.priority}` }]
          : [],
        confidence: 0.84,
        requiresHumanConfirmation: true,
        isNonCausalInferred: false,
      });
    }
  }

  const audited = auditRecommendations({
    recommendations,
    hasInferredLinks: Boolean(investigationOutput?.outputs?.hasInferredRelationships),
    groundTruth: trace.groundTruth,
  });

  return {
    agentName: "RecommendationAgent",
    role: "Evidence-Grounded Action Planner",
    status: "COMPLETED",
    modelName: "deterministic-policy-planner",
    modelVersion: "1.0.0",
    durationMs: Date.now() - startedAt,
    inputs: {
      candidateCount: recommendations.length,
      hasInferredLinks: Boolean(investigationOutput?.outputs?.hasInferredRelationships),
    },
    outputs: {
      recommendations: audited.recommendations,
      citationAuditIssuesCount: audited.citationIssues.length,
      humanConfirmationRequiredForAll: audited.recommendations.every(
        (r) => r.requiresHumanConfirmation,
      ),
    },
  };
}

async function runReportAgent({
  question,
  priorityOutput,
  investigationOutput,
  infrastructureOutput,
  spatialOutput,
  complaintOutput,
  recommendationOutput,
  preferGemini = false,
  trace,
}) {
  const startedAt = Date.now();
  const asset = infrastructureOutput?.outputs?.primaryAsset || null;
  const upstream = investigationOutput?.outputs?.potentialContributingAssets || [];
  const focalHotspots = spatialOutput?.outputs?.focalHotspots || [];
  const focalComplaint = complaintOutput?.outputs?.focalComplaint || null;
  const recs = recommendationOutput?.outputs?.recommendations || [];
  const topAssets = priorityOutput?.outputs?.topRankedAssets || [];

  const headline = asset
    ? `Investigation Brief: ${asset.assetCode} (${asset.healthScore}/100 · ${asset.healthGrade})`
    : focalComplaint
      ? `Complaint Investigation: ${focalComplaint.referenceId || focalComplaint.id}`
      : `Civic Operations Brief${priorityOutput?.outputs?.resolvedScope?.city ? ` — ${priorityOutput.outputs.resolvedScope.city}` : ""}`;

  const summaryParts = [];
  if (asset) {
    summaryParts.push(
      `${asset.assetCode} (${asset.name}, ${asset.ward || asset.city}) currently scores ${asset.healthScore}/100 (${asset.healthGrade}, trend ${asset.trend}) across ${asset.complaintCount} linked complaints (${asset.openComplaintCount} open).`,
    );
  } else if (focalComplaint) {
    summaryParts.push(
      `Complaint ${focalComplaint.referenceId} (${focalComplaint.category}, ${focalComplaint.priority} priority, status ${focalComplaint.status}) in ${focalComplaint.ward || focalComplaint.city} links across the civic knowledge graph.`,
    );
  } else if (topAssets.length > 0) {
    summaryParts.push(
      `Top priority infrastructure asset is ${topAssets[0].assetCode} (${topAssets[0].city}) scoring ${topAssets[0].healthScore}/100 (${topAssets[0].healthGrade}) with ${topAssets[0].openComplaintCount} open complaints.`,
    );
  }

  if (upstream.length > 0) {
    const up = upstream[0];
    summaryParts.push(
      `${NON_CAUSAL_LABEL}: co-located ${up.assetCode} (${up.name}, ${up.healthScore ?? "N/A"}/100) lies ${up.distanceMeters != null ? `${up.distanceMeters}m` : "within proximity"} with ${up.upstreamOpenComplaints} open upstream report(s), warranting joint inspection before major civil repair.`,
    );
  }

  if (focalHotspots.length > 0) {
    const hs = focalHotspots[0];
    summaryParts.push(
      `Spatial clustering places this zone inside active hotspot "${hs.title}" (${hs.complaintCount} reports, ${hs.openCount} open${hs.hasCrossCategoryOverlap ? `, cross-category overlap across ${(hs.overlapCategories || []).join(", ")}` : ""}).`,
    );
  }

  const deterministicExecutiveSummary = enforceNonCausalFraming(
    summaryParts.join(" "),
    { hasInferredLinks: Boolean(investigationOutput?.outputs?.hasInferredRelationships) },
  ).sanitizedText;

  const keyFindings = [];
  if (asset?.scoreBreakdown) {
    const b = asset.scoreBreakdown;
    keyFindings.push(
      `Health penalties for ${asset.assetCode}: complaint impact ${b.complaintImpactPenalty ?? 0}, recurrence ${b.recurrencePenalty ?? 0}, severity ${b.severityPenalty ?? 0}, unresolved age ${b.unresolvedDurationPenalty ?? 0}, maintenance age ${b.maintenanceAgePenalty ?? 0}.`,
    );
  }
  if (upstream.length > 0) {
    for (const up of upstream) {
      keyFindings.push(
        `${NON_CAUSAL_LABEL}: ${up.assetCode} (${up.assetType}) at ${up.distanceMeters ?? "co-located"}m confidence ${up.confidence} — ${up.disclaimer || "verify via field inspection"}.`,
      );
    }
  }
  if (complaintOutput?.outputs?.keyCitizenReports?.length > 0) {
    const refs = complaintOutput.outputs.keyCitizenReports
      .map((c) => c.referenceId)
      .filter(Boolean)
      .slice(0, 4);
    if (refs.length > 0) {
      keyFindings.push(
        `Supporting citizen complaint tickets reviewed: ${refs.join(", ")}.`,
      );
    }
  }
  if (recs.length > 0) {
    keyFindings.push(
      `${recs.length} recommendation(s) generated requiring human officer confirmation (ACCEPT / REJECT / MODIFY).`,
    );
  }

  let finalExecutiveSummary = deterministicExecutiveSummary;
  let finalKeyFindings = keyFindings;
  let modelUsed = "deterministic-report-synthesizer";
  let geminiDraftBlocked = false;
  let blockedReasons = [];

  const allowGeminiCall =
    Boolean(preferGemini) &&
    hasGeminiApiKey() &&
    process.env.NODE_ENV !== "test";

  if (allowGeminiCall) {
    try {
      const llmPrompt = [
        `Original Officer Query: ${question || "Civic investigation"}`,
        `Verified Deterministic Executive Summary: ${deterministicExecutiveSummary}`,
        `Verified Key Findings:\n- ${keyFindings.join("\n- ")}`,
        `Verified Recommendations:\n- ${recs.map((r) => `${r.actionTitle}: ${r.proposedAction}`).join("\n- ")}`,
        "",
        "Task: Rewrite the executiveSummary (2-3 crisp sentences) and up to 4 keyFindings using ONLY the exact entity codes, numbers, scores, distances, and facts given above. Any co-located infrastructure link MUST explicitly say 'Potential Relationship (Non-Causal)'. Do NOT invent any new numbers, asset codes, or complaint IDs.",
      ].join("\n");

      const geminiResp = await generateStructuredJson({
        systemInstruction:
          "You are CivicPulse's grounded municipal report synthesizer. Never fabricate numbers, asset codes, or causal proof.",
        prompt: llmPrompt,
        temperature: 0.1,
        responseJsonSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            keyFindings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["executiveSummary", "keyFindings"],
        },
      });

      if (geminiResp?.data?.executiveSummary) {
        const candidateSummary = enforceNonCausalFraming(
          geminiResp.data.executiveSummary,
          { hasInferredLinks: Boolean(investigationOutput?.outputs?.hasInferredRelationships) },
        ).sanitizedText;
        const candidateFindings = Array.isArray(geminiResp.data.keyFindings)
          ? geminiResp.data.keyFindings.slice(0, 5)
          : keyFindings;

        const groundingCheck = validateTextAgainstGroundTruth(
          [candidateSummary, ...candidateFindings],
          trace.groundTruth,
        );

        if (groundingCheck.passed) {
          finalExecutiveSummary = candidateSummary;
          finalKeyFindings = candidateFindings;
          modelUsed = geminiResp.model || AI_MODELS.text;
        } else {
          geminiDraftBlocked = true;
          blockedReasons = groundingCheck.unsupportedClaims;
        }
      }
    } catch {
      // Offline / transient Gemini fallback keeps deterministic grounded narrative
    }
  }

  const finalGroundingCheck = validateTextAgainstGroundTruth(
    [
      headline,
      finalExecutiveSummary,
      ...finalKeyFindings,
      ...recs.map((r) => `${r.actionTitle} ${r.proposedAction} ${r.rationale}`),
    ],
    trace.groundTruth,
  );

  return {
    agentName: "ReportAgent",
    role: "Grounded Executive Report Synthesizer",
    status: "COMPLETED",
    modelName: modelUsed,
    modelVersion: "1.0.0",
    durationMs: Date.now() - startedAt,
    inputs: {
      preferGemini: Boolean(preferGemini),
      geminiAttempted: allowGeminiCall,
    },
    outputs: {
      headline,
      executiveSummary: finalExecutiveSummary,
      keyFindings: finalKeyFindings,
      evidenceChainsCount: investigationOutput?.outputs?.evidenceChains?.length || 0,
      recommendedActionsCount: recs.length,
      guardrails: {
        deterministicMathOnly: true,
        readOnlyToolsOnly: true,
        humanConfirmationRequired: true,
        nonCausalInferenceEnforced: true,
        geminiDraftBlockedForHallucination: geminiDraftBlocked,
        blockedReasons,
      },
      groundingReport: finalGroundingCheck,
    },
  };
}

module.exports = {
  parseQueryHints,
  computeAssetPriorityScore,
  runPriorityAgent,
  runInvestigationAgent,
  runInfrastructureAgent,
  runSpatialAgent,
  runComplaintAgent,
  runRecommendationAgent,
  runReportAgent,
};
