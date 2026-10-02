const pool = require("../../config/database");

async function findUserByEmail(email) {
  const result = await pool.query(
    "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
    [email],
  );

  return result.rows[0] || null;
}

async function createUser({ name, email, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, role, created_at`,
    [name, email, passwordHash],
  );

  return result.rows[0];
}

module.exports = {
  findUserByEmail,
  createUser,
};