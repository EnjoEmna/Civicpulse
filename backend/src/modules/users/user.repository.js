const pool = require("../../config/database");

async function findUserById(id) {
  const result = await pool.query(
    `SELECT id, name, email, role, created_at
     FROM users
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

async function findUserAuthById(id) {
  const result = await pool.query(
    `SELECT id, name, email, role, password_hash, created_at
     FROM users
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

async function findOfficers() {
  const result = await pool.query(
    `SELECT id, name, email, role, created_at
     FROM users
     WHERE role IN ('OFFICER', 'ADMIN')
     ORDER BY name ASC`,
  );

  return result.rows;
}

async function updateUserPassword(id, passwordHash) {
  const result = await pool.query(
    `UPDATE users
     SET password_hash = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, updated_at`,
    [id, passwordHash],
  );

  return result.rows[0] || null;
}

module.exports = {
  findUserById,
  findUserAuthById,
  findOfficers,
  updateUserPassword,
};
