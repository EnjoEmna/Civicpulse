const pool = require("../../config/database");

async function createComplaint({
  citizenId,
  description,
  category,
  latitude,
  longitude,
  db = pool,
}) {
  const result = await db.query(
    `INSERT INTO complaints (
      citizen_id,
      description,
      category,
      latitude,
      longitude
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING
      id,
      citizen_id,
      description,
      category,
      status,
      priority,
      latitude,
      longitude,
      created_at`,
    [
      citizenId,
      description,
      category || null,
      latitude ?? null,
      longitude ?? null,
    ],
  );

  return result.rows[0];
}

async function findComplaintById(id) {
  const result = await pool.query(
    `SELECT
       id,
       citizen_id,
       description,
       category,
       status,
       priority,
       latitude,
       longitude,
       created_at,
       updated_at
     FROM complaints
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

async function updateComplaintStatus(id, status) {
  const result = await pool.query(
    `UPDATE complaints
      SET status = $1
      WHERE id = $2
     RETURNING
       id,
       citizen_id,
       description,
       category,
       status,
       priority,
       latitude,
       longitude,
       created_at,
       updated_at`,
    [status, id],
  );

  return result.rows[0] || null;
}

async function complaintExists(id) {
  const result = await pool.query(
    `SELECT 1
     FROM complaints
     WHERE id = $1`,
    [id],
  );

  return result.rows.length > 0;
}

module.exports = {
  createComplaint,
  findComplaintById,
  updateComplaintStatus,
  complaintExists,
};
