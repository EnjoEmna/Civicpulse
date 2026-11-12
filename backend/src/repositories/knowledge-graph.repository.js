const pool = require("../config/database");

async function fetchGraphSourceData({ city = null } = {}) {
  const hasCity = Boolean(city && city !== "all");
  const params = hasCity ? [city] : [];
  const complaintWhere = hasCity ? `WHERE LOWER(COALESCE(c.city, '')) = LOWER($1)` : "";
  const assetWhere = hasCity ? `WHERE LOWER(COALESCE(a.city, '')) = LOWER($1)` : "";
  const hotspotWhere = hasCity ? `WHERE LOWER(COALESCE(h.city, '')) = LOWER($1)` : "";

  const [
    complaintsRes,
    assetsRes,
    assetLinksRes,
    hotspotsRes,
    hotspotMembersRes,
    maintenanceRes,
    embeddingsRes,
  ] = await Promise.all([
    pool.query(
      `SELECT c.id,
              c.reference_id,
              c.title,
              c.description,
              c.category,
              COALESCE(c.ai_category, c.category) AS canonical_category,
              COALESCE(c.ai_priority, c.priority) AS effective_priority,
              c.status,
              c.department,
              c.city,
              c.ward,
              c.zone,
              c.address,
              c.latitude,
              c.longitude,
              c.assigned_officer_id,
              u.name AS assigned_officer_name,
              u.email AS assigned_officer_email,
              c.created_at
       FROM complaints c
       LEFT JOIN users u ON u.id = c.assigned_officer_id
       ${complaintWhere}
       ORDER BY c.created_at DESC`,
      params,
    ),
    pool.query(
      `SELECT a.id,
              a.asset_code,
              a.name,
              a.asset_type,
              a.city,
              a.ward,
              a.zone,
              a.address,
              a.latitude,
              a.longitude,
              a.catchment_radius_meters,
              a.department,
              a.last_maintained_at,
              a.health_score,
              a.health_grade,
              a.trend,
              a.complaint_count,
              a.open_complaint_count,
              a.recurrence_count,
              a.score_breakdown
       FROM infrastructure_assets a
       ${assetWhere}
       ORDER BY a.health_score ASC`,
      params,
    ),
    pool.query(
      `SELECT cal.complaint_id,
              cal.asset_id,
              cal.distance_meters,
              cal.link_type,
              cal.link_confidence,
              cal.link_reason,
              cal.created_at
       FROM complaint_asset_links cal
       JOIN infrastructure_assets a ON a.id = cal.asset_id
       ${hasCity ? `WHERE LOWER(COALESCE(a.city, '')) = LOWER($1)` : ""}`,
      params,
    ),
    pool.query(
      `SELECT h.id,
              h.hotspot_key,
              h.title,
              h.city,
              h.ward,
              h.zone,
              h.center_latitude,
              h.center_longitude,
              h.radius_meters,
              h.dominant_category,
              h.issue_categories,
              h.complaint_count,
              h.open_count,
              h.severity,
              h.has_cross_category_overlap,
              h.overlap_categories,
              h.overlap_summary,
              h.confidence,
              h.status,
              h.detected_at
       FROM hotspots h
       ${hotspotWhere}`,
      params,
    ),
    pool.query(
      `SELECT hc.hotspot_id,
              hc.complaint_id,
              hc.distance_from_center_meters
       FROM hotspot_complaints hc
       JOIN hotspots h ON h.id = hc.hotspot_id
       ${hotspotWhere}`,
      params,
    ),
    pool.query(
      `SELECT m.id,
              m.asset_id,
              m.event_type,
              m.outcome,
              m.performed_by,
              m.actor_id,
              u.name AS actor_name,
              m.notes,
              m.performed_at
       FROM maintenance_events m
       JOIN infrastructure_assets a ON a.id = m.asset_id
       LEFT JOIN users u ON u.id = m.actor_id
       ${hasCity ? `WHERE LOWER(COALESCE(a.city, '')) = LOWER($1)` : ""}
       ORDER BY m.performed_at DESC`,
      params,
    ),
    pool
      .query(
        `SELECT e.complaint_id,
                e.embedding,
                e.model_name,
                e.model_version
         FROM complaint_semantic_embeddings e
         JOIN complaints c ON c.id = e.complaint_id
         ${complaintWhere}`,
        params,
      )
      .catch(() => ({ rows: [] })),
  ]);

  return {
    complaints: complaintsRes.rows,
    assets: assetsRes.rows,
    assetLinks: assetLinksRes.rows,
    hotspots: hotspotsRes.rows,
    hotspotMembers: hotspotMembersRes.rows,
    maintenanceEvents: maintenanceRes.rows,
    embeddings: embeddingsRes.rows,
  };
}

async function persistKnowledgeGraphSnapshot({
  nodes = [],
  edges = [],
  pruneStale = true,
} = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const keyToId = new Map();
    const upsertedNodeIds = [];

    for (const node of nodes) {
      const res = await client.query(
        `INSERT INTO knowledge_graph_nodes (
           node_key, entity_type, external_id, label, city, ward, properties, provenance
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
         ON CONFLICT (node_key) DO UPDATE SET
           entity_type = EXCLUDED.entity_type,
           external_id = COALESCE(EXCLUDED.external_id, knowledge_graph_nodes.external_id),
           label = EXCLUDED.label,
           city = COALESCE(EXCLUDED.city, knowledge_graph_nodes.city),
           ward = COALESCE(EXCLUDED.ward, knowledge_graph_nodes.ward),
           properties = EXCLUDED.properties,
           provenance = EXCLUDED.provenance,
           updated_at = NOW()
         RETURNING id, node_key`,
        [
          node.nodeKey,
          node.entityType,
          node.externalId || null,
          String(node.label || node.nodeKey).slice(0, 240),
          node.city || null,
          node.ward || null,
          JSON.stringify(node.properties || {}),
          JSON.stringify(node.provenance || {}),
        ],
      );
      const saved = res.rows[0];
      keyToId.set(saved.node_key, saved.id);
      upsertedNodeIds.push(saved.id);
    }

    const upsertedEdgeIds = [];
    for (const edge of edges) {
      const sourceId = keyToId.get(edge.sourceKey);
      const targetId = keyToId.get(edge.targetKey);
      if (!sourceId || !targetId || sourceId === targetId) {
        continue;
      }

      const res = await client.query(
        `INSERT INTO knowledge_graph_edges (
           source_node_id, target_node_id, relation_type, weight, confidence, is_inferred, evidence, provenance, properties
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
         ON CONFLICT (source_node_id, target_node_id, relation_type) DO UPDATE SET
           weight = EXCLUDED.weight,
           confidence = EXCLUDED.confidence,
           is_inferred = EXCLUDED.is_inferred,
           evidence = EXCLUDED.evidence,
           provenance = EXCLUDED.provenance,
           properties = EXCLUDED.properties,
           updated_at = NOW()
         RETURNING id`,
        [
          sourceId,
          targetId,
          edge.relationType,
          edge.weight ?? 1.0,
          edge.confidence ?? 1.0,
          Boolean(edge.isInferred),
          edge.evidence || null,
          JSON.stringify(edge.provenance || {}),
          JSON.stringify(edge.properties || {}),
        ],
      );
      if (res.rows[0]) {
        upsertedEdgeIds.push(res.rows[0].id);
      }
    }

    if (pruneStale) {
      if (upsertedEdgeIds.length > 0) {
        await client.query(
          `DELETE FROM knowledge_graph_edges
           WHERE provenance->>'model' = 'civicpulse-kg-builder'
             AND NOT (id = ANY($1::uuid[]))`,
          [upsertedEdgeIds],
        );
      } else {
        await client.query(
          `DELETE FROM knowledge_graph_edges
           WHERE provenance->>'model' = 'civicpulse-kg-builder'`,
        );
      }

      if (upsertedNodeIds.length > 0) {
        await client.query(
          `DELETE FROM knowledge_graph_nodes
           WHERE provenance->>'model' = 'civicpulse-kg-builder'
             AND NOT (id = ANY($1::uuid[]))`,
          [upsertedNodeIds],
        );
      }
    }

    await client.query("COMMIT");

    return {
      nodesSynced: upsertedNodeIds.length,
      edgesSynced: upsertedEdgeIds.length,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function countNodes() {
  const res = await pool.query("SELECT COUNT(*)::int AS cnt FROM knowledge_graph_nodes");
  return res.rows[0]?.cnt || 0;
}

async function listNodes({
  city = null,
  entityType = null,
  q = null,
  limit = 120,
} = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (city && city !== "all") {
    conditions.push(
      `(LOWER(COALESCE(city, '')) = LOWER($${idx}) OR entity_type IN ('DEPARTMENT', 'CATEGORY', 'OFFICER'))`,
    );
    params.push(city);
    idx += 1;
  }

  if (entityType && entityType !== "all") {
    conditions.push(`entity_type = $${idx}`);
    params.push(entityType);
    idx += 1;
  }

  if (q && q.trim()) {
    conditions.push(
      `(label ILIKE $${idx} OR node_key ILIKE $${idx} OR COALESCE(ward, '') ILIKE $${idx} OR properties::text ILIKE $${idx})`,
    );
    params.push(`%${q.trim()}%`);
    idx += 1;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(Math.min(Math.max(Number(limit) || 120, 1), 400));

  const res = await pool.query(
    `SELECT *
     FROM knowledge_graph_nodes
     ${whereClause}
     ORDER BY
       CASE entity_type
         WHEN 'INFRASTRUCTURE_ASSET' THEN 0
         WHEN 'HOTSPOT' THEN 1
         WHEN 'COMPLAINT' THEN 2
         WHEN 'MAINTENANCE_EVENT' THEN 3
         WHEN 'DEPARTMENT' THEN 4
         WHEN 'WARD' THEN 5
         ELSE 6
       END ASC,
       updated_at DESC
     LIMIT $${idx}`,
    params,
  );
  return res.rows;
}

async function findNodeByIdentifier(identifier, { entityType = null } = {}) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;

  const normalizedAssetKey = raw.toLowerCase().startsWith("asset:")
    ? raw
    : `asset:${raw}`;
  const normalizedComplaintKey = raw.toLowerCase().startsWith("complaint:")
    ? raw
    : `complaint:${raw}`;

  const params = [raw, normalizedAssetKey, normalizedComplaintKey];
  const entityFilter = entityType ? `AND entity_type = $4` : "";
  if (entityType) {
    params.push(entityType);
  }

  const res = await pool.query(
    `SELECT *
     FROM knowledge_graph_nodes
     WHERE (
       node_key = $1
       OR external_id = $1
       OR id::text = $1
       OR LOWER(node_key) = LOWER($1)
       OR LOWER(node_key) = LOWER($2)
       OR LOWER(node_key) = LOWER($3)
       OR LOWER(COALESCE(properties->>'assetCode', '')) = LOWER($1)
       OR LOWER(COALESCE(properties->>'referenceId', '')) = LOWER($1)
     )
     ${entityFilter}
     ORDER BY
       CASE
         WHEN node_key = $1 THEN 0
         WHEN LOWER(node_key) IN (LOWER($1), LOWER($2), LOWER($3)) THEN 1
         WHEN entity_type = 'INFRASTRUCTURE_ASSET' THEN 2
         WHEN entity_type = 'COMPLAINT' THEN 3
         WHEN entity_type = 'HOTSPOT' THEN 4
         WHEN entity_type = 'MAINTENANCE_EVENT' THEN 8
         ELSE 6
       END ASC,
       updated_at DESC
     LIMIT 1`,
    params,
  );
  return res.rows[0] || null;
}

async function findNodesByIds(nodeIds) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return [];
  const res = await pool.query(
    `SELECT * FROM knowledge_graph_nodes WHERE id = ANY($1::uuid[])`,
    [nodeIds],
  );
  return res.rows;
}

async function findConnectedEdges(nodeIds, { includeInferred = true } = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return [];
  const inferredFilter = includeInferred ? "" : "AND is_inferred = FALSE";
  const res = await pool.query(
    `SELECT *
     FROM knowledge_graph_edges
     WHERE (source_node_id = ANY($1::uuid[]) OR target_node_id = ANY($1::uuid[]))
       ${inferredFilter}
     ORDER BY is_inferred ASC, confidence DESC, updated_at DESC`,
    [nodeIds],
  );
  return res.rows;
}

async function findEdgesBetweenNodes(nodeIds, { includeInferred = true } = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return [];
  const inferredFilter = includeInferred ? "" : "AND is_inferred = FALSE";
  const res = await pool.query(
    `SELECT *
     FROM knowledge_graph_edges
     WHERE source_node_id = ANY($1::uuid[])
       AND target_node_id = ANY($1::uuid[])
       ${inferredFilter}
     ORDER BY is_inferred ASC, confidence DESC`,
    [nodeIds],
  );
  return res.rows;
}

async function loadAllNodesAndEdges({ city = null, includeInferred = true } = {}) {
  const params = [];
  let nodeWhere = "";
  if (city && city !== "all") {
    params.push(city);
    nodeWhere = `WHERE (LOWER(COALESCE(city, '')) = LOWER($1) OR entity_type IN ('DEPARTMENT', 'CATEGORY', 'OFFICER'))`;
  }

  const nodesRes = await pool.query(
    `SELECT * FROM knowledge_graph_nodes ${nodeWhere}`,
    params,
  );
  const nodeIds = nodesRes.rows.map((n) => n.id);
  const edges =
    nodeIds.length > 0
      ? await findEdgesBetweenNodes(nodeIds, { includeInferred })
      : [];

  let filteredNodes = nodesRes.rows;
  if (city && city !== "all") {
    const connectedIds = new Set();
    for (const e of edges) {
      connectedIds.add(e.source_node_id);
      connectedIds.add(e.target_node_id);
    }
    const cityLower = city.toLowerCase();
    filteredNodes = nodesRes.rows.filter(
      (n) =>
        (n.city && n.city.toLowerCase() === cityLower) ||
        connectedIds.has(n.id),
    );
  }

  return {
    nodes: filteredNodes,
    edges,
  };
}

module.exports = {
  fetchGraphSourceData,
  persistKnowledgeGraphSnapshot,
  countNodes,
  listNodes,
  findNodeByIdentifier,
  findNodesByIds,
  findConnectedEdges,
  findEdgesBetweenNodes,
  loadAllNodesAndEdges,
};
