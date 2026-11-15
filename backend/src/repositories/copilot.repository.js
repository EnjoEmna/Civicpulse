const pool = require("../config/database");

async function createSession({
  officerId,
  title = "Copilot Investigation",
  city = null,
  targetType = null,
  targetId = null,
}) {
  const res = await pool.query(
    `INSERT INTO copilot_sessions (
       officer_id, title, city, target_type, target_id
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      officerId,
      String(title || "Copilot Investigation").slice(0, 200),
      city || null,
      targetType || null,
      targetId || null,
    ],
  );
  return res.rows[0];
}

async function findSessionById(id) {
  const res = await pool.query(
    `SELECT s.*,
            u.name AS officer_name,
            u.email AS officer_email
     FROM copilot_sessions s
     LEFT JOIN users u ON u.id = s.officer_id
     WHERE s.id = $1
     LIMIT 1`,
    [id],
  );
  return res.rows[0] || null;
}

async function listSessionsByOfficer({ officerId = null, city = null, limit = 20 } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (officerId) {
    conditions.push(`s.officer_id = $${idx}`);
    params.push(officerId);
    idx += 1;
  }
  if (city && city !== "all") {
    conditions.push(`LOWER(COALESCE(s.city, '')) = LOWER($${idx})`);
    params.push(city);
    idx += 1;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(Math.min(Math.max(Number(limit) || 20, 1), 100));

  const res = await pool.query(
    `SELECT s.*,
            u.name AS officer_name,
            u.email AS officer_email,
            (
              SELECT COUNT(*)::int
              FROM copilot_messages m
              WHERE m.session_id = s.id
            ) AS message_count,
            (
              SELECT m.content
              FROM copilot_messages m
              WHERE m.session_id = s.id
              ORDER BY m.created_at DESC
              LIMIT 1
            ) AS last_message_preview
     FROM copilot_sessions s
     LEFT JOIN users u ON u.id = s.officer_id
     ${whereClause}
     ORDER BY s.last_message_at DESC, s.created_at DESC
     LIMIT $${idx}`,
    params,
  );
  return res.rows;
}

async function updateSessionMeta(id, { title = null, city = null, targetType = null, targetId = null } = {}) {
  const res = await pool.query(
    `UPDATE copilot_sessions
     SET title = COALESCE($2, title),
         city = COALESCE($3, city),
         target_type = COALESCE($4, target_type),
         target_id = COALESCE($5, target_id),
         last_message_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, title, city, targetType, targetId],
  );
  return res.rows[0] || null;
}

async function createMessage({
  sessionId,
  role,
  content,
  agentRunId = null,
  structuredPayload = {},
  latencyMs = 0,
}) {
  const res = await pool.query(
    `INSERT INTO copilot_messages (
       session_id, role, content, agent_run_id, structured_payload, latency_ms
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING *`,
    [
      sessionId,
      role,
      content,
      agentRunId || null,
      JSON.stringify(structuredPayload || {}),
      Math.max(0, Math.round(Number(latencyMs || 0))),
    ],
  );
  return res.rows[0];
}

async function listMessagesBySession(sessionId) {
  const res = await pool.query(
    `SELECT *
     FROM copilot_messages
     WHERE session_id = $1
     ORDER BY created_at ASC, id ASC`,
    [sessionId],
  );
  return res.rows;
}

async function getCopilotUsageStats({ city = null } = {}) {
  const cityCondition =
    city && city !== "all" ? `AND LOWER(COALESCE(s.city, '')) = LOWER($1)` : "";
  const params = city && city !== "all" ? [city] : [];

  const [sessionRes, msgRes] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_sessions,
         COUNT(*) FILTER (WHERE s.last_message_at >= NOW() - INTERVAL '24 hours')::int AS active_sessions_24h
       FROM copilot_sessions s
       WHERE 1=1 ${cityCondition}`,
      params,
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total_messages,
         COUNT(*) FILTER (WHERE m.role = 'USER')::int AS user_queries_count,
         COUNT(*) FILTER (WHERE m.role = 'COPILOT')::int AS copilot_replies_count,
         ROUND(AVG(m.latency_ms) FILTER (WHERE m.role = 'COPILOT')::numeric, 1)::double precision AS avg_copilot_latency_ms
       FROM copilot_messages m
       JOIN copilot_sessions s ON s.id = m.session_id
       WHERE 1=1 ${cityCondition}`,
      params,
    ),
  ]);

  return {
    sessions: sessionRes.rows[0] || {},
    messages: msgRes.rows[0] || {},
  };
}

module.exports = {
  createSession,
  findSessionById,
  listSessionsByOfficer,
  updateSessionMeta,
  createMessage,
  listMessagesBySession,
  getCopilotUsageStats,
};
