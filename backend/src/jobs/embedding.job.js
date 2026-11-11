const pool = require("../config/database");
const aiConfig = require("../config/ai");
const GeminiEmbeddingProvider = require("../modules/intelligence/understand/gemini.embedding");
const LocalSemanticEmbeddingProvider = require("../modules/intelligence/understand/local.embedding");
const {
  normalizeText,
} = require("../modules/intelligence/understand/text-normalization.service");
const {
  hasPgVectorEmbeddingsTable,
  hasSemanticEmbeddingsTable,
  supportsAnyEmbeddingsTable,
  saveEmbedding,
} = require("../repositories/complaint-embedding.repository");

let geminiProvider = null;
let localProvider = null;

function getGeminiProvider() {
  if (!geminiProvider) {
    geminiProvider = new GeminiEmbeddingProvider();
  }
  return geminiProvider;
}

function getLocalProvider() {
  if (!localProvider) {
    localProvider = new LocalSemanticEmbeddingProvider();
  }
  return localProvider;
}

async function supportsEmbeddingsTable(db = pool) {
  return supportsAnyEmbeddingsTable(db);
}

async function generateComplaintVector(text) {
  const hasPgVector = await hasPgVectorEmbeddingsTable();

  if (aiConfig.hasGeminiApiKey() && hasPgVector) {
    try {
      const vector = await getGeminiProvider().generateEmbedding(text);
      return {
        embedding: vector,
        modelName: aiConfig.AI_MODELS.embedding,
        modelVersion: "current",
        source: "gemini",
      };
    } catch (err) {
      console.warn(
        "Gemini embedding failed, using local semantic embedding provider:",
        err.message,
      );
    }
  }

  const provider = getLocalProvider();
  const vector = await provider.generateEmbedding(text);
  return {
    embedding: vector,
    modelName: provider.model,
    modelVersion: provider.modelVersion,
    source: "local-semantic",
  };
}

async function runEmbeddingJob(complaintId, textOverride = null) {
  const hasTable = await supportsEmbeddingsTable();
  if (!hasTable) {
    return {
      status: "SKIPPED",
      reason: "embedding tables unavailable",
    };
  }

  let textToEmbed = textOverride;
  if (!textToEmbed) {
    const res = await pool.query(
      "SELECT title, description, address FROM complaints WHERE id = $1",
      [complaintId],
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error(`Complaint ${complaintId} not found for embedding job`);
    }
    textToEmbed = [row.title, row.description, row.address]
      .filter(Boolean)
      .join("\n");
  }

  const normalized = normalizeText(textToEmbed);
  const { embedding, modelName, modelVersion, source } =
    await generateComplaintVector(textToEmbed);

  await saveEmbedding({
    complaintId,
    embedding,
    modelName,
    modelVersion,
    normalizedText: normalized.normalizedText,
    concepts: normalized.canonicalConcepts,
  });

  return {
    status: "COMPLETED",
    source,
    modelName,
    dimensions: embedding.length,
  };
}

async function backfillMissingEmbeddings(limit = 50) {
  const [hasSemantic, hasPgVector] = await Promise.all([
    hasSemanticEmbeddingsTable(),
    hasPgVectorEmbeddingsTable(),
  ]);

  if (!hasSemantic && !hasPgVector) {
    return {
      processed: 0,
      skipped: true,
      reason: "embedding storage tables unavailable",
    };
  }

  const res = hasSemantic
    ? await pool.query(
        `SELECT c.id, c.title, c.description, c.address
         FROM complaints c
         LEFT JOIN complaint_semantic_embeddings cse ON cse.complaint_id = c.id
         WHERE cse.id IS NULL
         ORDER BY c.created_at ASC
         LIMIT $1`,
        [limit],
      )
    : await pool.query(
        `SELECT c.id, c.title, c.description, c.address
         FROM complaints c
         LEFT JOIN complaint_embeddings ce ON ce.complaint_id = c.id
         WHERE ce.id IS NULL
         ORDER BY c.created_at ASC
         LIMIT $1`,
        [limit],
      );

  let processed = 0;
  const failures = [];

  for (const row of res.rows) {
    try {
      const text = [row.title, row.description, row.address]
        .filter(Boolean)
        .join("\n");
      const out = await runEmbeddingJob(row.id, text);
      if (out.status === "COMPLETED") {
        processed += 1;
      }
    } catch (err) {
      failures.push({ complaintId: row.id, error: err.message });
    }
  }

  return {
    processed,
    failures,
    skipped: false,
  };
}

module.exports = {
  JOB_TYPE: "EMBEDDING_GENERATION",
  supportsEmbeddingsTable,
  generateComplaintVector,
  runEmbeddingJob,
  backfillMissingEmbeddings,
};
