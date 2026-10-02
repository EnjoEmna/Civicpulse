const pool = require("../config/database");

async function createUpvote({ complaintId, userId }) {
  const result = await pool.query(
    `INSERT INTO complaint_upvotes (
       complaint_id,
       user_id
     )
     VALUES ($1, $2)
     ON CONFLICT (complaint_id, user_id)
     DO NOTHING
     RETURNING
       id,
       complaint_id,
       user_id,
       created_at`,
    [complaintId, userId],
  );

  return result.rows[0] || null;
}

async function countUpvotes(complaintId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM complaint_upvotes
     WHERE complaint_id = $1`,
    [complaintId],
  );

  return result.rows[0].count;
}

module.exports = {
  createUpvote,
  countUpvotes,
};