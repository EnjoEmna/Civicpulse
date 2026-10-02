const GeminiEmbeddingProvider = require("./gemini.embedding");

const {
  findSimilarComplaints,
} = require("../../../repositories/complaint-embedding.repository");

const { evaluateDuplicate } = require("./duplicate.policy");

const embeddingProvider = new GeminiEmbeddingProvider();

async function findDuplicateCandidates({
  description,
  category,
  latitude,
  longitude,
  limit = 20,
}) {
  const embedding = await embeddingProvider.generateEmbedding(description);

  const candidates = await findSimilarComplaints(embedding, limit);

  return candidates.map((candidate) => {
    const distanceMeters = calculateDistanceMeters(
      latitude,
      longitude,
      candidate.latitude,
      candidate.longitude,
    );

    const decision = evaluateDuplicate({
      similarity: Number(candidate.similarity),
      distanceMeters,
    });

    return {
      complaintId: candidate.complaint_id,
      description: candidate.description,
      category: candidate.category,
      status: candidate.status,
      priority: candidate.priority,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      createdAt: candidate.created_at,

      similarity: Number(candidate.similarity),
      upvoteCount: candidate.upvote_count,

      categoryMatch:
        category != null &&
        candidate.category != null &&
        category.toLowerCase() === candidate.category.toLowerCase(),

      distanceMeters,

      ...decision,
    };
  });
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
};