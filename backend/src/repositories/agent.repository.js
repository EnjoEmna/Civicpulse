const pool = require("../config/database");

async function createAgentRun(
  {
    parentRunId = null,
    stepOrder = 0,
    runType = "ORCHESTRATION",
    agentName,
    queryText = null,
    targetType = null,
    targetId = null,
    city = null,
    status = "COMPLETED",
    inputs = {},
    toolsUsed = [],
    toolCallsCount = 0,
    validToolCallsCount = 0,
    outputs = {},
    groundingReport = {},
    unsupportedClaimCount = 0,
    modelName = "deterministic-orchestrator",
    modelVersion = "1.0.0",
    durationMs = 0,
    initiatedBy = null,
    errorMessage = null,
  },
  db = pool,
) {
  const res = await db.query(
    `INSERT INTO agent_runs (
       parent_run_id, step_order, run_type, agent_name,
       query_text, target_type, target_id, city, status,
       inputs, tools_used, tool_calls_count, valid_tool_calls_count,
       outputs, grounding_report, unsupported_claim_count,
       model_name, model_version, duration_ms, initiated_by, error_message
     )
     VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8, $9,
       $10::jsonb, $11::jsonb, $12, $13,
       $14::jsonb, $15::jsonb, $16,
       $17, $18, $19, $20, $21
     )
     RETURNING *`,
    [
      parentRunId,
      stepOrder,
      runType,
      agentName,
      queryText,
      targetType,
      targetId,
      city,
      status,
      JSON.stringify(inputs || {}),
      JSON.stringify(toolsUsed || []),
      Number(toolCallsCount || 0),
      Number(validToolCallsCount || 0),
      JSON.stringify(outputs || {}),
      JSON.stringify(groundingReport || {}),
      Number(unsupportedClaimCount || 0),
      modelName,
      modelVersion,
      Math.max(0, Math.round(Number(durationMs || 0))),
      initiatedBy,
      errorMessage,
    ],
  );
  return res.rows[0];
}

async function createRecommendations(recommendations, db = pool) {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return [];
  }

  const saved = [];
  for (const rec of recommendations) {
    const res = await db.query(
      `INSERT INTO agent_recommendations (
         agent_run_id, target_type, target_id,
         asset_id, complaint_id, hotspot_id,
         city, ward, category, priority,
         action_title, proposed_action, rationale,
         evidence_citations, confidence,
         requires_human_confirmation, is_non_causal_inferred
       )
       VALUES (
         $1, $2, $3,
         $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13,
         $14::jsonb, $15,
         $16, $17
       )
       RETURNING *`,
      [
        rec.agentRunId,
        rec.targetType || "ASSET",
        rec.targetId || null,
        rec.assetId || null,
        rec.complaintId || null,
        rec.hotspotId || null,
        rec.city || null,
        rec.ward || null,
        rec.category || "INFRASTRUCTURE_ACTION",
        rec.priority || "MEDIUM",
        String(rec.actionTitle || "Review civic issue").slice(0, 200),
        rec.proposedAction,
        rec.rationale,
        JSON.stringify(rec.evidenceCitations || []),
        Number(rec.confidence ?? 0.85),
        rec.requiresHumanConfirmation !== undefined
          ? Boolean(rec.requiresHumanConfirmation)
          : true,
        Boolean(rec.isNonCausalInferred),
      ],
    );
    saved.push(res.rows[0]);
  }
  return saved;
}

async function listOrchestrationRuns({
  city = null,
  status = null,
  targetType = null,
  limit = 20,
} = {}) {
  const conditions = ["r.run_type = 'ORCHESTRATION'"];
  const params = [];
  let idx = 1;

  if (city && city !== "all") {
    conditions.push(`LOWER(COALESCE(r.city, '')) = LOWER($${idx})`);
    params.push(city);
    idx += 1;
  }
  if (status && status !== "all") {
    conditions.push(`r.status = $${idx}`);
    params.push(status.toUpperCase());
    idx += 1;
  }
  if (targetType && targetType !== "all") {
    conditions.push(`r.target_type = $${idx}`);
    params.push(targetType.toUpperCase());
    idx += 1;
  }

  params.push(Math.min(Math.max(Number(limit) || 20, 1), 100));

  const res = await pool.query(
    `SELECT r.*,
            u.name AS initiated_by_name,
            u.email AS initiated_by_email,
            (
              SELECT COUNT(*)::int
              FROM agent_runs s
              WHERE s.parent_run_id = r.id
            ) AS step_count,
            (
              SELECT COUNT(*)::int
              FROM agent_recommendations rec
              WHERE rec.agent_run_id = r.id
            ) AS recommendation_count
     FROM agent_runs r
     LEFT JOIN users u ON u.id = r.initiated_by
     WHERE ${conditions.join(" AND ")}
     ORDER BY r.created_at DESC
     LIMIT $${idx}`,
    params,
  );
  return res.rows;
}

async function findOrchestrationRunById(runId) {
  const runRes = await pool.query(
    `SELECT r.*,
            u.name AS initiated_by_name,
            u.email AS initiated_by_email
     FROM agent_runs r
     LEFT JOIN users u ON u.id = r.initiated_by
     WHERE r.id = $1
     LIMIT 1`,
    [runId],
  );
  if (runRes.rowCount === 0) {
    return null;
  }

  const run = runRes.rows[0];
  const [stepsRes, recsRes] = await Promise.all([
    pool.query(
      `SELECT *
       FROM agent_runs
       WHERE parent_run_id = $1
       ORDER BY step_order ASC, created_at ASC`,
      [run.id],
    ),
    pool.query(
      `SELECT rec.*,
              u.name AS decided_by_name,
              u.email AS decided_by_email
       FROM agent_recommendations rec
       LEFT JOIN users u ON u.id = rec.decided_by
       WHERE rec.agent_run_id = $1
       ORDER BY
         CASE rec.priority
           WHEN 'CRITICAL' THEN 0
           WHEN 'HIGH' THEN 1
           WHEN 'MEDIUM' THEN 2
           ELSE 3
         END ASC,
         rec.created_at ASC`,
      [run.id],
    ),
  ]);

  return {
    run,
    steps: stepsRes.rows,
    recommendations: recsRes.rows,
  };
}

async function listRecommendations({
  decisionStatus = null,
  city = null,
  priority = null,
  agentRunId = null,
  limit = 50,
} = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (decisionStatus && decisionStatus !== "all") {
    conditions.push(`rec.decision_status = $${idx}`);
    params.push(decisionStatus.toUpperCase());
    idx += 1;
  }
  if (city && city !== "all") {
    conditions.push(`LOWER(COALESCE(rec.city, '')) = LOWER($${idx})`);
    params.push(city);
    idx += 1;
  }
  if (priority && priority !== "all") {
    conditions.push(`rec.priority = $${idx}`);
    params.push(priority.toUpperCase());
    idx += 1;
  }
  if (agentRunId) {
    conditions.push(`rec.agent_run_id = $${idx}`);
    params.push(agentRunId);
    idx += 1;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 100));

  const res = await pool.query(
    `SELECT rec.*,
            u.name AS decided_by_name,
            u.email AS decided_by_email,
            r.query_text AS source_query_text
     FROM agent_recommendations rec
     LEFT JOIN users u ON u.id = rec.decided_by
     LEFT JOIN agent_runs r ON r.id = rec.agent_run_id
     ${whereClause}
     ORDER BY
       CASE WHEN rec.decision_status = 'PENDING' THEN 0 ELSE 1 END ASC,
       CASE rec.priority
         WHEN 'CRITICAL' THEN 0
         WHEN 'HIGH' THEN 1
         WHEN 'MEDIUM' THEN 2
         ELSE 3
       END ASC,
       rec.created_at DESC
     LIMIT $${idx}`,
    params,
  );
  return res.rows;
}

async function findRecommendationById(id) {
  const res = await pool.query(
    `SELECT rec.*,
            u.name AS decided_by_name,
            u.email AS decided_by_email
     FROM agent_recommendations rec
     LEFT JOIN users u ON u.id = rec.decided_by
     WHERE rec.id = $1
     LIMIT 1`,
    [id],
  );
  return res.rows[0] || null;
}

async function updateRecommendationDecision(
  id,
  { decision, decidedBy = null, modifiedAction = null, decisionNote = null },
) {
  const res = await pool.query(
    `UPDATE agent_recommendations
     SET decision_status = $2,
         decided_by = $3,
         modified_action = $4,
         decision_note = $5,
         decided_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, decision, decidedBy, modifiedAction || null, decisionNote || null],
  );
  return res.rows[0] || null;
}

async function getEvaluationStats({ city = null } = {}) {
  const cityCondition =
    city && city !== "all" ? `AND LOWER(COALESCE(city, '')) = LOWER($1)` : "";
  const params = city && city !== "all" ? [city] : [];

  const [orchRes, stepRes, recRes] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_orchestrations,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_count,
         COUNT(*) FILTER (WHERE status = 'PARTIAL')::int AS partial_count,
         COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
         COALESCE(SUM(tool_calls_count), 0)::int AS total_tool_calls,
         COALESCE(SUM(valid_tool_calls_count), 0)::int AS valid_tool_calls,
         COALESCE(SUM(unsupported_claim_count), 0)::int AS total_unsupported_claims,
         COUNT(*) FILTER (WHERE unsupported_claim_count = 0)::int AS zero_hallucination_runs,
         ROUND(AVG(duration_ms)::numeric, 1)::double precision AS avg_duration_ms,
         COUNT(*) FILTER (
           WHERE model_name IS NOT NULL AND model_version IS NOT NULL
         )::int AS runs_with_provenance
       FROM agent_runs
       WHERE run_type = 'ORCHESTRATION' ${cityCondition}`,
      params,
    ),
    pool.query(
      `SELECT
         agent_name,
         COUNT(*)::int AS total_steps,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_steps,
         COALESCE(SUM(tool_calls_count), 0)::int AS tool_calls,
         COALESCE(SUM(valid_tool_calls_count), 0)::int AS valid_tool_calls,
         COALESCE(SUM(unsupported_claim_count), 0)::int AS unsupported_claims,
         ROUND(AVG(duration_ms)::numeric, 1)::double precision AS avg_duration_ms
       FROM agent_runs
       WHERE run_type = 'AGENT_STEP' ${cityCondition}
       GROUP BY agent_name
       ORDER BY agent_name ASC`,
      params,
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total_recommendations,
         COUNT(*) FILTER (WHERE decision_status = 'PENDING')::int AS pending_count,
         COUNT(*) FILTER (WHERE decision_status = 'ACCEPTED')::int AS accepted_count,
         COUNT(*) FILTER (WHERE decision_status = 'REJECTED')::int AS rejected_count,
         COUNT(*) FILTER (WHERE decision_status = 'MODIFIED')::int AS modified_count,
         COUNT(*) FILTER (WHERE is_non_causal_inferred = TRUE)::int AS non_causal_count,
         ROUND(AVG(confidence)::numeric, 3)::double precision AS avg_confidence
       FROM agent_recommendations
       WHERE 1=1 ${cityCondition}`,
      params,
    ),
  ]);

  return {
    orchestrations: orchRes.rows[0] || {},
    stepsByAgent: stepRes.rows || [],
    recommendations: recRes.rows[0] || {},
  };
}

module.exports = {
  createAgentRun,
  createRecommendations,
  listOrchestrationRuns,
  findOrchestrationRunById,
  listRecommendations,
  findRecommendationById,
  updateRecommendationDecision,
  getEvaluationStats,
};
