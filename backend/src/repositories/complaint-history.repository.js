const pool = require("../config/database");

async function recordStatusChange({
  complaintId,
  fromStatus = null,
  toStatus,
  actorId = null,
  actorRole = "SYSTEM",
  note = null,
  db = pool,
}) {
  const result = await db.query(
    `INSERT INTO complaint_history (
       complaint_id,
       from_status,
       to_status,
       actor_id,
       actor_role,
       note
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING
       id,
       complaint_id,
       from_status,
       to_status,
       actor_id,
       actor_role,
       note,
       created_at`,
    [complaintId, fromStatus, toStatus, actorId, actorRole, note],
  );

  return result.rows[0];
}

async function findHistoryByComplaintId(complaintId, db = pool) {
  const result = await db.query(
    `SELECT
       ch.id,
       ch.complaint_id,
       ch.from_status,
       ch.to_status,
       ch.actor_id,
       ch.actor_role,
       ch.note,
       ch.created_at,
       u.name AS actor_name,
       u.email AS actor_email
     FROM complaint_history ch
     LEFT JOIN users u ON u.id = ch.actor_id
     WHERE ch.complaint_id = $1
     ORDER BY ch.created_at ASC, ch.id ASC`,
    [complaintId],
  );

  return result.rows;
}

module.exports = {
  recordStatusChange,
  findHistoryByComplaintId,
};
