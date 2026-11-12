const knowledgeGraphRepository = require("../../../repositories/knowledge-graph.repository");
const { haversineMeters } = require("../spatial/ward.resolver");

const GRAPH_MODEL_NAME = "civicpulse-kg-builder";
const GRAPH_MODEL_VERSION = "1.0.0";

function slugify(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeProvenance({
  sourceTable,
  sourceRecordIds = [],
  confidence = 1.0,
  isInferred = false,
  evidenceSummary = "",
  disclaimer = null,
  generatedAt,
}) {
  return {
    model: GRAPH_MODEL_NAME,
    version: GRAPH_MODEL_VERSION,
    sourceTable,
    sourceRecordIds: sourceRecordIds.filter(Boolean).map(String),
    confidence: Number(Number(confidence).toFixed(2)),
    isInferred: Boolean(isInferred),
    evidenceSummary,
    ...(disclaimer ? { disclaimer } : {}),
    generatedAt,
  };
}

function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    const a = Number(vecA[i]) || 0;
    const b = Number(vecB[i]) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function evaluateCrossInfrastructurePair(sourceAsset, targetAsset, distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters > 250) {
    return null;
  }

  const sType = String(sourceAsset.asset_type || "").toUpperCase();
  const tType = String(targetAsset.asset_type || "").toUpperCase();

  // Directed physical risk flow: water/drainage failures can undermine roads/lighting foundations
  const pairMatch =
    ((sType === "WATER_PIPELINE" || sType === "DRAINAGE") && tType === "ROAD_SEGMENT") ||
    (sType === "WATER_PIPELINE" && tType === "DRAINAGE") ||
    (sType === "DRAINAGE" && tType === "STREETLIGHT_CLUSTER");

  if (!pairMatch) {
    return null;
  }

  const proximityConf = Math.max(0.55, Math.min(0.92, 0.94 - distanceMeters / 500));
  const stressedBonus =
    Number(sourceAsset.open_complaint_count || 0) > 0 &&
    Number(targetAsset.open_complaint_count || 0) > 0
      ? 0.05
      : 0;
  const confidence = Number(Math.min(0.95, proximityConf + stressedBonus).toFixed(2));

  return {
    confidence,
    evidence: `${sourceAsset.asset_code} (${sType.toLowerCase().replace(/_/g, " ")}) lies ${Math.round(distanceMeters)}m from ${targetAsset.asset_code} (${tType.toLowerCase().replace(/_/g, " ")}) — potential seepage/subsurface risk`,
  };
}

function buildKnowledgeGraphFromSources(sources = {}, now = new Date()) {
  const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const {
    complaints = [],
    assets = [],
    assetLinks = [],
    hotspots = [],
    hotspotMembers = [],
    maintenanceEvents = [],
    embeddings = [],
  } = sources;

  const nodeMap = new Map();
  const edgeMap = new Map();

  function upsertNode(node) {
    if (!node || !node.nodeKey) return;
    if (!nodeMap.has(node.nodeKey)) {
      nodeMap.set(node.nodeKey, node);
    } else {
      const existing = nodeMap.get(node.nodeKey);
      nodeMap.set(node.nodeKey, {
        ...existing,
        ...node,
        properties: { ...(existing.properties || {}), ...(node.properties || {}) },
      });
    }
  }

  function upsertEdge(edge) {
    if (!edge || !edge.sourceKey || !edge.targetKey || edge.sourceKey === edge.targetKey) {
      return;
    }
    const key = `${edge.sourceKey}::${edge.relationType}::${edge.targetKey}`;
    const existing = edgeMap.get(key);
    if (!existing || Number(edge.confidence ?? 0) > Number(existing.confidence ?? 0)) {
      edgeMap.set(key, edge);
    }
  }

  const assetById = new Map();
  const complaintById = new Map();
  const hotspotById = new Map();

  // 1. Infrastructure Assets + Departments + Wards
  for (const a of assets) {
    const assetKey = `asset:${a.asset_code}`;
    assetById.set(a.id, { row: a, nodeKey: assetKey });

    upsertNode({
      nodeKey: assetKey,
      entityType: "INFRASTRUCTURE_ASSET",
      externalId: String(a.id),
      label: `${a.asset_code} · ${a.name}`,
      city: a.city || null,
      ward: a.ward || null,
      properties: {
        assetCode: a.asset_code,
        name: a.name,
        assetType: a.asset_type,
        healthScore: Number(a.health_score ?? 100),
        healthGrade: a.health_grade || "GOOD",
        trend: a.trend || "STABLE",
        complaintCount: Number(a.complaint_count || 0),
        openComplaintCount: Number(a.open_complaint_count || 0),
        recurrenceCount: Number(a.recurrence_count || 0),
        lastMaintainedAt: a.last_maintained_at || null,
        department: a.department,
        address: a.address || null,
        latitude: a.latitude != null ? Number(a.latitude) : null,
        longitude: a.longitude != null ? Number(a.longitude) : null,
      },
      provenance: makeProvenance({
        sourceTable: "infrastructure_assets",
        sourceRecordIds: [a.id],
        confidence: 1.0,
        isInferred: false,
        evidenceSummary: `Canonical infrastructure asset record ${a.asset_code}`,
        generatedAt,
      }),
    });

    if (a.department) {
      const deptKey = `department:${slugify(a.department)}`;
      upsertNode({
        nodeKey: deptKey,
        entityType: "DEPARTMENT",
        externalId: slugify(a.department),
        label: a.department,
        city: null,
        ward: null,
        properties: { name: a.department },
        provenance: makeProvenance({
          sourceTable: "infrastructure_assets",
          sourceRecordIds: [a.id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Municipal department responsible for civic infrastructure`,
          generatedAt,
        }),
      });
      upsertEdge({
        sourceKey: assetKey,
        targetKey: deptKey,
        relationType: "MAINTAINED_BY",
        weight: 1.0,
        confidence: 1.0,
        isInferred: false,
        evidence: `${a.asset_code} is maintained by ${a.department}`,
        provenance: makeProvenance({
          sourceTable: "infrastructure_assets",
          sourceRecordIds: [a.id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Asset ownership mapping on infrastructure_assets.department`,
          generatedAt,
        }),
      });
    }

    if (a.ward) {
      const cityLabel = a.city || "General Jurisdiction";
      const wardKey = `ward:${slugify(cityLabel)}::${slugify(a.ward)}`;
      upsertNode({
        nodeKey: wardKey,
        entityType: "WARD",
        externalId: `${cityLabel}::${a.ward}`,
        label: `${a.ward} (${cityLabel})`,
        city: cityLabel,
        ward: a.ward,
        properties: { ward: a.ward, city: cityLabel, zone: a.zone || null },
        provenance: makeProvenance({
          sourceTable: "infrastructure_assets",
          sourceRecordIds: [a.id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Administrative ward boundary entity`,
          generatedAt,
        }),
      });
      upsertEdge({
        sourceKey: assetKey,
        targetKey: wardKey,
        relationType: "LOCATED_IN",
        weight: 1.0,
        confidence: 1.0,
        isInferred: false,
        evidence: `${a.asset_code} sits in ${a.ward}, ${cityLabel}`,
        provenance: makeProvenance({
          sourceTable: "infrastructure_assets",
          sourceRecordIds: [a.id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Spatial ward attribution on infrastructure asset`,
          generatedAt,
        }),
      });
    }
  }

  // 2. Complaints + Categories + Officers + Wards + Departments
  for (const c of complaints) {
    const refLabel = c.reference_id ? `#${c.reference_id}` : `#${String(c.id).slice(0, 8)}`;
    const complaintKey = `complaint:${c.reference_id || c.id}`;
    complaintById.set(c.id, { row: c, nodeKey: complaintKey });

    const canonicalCategory = String(c.canonical_category || c.category || "OTHER").toUpperCase();
    const effectivePriority = String(c.effective_priority || "MEDIUM").toUpperCase();

    upsertNode({
      nodeKey: complaintKey,
      entityType: "COMPLAINT",
      externalId: String(c.id),
      label: `${refLabel} · ${c.title}`,
      city: c.city || null,
      ward: c.ward || null,
      properties: {
        referenceId: c.reference_id || null,
        title: c.title,
        category: c.category,
        canonicalCategory,
        priority: effectivePriority,
        status: c.status,
        department: c.department || null,
        address: c.address || null,
        latitude: c.latitude != null ? Number(c.latitude) : null,
        longitude: c.longitude != null ? Number(c.longitude) : null,
        createdAt: c.created_at,
      },
      provenance: makeProvenance({
        sourceTable: "complaints",
        sourceRecordIds: [c.id],
        confidence: 1.0,
        isInferred: false,
        evidenceSummary: `Registered citizen complaint ${refLabel}`,
        generatedAt,
      }),
    });

    const catKey = `category:${canonicalCategory}`;
    upsertNode({
      nodeKey: catKey,
      entityType: "CATEGORY",
      externalId: canonicalCategory,
      label: canonicalCategory.replace(/_/g, " "),
      city: null,
      ward: null,
      properties: { category: canonicalCategory },
      provenance: makeProvenance({
        sourceTable: "complaints",
        sourceRecordIds: [c.id],
        confidence: 1.0,
        isInferred: false,
        evidenceSummary: `Canonical issue taxonomy category`,
        generatedAt,
      }),
    });
    upsertEdge({
      sourceKey: complaintKey,
      targetKey: catKey,
      relationType: "HAS_CATEGORY",
      weight: 1.0,
      confidence: 1.0,
      isInferred: false,
      evidence: `${refLabel} classified under ${canonicalCategory}`,
      provenance: makeProvenance({
        sourceTable: "complaints",
        sourceRecordIds: [c.id],
        confidence: 1.0,
        isInferred: false,
        evidenceSummary: `Category / AI-category assignment on complaint`,
        generatedAt,
      }),
    });

    if (c.department) {
      const deptKey = `department:${slugify(c.department)}`;
      upsertNode({
        nodeKey: deptKey,
        entityType: "DEPARTMENT",
        externalId: slugify(c.department),
        label: c.department,
        city: null,
        ward: null,
        properties: { name: c.department },
        provenance: makeProvenance({
          sourceTable: "complaints",
          sourceRecordIds: [c.id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Municipal department routed for complaint handling`,
          generatedAt,
        }),
      });
      upsertEdge({
        sourceKey: complaintKey,
        targetKey: deptKey,
        relationType: "ROUTED_TO",
        weight: 1.0,
        confidence: 1.0,
        isInferred: false,
        evidence: `${refLabel} routed to ${c.department}`,
        provenance: makeProvenance({
          sourceTable: "complaints",
          sourceRecordIds: [c.id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Department routing field on complaint`,
          generatedAt,
        }),
      });
    }

    if (c.ward) {
      const cityLabel = c.city || "General Jurisdiction";
      const wardKey = `ward:${slugify(cityLabel)}::${slugify(c.ward)}`;
      upsertNode({
        nodeKey: wardKey,
        entityType: "WARD",
        externalId: `${cityLabel}::${c.ward}`,
        label: `${c.ward} (${cityLabel})`,
        city: cityLabel,
        ward: c.ward,
        properties: { ward: c.ward, city: cityLabel, zone: c.zone || null },
        provenance: makeProvenance({
          sourceTable: "complaints",
          sourceRecordIds: [c.id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Geographic ward boundary entity`,
          generatedAt,
        }),
      });
      upsertEdge({
        sourceKey: complaintKey,
        targetKey: wardKey,
        relationType: "LOCATED_IN",
        weight: 1.0,
        confidence: 1.0,
        isInferred: false,
        evidence: `${refLabel} reported in ${c.ward}, ${cityLabel}`,
        provenance: makeProvenance({
          sourceTable: "complaints",
          sourceRecordIds: [c.id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Complaint ward classification`,
          generatedAt,
        }),
      });
    }

    if (c.assigned_officer_id) {
      const officerKey = `officer:${c.assigned_officer_id}`;
      upsertNode({
        nodeKey: officerKey,
        entityType: "OFFICER",
        externalId: String(c.assigned_officer_id),
        label: c.assigned_officer_name || "Assigned Officer",
        city: null,
        ward: null,
        properties: {
          name: c.assigned_officer_name || "Assigned Officer",
          email: c.assigned_officer_email || null,
        },
        provenance: makeProvenance({
          sourceTable: "users",
          sourceRecordIds: [c.assigned_officer_id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Assigned officer governance record`,
          generatedAt,
        }),
      });
      upsertEdge({
        sourceKey: complaintKey,
        targetKey: officerKey,
        relationType: "ASSIGNED_TO",
        weight: 1.0,
        confidence: 1.0,
        isInferred: false,
        evidence: `${refLabel} assigned to ${c.assigned_officer_name || "Officer"}`,
        provenance: makeProvenance({
          sourceTable: "complaints",
          sourceRecordIds: [c.id, c.assigned_officer_id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Officer assignment on complaint record`,
          generatedAt,
        }),
      });
    }
  }

  // 3. Spatial Hotspots + IN_HOTSPOT edges (Complaints -> Hotspots & Assets -> Hotspots)
  for (const hs of hotspots) {
    const hotspotKey = `hotspot:${hs.hotspot_key}`;
    hotspotById.set(hs.id, { row: hs, nodeKey: hotspotKey });

    upsertNode({
      nodeKey: hotspotKey,
      entityType: "HOTSPOT",
      externalId: String(hs.id),
      label: hs.title,
      city: hs.city || null,
      ward: hs.ward || null,
      properties: {
        hotspotKey: hs.hotspot_key,
        severity: hs.severity,
        status: hs.status,
        complaintCount: Number(hs.complaint_count || 0),
        openCount: Number(hs.open_count || 0),
        hasCrossCategoryOverlap: Boolean(hs.has_cross_category_overlap),
        overlapCategories: hs.overlap_categories || [],
        overlapSummary: hs.overlap_summary || null,
        radiusMeters: Number(hs.radius_meters || 100),
        confidence: Number(hs.confidence || 0.8),
      },
      provenance: makeProvenance({
        sourceTable: "hotspots",
        sourceRecordIds: [hs.id],
        confidence: Number(hs.confidence || 0.85),
        isInferred: false,
        evidenceSummary: `Layer 2 DBSCAN spatial cluster (${hs.complaint_count} reports)`,
        generatedAt,
      }),
    });

    if (hs.ward) {
      const cityLabel = hs.city || "General Jurisdiction";
      const wardKey = `ward:${slugify(cityLabel)}::${slugify(hs.ward)}`;
      upsertEdge({
        sourceKey: hotspotKey,
        targetKey: wardKey,
        relationType: "LOCATED_IN",
        weight: 1.0,
        confidence: 1.0,
        isInferred: false,
        evidence: `Hotspot "${hs.title}" intersects ${hs.ward}`,
        provenance: makeProvenance({
          sourceTable: "hotspots",
          sourceRecordIds: [hs.id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Hotspot ward location`,
          generatedAt,
        }),
      });
    }
  }

  const complaintHotspotMap = new Map();
  for (const hm of hotspotMembers) {
    const cEntry = complaintById.get(hm.complaint_id);
    const hEntry = hotspotById.get(hm.hotspot_id);
    if (!cEntry || !hEntry) continue;

    if (!complaintHotspotMap.has(hm.complaint_id)) {
      complaintHotspotMap.set(hm.complaint_id, []);
    }
    complaintHotspotMap.get(hm.complaint_id).push(hEntry);

    upsertEdge({
      sourceKey: cEntry.nodeKey,
      targetKey: hEntry.nodeKey,
      relationType: "IN_HOTSPOT",
      weight: 1.0,
      confidence: Number(hEntry.row.confidence || 0.88),
      isInferred: false,
      evidence: `${cEntry.nodeKey} belongs to spatial hotspot "${hEntry.row.title}" (${Math.round(hm.distance_from_center_meters || 0)}m from centroid)`,
      provenance: makeProvenance({
        sourceTable: "hotspot_complaints",
        sourceRecordIds: [hm.hotspot_id, hm.complaint_id],
        confidence: Number(hEntry.row.confidence || 0.88),
        isInferred: false,
        evidenceSummary: `Spatial DBSCAN cluster membership`,
        generatedAt,
      }),
    });
  }

  // 4. Complaint -> Asset Links (AFFECTS & CROSS_IMPACTS) + Asset -> Hotspot derived membership
  for (const link of assetLinks) {
    const cEntry = complaintById.get(link.complaint_id);
    const aEntry = assetById.get(link.asset_id);
    if (!cEntry || !aEntry) continue;

    const isCross = String(link.link_type || "").toUpperCase() === "CROSS_IMPACT";
    const relType = isCross ? "CROSS_IMPACTS" : "AFFECTS";
    const conf = Number(link.link_confidence ?? 0.85);

    upsertEdge({
      sourceKey: cEntry.nodeKey,
      targetKey: aEntry.nodeKey,
      relationType: relType,
      weight: isCross ? 0.75 : 1.0,
      confidence: conf,
      isInferred: isCross,
      evidence:
        link.link_reason ||
        `${cEntry.nodeKey} ${isCross ? "potentially cross-impacts" : "affects"} ${aEntry.row.asset_code}`,
      properties: {
        distanceMeters: link.distance_meters != null ? Number(link.distance_meters) : null,
        linkType: link.link_type,
      },
      provenance: makeProvenance({
        sourceTable: "complaint_asset_links",
        sourceRecordIds: [link.complaint_id, link.asset_id],
        confidence: conf,
        isInferred: isCross,
        evidenceSummary:
          link.link_reason ||
          `Spatial & category catchment link (${link.distance_meters ?? "?"}m)`,
        disclaimer: isCross
          ? "Potential cross-category impact inferred from proximity; confirm root cause via inspection."
          : null,
        generatedAt,
      }),
    });

    // Bridge Asset -> Hotspot whenever complaints impacting this asset sit in a hotspot
    const hsList = complaintHotspotMap.get(link.complaint_id) || [];
    for (const hEntry of hsList) {
      upsertEdge({
        sourceKey: aEntry.nodeKey,
        targetKey: hEntry.nodeKey,
        relationType: "IN_HOTSPOT",
        weight: 0.9,
        confidence: Number(hEntry.row.confidence || 0.86),
        isInferred: false,
        evidence: `${aEntry.row.asset_code} intersects spatial hotspot "${hEntry.row.title}" via linked reports`,
        provenance: makeProvenance({
          sourceTable: "complaint_asset_links + hotspot_complaints",
          sourceRecordIds: [link.asset_id, hEntry.row.id, link.complaint_id],
          confidence: Number(hEntry.row.confidence || 0.86),
          isInferred: false,
          evidenceSummary: `Asset catchment overlaps hotspot complaints`,
          generatedAt,
        }),
      });
    }
  }

  // 5. Maintenance Events -> Assets & Actors
  for (const m of maintenanceEvents) {
    const aEntry = assetById.get(m.asset_id);
    if (!aEntry) continue;
    const maintKey = `maintenance:${m.id}`;

    upsertNode({
      nodeKey: maintKey,
      entityType: "MAINTENANCE_EVENT",
      externalId: String(m.id),
      label: `${m.event_type.replace(/_/g, " ")} (${m.outcome}) · ${aEntry.row.asset_code}`,
      city: aEntry.row.city || null,
      ward: aEntry.row.ward || null,
      properties: {
        eventType: m.event_type,
        outcome: m.outcome,
        performedBy: m.performed_by || m.actor_name || "Municipal Engineering Crew",
        notes: m.notes || null,
        performedAt: m.performed_at,
        assetCode: aEntry.row.asset_code,
      },
      provenance: makeProvenance({
        sourceTable: "maintenance_events",
        sourceRecordIds: [m.id, m.asset_id],
        confidence: 1.0,
        isInferred: false,
        evidenceSummary: `Recorded field work event on ${aEntry.row.asset_code}`,
        generatedAt,
      }),
    });

    upsertEdge({
      sourceKey: aEntry.nodeKey,
      targetKey: maintKey,
      relationType: "HAS_MAINTENANCE",
      weight: 1.0,
      confidence: 1.0,
      isInferred: false,
      evidence: `${aEntry.row.asset_code} had ${m.event_type.toLowerCase()} (${m.outcome.toLowerCase()})`,
      provenance: makeProvenance({
        sourceTable: "maintenance_events",
        sourceRecordIds: [m.id, m.asset_id],
        confidence: 1.0,
        isInferred: false,
        evidenceSummary: `Asset maintenance log linkage`,
        generatedAt,
      }),
    });

    if (m.actor_id) {
      const actorKey = `officer:${m.actor_id}`;
      upsertNode({
        nodeKey: actorKey,
        entityType: "OFFICER",
        externalId: String(m.actor_id),
        label: m.actor_name || m.performed_by || "Officer",
        city: null,
        ward: null,
        properties: { name: m.actor_name || m.performed_by || "Officer" },
        provenance: makeProvenance({
          sourceTable: "users",
          sourceRecordIds: [m.actor_id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Maintenance actor account`,
          generatedAt,
        }),
      });
      upsertEdge({
        sourceKey: maintKey,
        targetKey: actorKey,
        relationType: "PERFORMED_BY",
        weight: 0.9,
        confidence: 1.0,
        isInferred: false,
        evidence: `${m.event_type} logged by ${m.actor_name || m.performed_by}`,
        provenance: makeProvenance({
          sourceTable: "maintenance_events",
          sourceRecordIds: [m.id, m.actor_id],
          confidence: 1.0,
          isInferred: false,
          evidenceSummary: `Actor reference on maintenance event`,
          generatedAt,
        }),
      });
    }
  }

  // 6. Spatial Cross-Infrastructure Potential Impact Inference (POTENTIALLY_IMPACTS)
  // Explicitly marked isInferred = true per Page 8 & 14 guardrails (Potential Relationship, NOT causation).
  for (let i = 0; i < assets.length; i += 1) {
    const a1 = assets[i];
    if (a1.latitude == null || a1.longitude == null) continue;
    for (let j = 0; j < assets.length; j += 1) {
      if (i === j) continue;
      const a2 = assets[j];
      if (a2.latitude == null || a2.longitude == null) continue;
      if (
        a1.city &&
        a2.city &&
        a1.city.toLowerCase() !== a2.city.toLowerCase()
      ) {
        continue;
      }

      const dist = haversineMeters(a1.latitude, a1.longitude, a2.latitude, a2.longitude);
      const match = evaluateCrossInfrastructurePair(a1, a2, dist);
      if (match) {
        upsertEdge({
          sourceKey: `asset:${a1.asset_code}`,
          targetKey: `asset:${a2.asset_code}`,
          relationType: "POTENTIALLY_IMPACTS",
          weight: 0.85,
          confidence: match.confidence,
          isInferred: true,
          evidence: match.evidence,
          properties: {
            distanceMeters: Math.round(dist * 10) / 10,
            relationshipStatus: "POTENTIAL_NON_CAUSAL",
          },
          provenance: makeProvenance({
            sourceTable: "infrastructure_assets",
            sourceRecordIds: [a1.id, a2.id],
            confidence: match.confidence,
            isInferred: true,
            evidenceSummary: match.evidence,
            disclaimer:
              "Potential relationship inferred from spatial proximity between co-located infrastructure assets; NOT confirmed causation without field inspection.",
            generatedAt,
          }),
        });
      }
    }
  }

  // 7. Semantic Similarity Edges between Complaints (SIMILAR_TO)
  const embeddingByComplaintId = new Map();
  for (const emb of embeddings) {
    if (Array.isArray(emb.embedding) && emb.embedding.length > 0) {
      embeddingByComplaintId.set(emb.complaint_id, emb);
    }
  }

  const embList = Array.from(embeddingByComplaintId.values());
  const topPeersByComplaint = new Map();
  for (let i = 0; i < embList.length; i += 1) {
    const e1 = embList[i];
    const c1 = complaintById.get(e1.complaint_id);
    if (!c1) continue;

    for (let j = i + 1; j < embList.length; j += 1) {
      const e2 = embList[j];
      const c2 = complaintById.get(e2.complaint_id);
      if (!c2) continue;

      const sim = cosineSimilarity(e1.embedding, e2.embedding);
      if (sim < 0.72) continue;

      // Require same city OR strong semantic match (>= 0.80) so cross-city generic noise stays clean
      const sameCity =
        !c1.row.city ||
        !c2.row.city ||
        c1.row.city.toLowerCase() === c2.row.city.toLowerCase();
      if (!sameCity && sim < 0.82) continue;

      const pairScore = Number(sim.toFixed(2));
      if (!topPeersByComplaint.has(e1.complaint_id)) {
        topPeersByComplaint.set(e1.complaint_id, []);
      }
      topPeersByComplaint.get(e1.complaint_id).push({ other: c2, sim: pairScore, e2 });

      if (!topPeersByComplaint.has(e2.complaint_id)) {
        topPeersByComplaint.set(e2.complaint_id, []);
      }
      topPeersByComplaint.get(e2.complaint_id).push({ other: c1, sim: pairScore, e2: e1 });
    }
  }

  for (const [cId, peers] of topPeersByComplaint.entries()) {
    const origin = complaintById.get(cId);
    if (!origin) continue;
    peers.sort((a, b) => b.sim - a.sim);
    for (const peer of peers.slice(0, 2)) {
      const [firstKey, secondKey] =
        origin.nodeKey < peer.other.nodeKey
          ? [origin.nodeKey, peer.other.nodeKey]
          : [peer.other.nodeKey, origin.nodeKey];

      upsertEdge({
        sourceKey: firstKey,
        targetKey: secondKey,
        relationType: "SIMILAR_TO",
        weight: 0.75,
        confidence: peer.sim,
        isInferred: true,
        evidence: `Semantic embedding cosine similarity ${Math.round(peer.sim * 100)}%`,
        properties: {
          similarityScore: peer.sim,
          modelName: peer.e2.model_name || "semantic-embedding",
        },
        provenance: makeProvenance({
          sourceTable: "complaint_semantic_embeddings",
          sourceRecordIds: [origin.row.id, peer.other.row.id],
          confidence: peer.sim,
          isInferred: true,
          evidenceSummary: `Pairwise vector similarity >= 0.72`,
          disclaimer:
            "Potential duplicate / similar issue inferred from text embeddings; officers confirm duplicate status.",
          generatedAt,
        }),
      });
    }
  }

  return {
    generatedAt,
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

async function syncKnowledgeGraph({ city = null } = {}) {
  const startedMs = Date.now();
  const sources = await knowledgeGraphRepository.fetchGraphSourceData({ city });
  const built = buildKnowledgeGraphFromSources(sources, new Date());
  const persisted = await knowledgeGraphRepository.persistKnowledgeGraphSnapshot({
    nodes: built.nodes,
    edges: built.edges,
    pruneStale: !city || city === "all",
  });

  return {
    city: city && city !== "all" ? city : null,
    nodesSynced: persisted.nodesSynced,
    edgesSynced: persisted.edgesSynced,
    inferredEdgesCount: built.edges.filter((e) => e.isInferred).length,
    durationMs: Date.now() - startedMs,
    generatedAt: built.generatedAt,
  };
}

module.exports = {
  GRAPH_MODEL_NAME,
  GRAPH_MODEL_VERSION,
  slugify,
  cosineSimilarity,
  evaluateCrossInfrastructurePair,
  buildKnowledgeGraphFromSources,
  syncKnowledgeGraph,
};
