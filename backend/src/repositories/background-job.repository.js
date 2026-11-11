const pool = require("../config/database");

async function enqueueJob({
  jobType,
  complaintId,
  payload = {},
  maxAttempts = 3,
  db = pool,
}) {
  const result = await db.query(
    `INSERT INTO background_jobs (
       job_type,
       complaint_id,
       status,
       attempts,
       max_attempts,
       payload,
       last_error,
       next_run_at,
       started_at,
       completed_at
     )
     VALUES ($1, $2, 'PENDING', 0, $3, $4::jsonb, NULL, NOW(), NULL, NULL)
     ON CONFLICT (job_type, complaint_id)
     DO UPDATE SET
       status = 'PENDING',
       attempts = 0,
       max_attempts = EXCLUDED.max_attempts,
       payload = EXCLUDED.payload,
       last_error = NULL,
       next_run_at = NOW(),
       started_at = NULL,
       completed_at = NULL,
       updated_at = NOW()
     RETURNING *`,
    [jobType, complaintId, maxAttempts, JSON.stringify(payload || {})],
  );

  return result.rows[0];
}

async function claimJobForProcessing(jobId, db = pool) {
  const result = await db.query(
    `UPDATE background_jobs
     SET status = 'PROCESSING',
         attempts = attempts + 1,
         started_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND status IN ('PENDING', 'RETRY_SCHEDULED')
     RETURNING *`,
    [jobId],
  );

  return result.rows[0] || null;
}

async function claimDueJobs(limit = 10, db = pool) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `WITH due AS (
         SELECT id
         FROM background_jobs
         WHERE status IN ('PENDING', 'RETRY_SCHEDULED')
           AND next_run_at <= NOW()
           AND attempts < max_attempts
         ORDER BY next_run_at ASC, created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE background_jobs bj
       SET status = 'PROCESSING',
           attempts = bj.attempts + 1,
           started_at = NOW(),
           updated_at = NOW()
       FROM due
       WHERE bj.id = due.id
       RETURNING bj.*`,
      [limit],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function markJobCompleted(jobId, resultPayload = {}, db = pool) {
  const result = await db.query(
    `UPDATE background_jobs
     SET status = 'COMPLETED',
         result = $2::jsonb,
         last_error = NULL,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [jobId, JSON.stringify(resultPayload || {})],
  );

  return result.rows[0] || null;
}

async function scheduleJobRetry(jobId, errorMessage, backoffMs = 30000, db = pool) {
  const delaySeconds = Math.max(1, Math.round(backoffMs / 1000));
  const result = await db.query(
    `UPDATE background_jobs
     SET status = CASE
           WHEN attempts >= max_attempts THEN 'FAILED'
           ELSE 'RETRY_SCHEDULED'
         END,
         last_error = $2,
         next_run_at = NOW() + ($3 * INTERVAL '1 second'),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [jobId, String(errorMessage || "Unknown job error").slice(0, 2000), delaySeconds],
  );

  return result.rows[0] || null;
}

async function markJobFailed(jobId, errorMessage, db = pool) {
  const result = await db.query(
    `UPDATE background_jobs
     SET status = 'FAILED',
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [jobId, String(errorMessage || "Unknown job error").slice(0, 2000)],
  );

  return result.rows[0] || null;
}

async function listJobs({ status, jobType, limit = 25 } = {}, db = pool) {
  const conditions = [];
  const values = [];

  if (status) {
    values.push(status.trim().toUpperCase());
    conditions.push(`bj.status = $${values.length}`);
  }
  if (jobType) {
    values.push(jobType.trim().toUpperCase());
    conditions.push(`bj.job_type = $${values.length}`);
  }

  const parsedLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  values.push(parsedLimit);
  const limitParam = `$${values.length}`;

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.query(
    `SELECT
       bj.*,
       c.reference_id,
       c.title AS complaint_title,
       c.enrichment_status
     FROM background_jobs bj
     INNER JOIN complaints c ON c.id = bj.complaint_id
     ${whereClause}
     ORDER BY bj.updated_at DESC
     LIMIT ${limitParam}`,
    values,
  );

  return result.rows;
}

async function getJobStats(db = pool) {
  const result = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
       COUNT(*) FILTER (WHERE status = 'RETRY_SCHEDULED')::int AS retry_scheduled,
       COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
       COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
     FROM background_jobs`,
  );

  return result.rows[0];
}

module.exports = {
  enqueueJob,
  claimJobForProcessing,
  claimDueJobs,
  markJobCompleted,
  scheduleJobRetry,
  markJobFailed,
  listJobs,
  getJobStats,
};
