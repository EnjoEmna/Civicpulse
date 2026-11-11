const pool = require("../config/database");
const {
  getEmbeddingCoverageStats,
} = require("./complaint-embedding.repository");
const { getJobStats } = require("./background-job.repository");

async function hasFeedbackTable(db = pool) {
  try {
    const res = await db.query(
      "SELECT to_regclass('public.ai_feedback_events') IS NOT NULL AS exists",
    );
    return Boolean(res.rows[0]?.exists);
  } catch {
    return false;
  }
}

async function recordFeedback(
  {
    eventType,
    action,
    complaintId = null,
    targetComplaintId = null,
    actorId = null,
    actorRole = null,
    suggestedValue = null,
    finalValue = null,
    metadata = {},
  },
  db = pool,
) {
  const exists = await hasFeedbackTable(db);
  if (!exists) {
    return null;
  }

  const res = await db.query(
    `INSERT INTO ai_feedback_events (
       event_type,
       action,
       complaint_id,
       target_complaint_id,
       actor_id,
       actor_role,
       suggested_value,
       final_value,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [
      eventType,
      action,
      complaintId,
      targetComplaintId,
      actorId,
      actorRole,
      suggestedValue,
      finalValue,
      JSON.stringify(metadata || {}),
    ],
  );

  return res.rows[0];
}

async function getLayer1Metrics(db = pool) {
  const [complaintMetricsRes, embeddingStats, jobStats, feedbackExists] =
    await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS total_complaints,
          COUNT(*) FILTER (WHERE enrichment_status = 'COMPLETED')::int AS enriched_complaints,
          ROUND(AVG(ai_confidence)::numeric, 3)::double precision AS avg_confidence,
          ROUND(
            AVG(
              NULLIF(ai_metadata->>'totalLatencyMs', '')::double precision
            )::numeric,
            2
          )::double precision AS avg_latency_ms,
          COUNT(*) FILTER (
            WHERE ai_category IS NOT NULL
              AND (
                CASE
                  WHEN UPPER(TRIM(COALESCE(category, ''))) IN ('ROAD', 'ROADS', 'INFRASTRUCTURE') THEN 'ROAD'
                  WHEN UPPER(TRIM(COALESCE(category, ''))) IN ('WATER_SUPPLY', 'WATER') THEN 'WATER_SUPPLY'
                  WHEN UPPER(TRIM(COALESCE(category, ''))) IN ('ELECTRICITY', 'STREET_LIGHT', 'STREETLIGHT') THEN 'ELECTRICITY'
                  WHEN UPPER(TRIM(COALESCE(category, ''))) IN ('SANITATION', 'GARBAGE', 'WASTE') THEN 'SANITATION'
                  WHEN UPPER(TRIM(COALESCE(category, ''))) IN ('PUBLIC_SAFETY', 'SAFETY') THEN 'PUBLIC_SAFETY'
                  ELSE 'OTHER'
                END
              ) = ai_category
          )::int AS category_matches
        FROM complaints
      `),
      getEmbeddingCoverageStats(db),
      getJobStats(db),
      hasFeedbackTable(db),
    ]);

  const cm = complaintMetricsRes.rows[0] || {
    total_complaints: 0,
    enriched_complaints: 0,
    avg_confidence: null,
    avg_latency_ms: null,
    category_matches: 0,
  };

  let feedbackSummary = {
    totalEvents: 0,
    accepted: 0,
    modified: 0,
    rejected: 0,
    acceptanceRatePercent: null,
    duplicateSuggestions: {
      total: 0,
      accepted: 0,
      rejected: 0,
    },
  };

  if (feedbackExists) {
    const fbRes = await db.query(`
      SELECT
        COUNT(*)::int AS total_events,
        COUNT(*) FILTER (WHERE action = 'ACCEPTED')::int AS accepted,
        COUNT(*) FILTER (WHERE action = 'MODIFIED')::int AS modified,
        COUNT(*) FILTER (WHERE action = 'REJECTED')::int AS rejected,
        COUNT(*) FILTER (WHERE event_type = 'DUPLICATE_SUGGESTION')::int AS dup_total,
        COUNT(*) FILTER (WHERE event_type = 'DUPLICATE_SUGGESTION' AND action = 'ACCEPTED')::int AS dup_accepted,
        COUNT(*) FILTER (WHERE event_type = 'DUPLICATE_SUGGESTION' AND action = 'REJECTED')::int AS dup_rejected
      FROM ai_feedback_events
    `);
    const fb = fbRes.rows[0];
    const total = fb?.total_events || 0;
    const acceptedOrModified = (fb?.accepted || 0) + (fb?.modified || 0);
    feedbackSummary = {
      totalEvents: total,
      accepted: fb?.accepted || 0,
      modified: fb?.modified || 0,
      rejected: fb?.rejected || 0,
      acceptanceRatePercent:
        total > 0 ? Number(((acceptedOrModified / total) * 100).toFixed(1)) : null,
      duplicateSuggestions: {
        total: fb?.dup_total || 0,
        accepted: fb?.dup_accepted || 0,
        rejected: fb?.dup_rejected || 0,
      },
    };
  }

  const totalComplaints = cm.total_complaints || 0;
  const enrichedComplaints = cm.enriched_complaints || 0;

  return {
    classification: {
      totalComplaints,
      enrichedComplaints,
      enrichmentRatePercent:
        totalComplaints > 0
          ? Number(((enrichedComplaints / totalComplaints) * 100).toFixed(1))
          : 100,
      categoryAgreementPercent:
        enrichedComplaints > 0
          ? Number(((cm.category_matches / enrichedComplaints) * 100).toFixed(1))
          : null,
      avgConfidence: cm.avg_confidence ?? null,
      avgInferenceLatencyMs: cm.avg_latency_ms ?? null,
    },
    embeddings: embeddingStats,
    jobs: jobStats,
    feedback: feedbackSummary,
  };
}

module.exports = {
  recordFeedback,
  getLayer1Metrics,
};
