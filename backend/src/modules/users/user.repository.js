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

module.exports = {
  findUserById,
};
