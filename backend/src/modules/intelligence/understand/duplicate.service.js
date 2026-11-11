const embeddingJob = require("../../../jobs/embedding.job");
const {
  supportsAnyEmbeddingsTable,
  findSimilarComplaints,
} = require("../../../repositories/complaint-embedding.repository");
const {
  normalizeCategory,
} = require("./classification.service");
const { evaluateDuplicate } = require("./duplicate.policy");

async function findDuplicateCandidates({
  title = "",
  description,
  category,
  latitude,
  longitude,
  limit = 20,
  timeWindowDays = 90,
}) {
  const hasTable = await supportsAnyEmbeddingsTable();
  if (!hasTable) {
    return [];
  }

  // Ensure any unindexed complaints are vectorized before comparison
  await embeddingJob.backfillMissingEmbeddings(30).catch(() => {});

  const combinedText = [title, description].filter(Boolean).join("\n");

  let vectorResult;
  try {
    vectorResult = await embeddingJob.generateComplaintVector(combinedText);
  } catch (err) {
    console.warn("Duplicate check embedding generation failed:", err.message);
    return [];
  }

  const candidates = await findSimilarComplaints(vectorResult.embedding, limit, {
    timeWindowDays,
  });

  const normalizedIncomingCategory = category
    ? normalizeCategory(category)
    : null;
  const nowMs = Date.now();

  return candidates
    .map((candidate) => {
      const distanceMeters = calculateDistanceMeters(
        latitude,
        longitude,
        candidate.latitude,
        candidate.longitude,
      );

      const candidateCreatedMs = candidate.created_at
        ? new Date(candidate.created_at).getTime()
        : null;
      const daysApart =
        candidateCreatedMs && Number.isFinite(candidateCreatedMs)
          ? Math.max(0, Number(((nowMs - candidateCreatedMs) / 86400000).toFixed(1)))
          : null;

      const normalizedCandidateCategory = candidate.category
        ? normalizeCategory(candidate.category)
        : null;
      const categoryMatch =
        normalizedIncomingCategory != null &&
        normalizedCandidateCategory != null &&
        normalizedIncomingCategory === normalizedCandidateCategory;

      const decision = evaluateDuplicate({
        similarity: Number(candidate.similarity),
        distanceMeters,
        daysApart,
        categoryMatch,
        timeWindowDays,
      });

      const matchSignals = [];
      if (decision.semanticMatch) matchSignals.push("semantic similarity");
      if (decision.spatialMatch) matchSignals.push("nearby location");
      if (categoryMatch) matchSignals.push("same category");
      if (decision.temporalMatch && daysApart != null && daysApart <= 30) {
        matchSignals.push("recent timeframe");
      }

      return {
        complaintId: candidate.complaint_id,
        referenceId: candidate.reference_id || null,
        title: candidate.title || null,
        description: candidate.description,
        category: candidate.category,
        canonicalCategory: normalizedCandidateCategory,
        status: candidate.status,
        priority: candidate.priority,
        ward: candidate.ward || null,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        createdAt: candidate.created_at,
        similarity: Number(candidate.similarity),
        upvoteCount: candidate.upvote_count,
        categoryMatch,
        distanceMeters,
        daysApart,
        matchReasons: matchSignals,
        embeddingSource: vectorResult.source,
        ...decision,
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

function calculateDistanceMeters(
  latitude1,
  longitude1,
  latitude2,
  longitude2,
) {
  if (
    latitude1 == null ||
    longitude1 == null ||
    latitude2 == null ||
    longitude2 == null
  ) {
    return null;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const R = 6371000;

  const lat1 = toRadians(latitude1);
  const lat2 = toRadians(latitude2);
  const deltaLat = toRadians(latitude2 - latitude1);
  const deltaLon = toRadians(longitude2 - longitude1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

module.exports = {
  findDuplicateCandidates,
  calculateDistanceMeters,
};
