const pool = require("../config/database");

async function findSimilarComplaints(embedding, limit = 20) {
  const result = await pool.query(
    `SELECT
       ce.complaint_id,
       c.description,
       c.category,
       c.status,
       c.priority,
       c.latitude,
       c.longitude,
       c.created_at,

       (
         SELECT COUNT(*)::int
         FROM complaint_upvotes cu
         WHERE cu.complaint_id = c.id
       ) AS upvote_count,

       1 - (ce.embedding <=> $1::vector) AS similarity

     FROM complaint_embeddings ce

     INNER JOIN complaints c
       ON c.id = ce.complaint_id

     ORDER BY ce.embedding <=> $1::vector
     LIMIT $2`,
    [JSON.stringify(embedding), limit],
  );

  return result.rows;
}

async function saveEmbedding({
  complaintId,
  embedding,
  modelName,
  modelVersion,
  db = pool,
}) {
  const result = await db.query(
    `INSERT INTO complaint_embeddings (
       complaint_id,
       embedding,
       model_name,
       model_version
     )
     VALUES ($1, $2::vector, $3, $4)
     RETURNING
       id,
       complaint_id,
       model_name,
       model_version,
       created_at,
       updated_at`,
    [complaintId, JSON.stringify(embedding), modelName, modelVersion || null],
  );

  return result.rows[0];
}

module.exports = {
  findSimilarComplaints,
  saveEmbedding,
};
