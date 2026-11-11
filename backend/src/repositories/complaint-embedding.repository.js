const pool = require("../config/database");
const {
  cosineSimilarity,
} = require("../modules/intelligence/understand/local.embedding");
const {
  CANONICAL_CATEGORY_SQL,
  canonicalCategoryParamSql,
} = require("../modules/intelligence/spatial/spatial.repository");

async function hasPgVectorEmbeddingsTable(db = pool) {
  try {
    const res = await db.query(
      "SELECT to_regclass('public.complaint_embeddings') IS NOT NULL AS exists",
    );
    return Boolean(res.rows[0]?.exists);
  } catch {
    return false;
  }
}

async function hasSemanticEmbeddingsTable(db = pool) {
  try {
    const res = await db.query(
      "SELECT to_regclass('public.complaint_semantic_embeddings') IS NOT NULL AS exists",
    );
    return Boolean(res.rows[0]?.exists);
  } catch {
    return false;
  }
}

async function supportsAnyEmbeddingsTable(db = pool) {
  const [pgVector, semantic] = await Promise.all([
    hasPgVectorEmbeddingsTable(db),
    hasSemanticEmbeddingsTable(db),
  ]);
  return pgVector || semantic;
}

async function findSimilarComplaints(
  embedding,
  limit = 20,
  {
    excludeComplaintId = null,
    timeWindowDays = null,
    city = null,
    category = null,
    status = null,
    db = pool,
  } = {},
) {
  const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const usePgVector =
    Array.isArray(embedding) &&
    embedding.length === 768 &&
    (await hasPgVectorEmbeddingsTable(db));

  if (usePgVector) {
    const values = [JSON.stringify(embedding)];
    const conditions = [];

    if (excludeComplaintId) {
      values.push(excludeComplaintId);
      conditions.push(`c.id <> $${values.length}`);
    }
    if (Number.isFinite(Number(timeWindowDays)) && Number(timeWindowDays) > 0) {
      values.push(Number(timeWindowDays));
      conditions.push(`c.created_at >= NOW() - ($${values.length} * INTERVAL '1 day')`);
    }
    if (city && city.trim() && city.trim().toLowerCase() !== "all") {
      values.push(city.trim());
      conditions.push(`LOWER(COALESCE(c.city, '')) = LOWER($${values.length})`);
    }
    if (category && category.trim() && category.trim().toLowerCase() !== "all") {
      values.push(category.trim().toUpperCase());
      const catParam = `$${values.length}`;
      conditions.push(
        `(${CANONICAL_CATEGORY_SQL}) = (${canonicalCategoryParamSql(catParam)})`,
      );
    }
    if (status && status.trim() && status.trim().toLowerCase() !== "all") {
      values.push(status.trim().toUpperCase());
      conditions.push(`UPPER(TRIM(c.status)) = $${values.length}`);
    }

    values.push(parsedLimit);
    const limitParam = `$${values.length}`;
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await db.query(
      `SELECT
         ce.complaint_id,
         c.reference_id,
         c.title,
         c.description,
         c.category,
         c.department,
         c.status,
         c.priority,
         c.address,
         c.city,
         c.ward,
         c.zone,
         c.latitude,
         c.longitude,
         c.ai_summary,
         c.ai_priority,
         c.ai_confidence,
         c.ai_tags,
         c.created_at,
         ce.model_name,
         (
           SELECT COUNT(*)::int
           FROM complaint_upvotes cu
           WHERE cu.complaint_id = c.id
         ) AS upvote_count,
         1 - (ce.embedding <=> $1::vector) AS similarity
       FROM complaint_embeddings ce
       INNER JOIN complaints c
         ON c.id = ce.complaint_id
       ${whereClause}
       ORDER BY ce.embedding <=> $1::vector
       LIMIT ${limitParam}`,
      values,
    );

    return result.rows;
  }

  const hasSemantic = await hasSemanticEmbeddingsTable(db);
  if (!hasSemantic) {
    return [];
  }

  const values = [];
  const conditions = [];

  if (excludeComplaintId) {
    values.push(excludeComplaintId);
    conditions.push(`c.id <> $${values.length}`);
  }
  if (Number.isFinite(Number(timeWindowDays)) && Number(timeWindowDays) > 0) {
    values.push(Number(timeWindowDays));
    conditions.push(`c.created_at >= NOW() - ($${values.length} * INTERVAL '1 day')`);
  }
  if (city && city.trim() && city.trim().toLowerCase() !== "all") {
    values.push(city.trim());
    conditions.push(`LOWER(COALESCE(c.city, '')) = LOWER($${values.length})`);
  }
  if (category && category.trim() && category.trim().toLowerCase() !== "all") {
    values.push(category.trim().toUpperCase());
    const catParam = `$${values.length}`;
    conditions.push(
      `(${CANONICAL_CATEGORY_SQL}) = (${canonicalCategoryParamSql(catParam)})`,
    );
  }
  if (status && status.trim() && status.trim().toLowerCase() !== "all") {
    values.push(status.trim().toUpperCase());
    conditions.push(`UPPER(TRIM(c.status)) = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.query(
    `SELECT
       cse.complaint_id,
       c.reference_id,
       c.title,
       c.description,
       c.category,
       c.department,
       c.status,
       c.priority,
       c.address,
       c.city,
       c.ward,
       c.zone,
       c.latitude,
       c.longitude,
       c.ai_summary,
       c.ai_priority,
       c.ai_confidence,
       c.ai_tags,
       c.created_at,
       cse.embedding,
       cse.concepts,
       cse.model_name,
       cse.dimensions,
       (
         SELECT COUNT(*)::int
         FROM complaint_upvotes cu
         WHERE cu.complaint_id = c.id
       ) AS upvote_count
     FROM complaint_semantic_embeddings cse
     INNER JOIN complaints c
       ON c.id = cse.complaint_id
     ${whereClause}`,
    values,
  );

  return result.rows
    .map((row) => {
      const storedVector = Array.isArray(row.embedding) ? row.embedding : [];
      const similarity =
        storedVector.length === embedding.length
          ? cosineSimilarity(embedding, storedVector)
          : 0;

      return {
        complaint_id: row.complaint_id,
        reference_id: row.reference_id,
        title: row.title,
        description: row.description,
        category: row.category,
        department: row.department,
        status: row.status,
        priority: row.priority,
        address: row.address,
        city: row.city,
        ward: row.ward,
        zone: row.zone,
        latitude: row.latitude,
        longitude: row.longitude,
        ai_summary: row.ai_summary,
        ai_priority: row.ai_priority,
        ai_confidence: row.ai_confidence,
        ai_tags: row.ai_tags,
        concepts: row.concepts,
        created_at: row.created_at,
        model_name: row.model_name,
        upvote_count: row.upvote_count,
        similarity,
      };
    })
    .filter((item) => item.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, parsedLimit);
}

async function saveEmbedding({
  complaintId,
  embedding,
  modelName,
  modelVersion,
  normalizedText = null,
  concepts = [],
  db = pool,
}) {
  const [pgVectorExists, semanticExists] = await Promise.all([
    hasPgVectorEmbeddingsTable(db),
    hasSemanticEmbeddingsTable(db),
  ]);

  let savedRow = null;

  if (pgVectorExists && Array.isArray(embedding) && embedding.length === 768) {
    const result = await db.query(
      `INSERT INTO complaint_embeddings (
         complaint_id,
         embedding,
         model_name,
         model_version
       )
       VALUES ($1, $2::vector, $3, $4)
       ON CONFLICT (complaint_id)
       DO UPDATE SET
         embedding = EXCLUDED.embedding,
         model_name = EXCLUDED.model_name,
         model_version = EXCLUDED.model_version,
         updated_at = NOW()
       RETURNING
         id,
         complaint_id,
         model_name,
         model_version,
         created_at,
         updated_at`,
      [complaintId, JSON.stringify(embedding), modelName, modelVersion || null],
    );
    savedRow = result.rows[0];
  }

  if (semanticExists) {
    const result = await db.query(
      `INSERT INTO complaint_semantic_embeddings (
         complaint_id,
         embedding,
         dimensions,
         normalized_text,
         concepts,
         model_name,
         model_version
       )
       VALUES ($1, $2::double precision[], $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (complaint_id)
       DO UPDATE SET
         embedding = EXCLUDED.embedding,
         dimensions = EXCLUDED.dimensions,
         normalized_text = EXCLUDED.normalized_text,
         concepts = EXCLUDED.concepts,
         model_name = EXCLUDED.model_name,
         model_version = EXCLUDED.model_version,
         updated_at = NOW()
       RETURNING
         id,
         complaint_id,
         dimensions,
         model_name,
         model_version,
         created_at,
         updated_at`,
      [
        complaintId,
        embedding,
        embedding.length,
        normalizedText,
        JSON.stringify(Array.isArray(concepts) ? concepts : []),
        modelName,
        modelVersion || null,
      ],
    );
    savedRow = result.rows[0];
  }

  if (!savedRow) {
    throw new Error("No embedding storage table is available in database");
  }

  return savedRow;
}

async function getEmbeddingCoverageStats(db = pool) {
  const [totalRes, hasSemantic, hasPgVector] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS total FROM complaints"),
    hasSemanticEmbeddingsTable(db),
    hasPgVectorEmbeddingsTable(db),
  ]);

  const totalComplaints = totalRes.rows[0]?.total || 0;
  let indexedComplaints = 0;

  if (hasSemantic) {
    const res = await db.query(
      "SELECT COUNT(*)::int AS count FROM complaint_semantic_embeddings",
    );
    indexedComplaints = res.rows[0]?.count || 0;
  } else if (hasPgVector) {
    const res = await db.query(
      "SELECT COUNT(*)::int AS count FROM complaint_embeddings",
    );
    indexedComplaints = res.rows[0]?.count || 0;
  }

  const coveragePercent =
    totalComplaints > 0
      ? Number(((indexedComplaints / totalComplaints) * 100).toFixed(1))
      : 100;

  return {
    totalComplaints,
    indexedComplaints,
    coveragePercent,
    backend: hasPgVector
      ? "pgvector+semantic"
      : hasSemantic
        ? "postgresql-semantic-array"
        : "none",
  };
}

module.exports = {
  hasPgVectorEmbeddingsTable,
  hasSemanticEmbeddingsTable,
  supportsAnyEmbeddingsTable,
  findSimilarComplaints,
  saveEmbedding,
  getEmbeddingCoverageStats,
};
