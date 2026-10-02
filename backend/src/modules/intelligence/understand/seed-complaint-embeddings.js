require("dotenv").config();

const pool = require("../../../config/database");
const GeminiEmbeddingProvider = require("./gemini.embedding");
const {
  saveEmbedding,
} = require("../../../repositories/complaint-embedding.repository");

const embeddingProvider = new GeminiEmbeddingProvider();

async function main() {
  const result = await pool.query(`
    SELECT
      id,
      description
    FROM complaints
    WHERE id NOT IN (
      SELECT complaint_id
      FROM complaint_embeddings
    )
    ORDER BY created_at
  `);

  console.log(`Complaints needing embeddings: ${result.rows.length}`);

  for (const complaint of result.rows) {
    console.log(`Generating embedding for: ${complaint.id}`);

    const embedding = await embeddingProvider.generateEmbedding(
      complaint.description
    );

    await saveEmbedding({
      complaintId: complaint.id,
      embedding,
      modelName: "gemini-embedding-2",
      modelVersion: "current",
    });

    console.log(`Saved embedding for: ${complaint.id}`);
  }

  console.log("Embedding seeding completed.");

  await pool.end();
}

main().catch(async (error) => {
  console.error("Embedding seeding failed:", error);

  await pool.end();

  process.exit(1);
});