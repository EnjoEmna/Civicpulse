const embeddingJob = require("../../../jobs/embedding.job");
const complaintRepository = require("../../complaints/complaint.repository");
const complaintEmbeddingRepository = require("../../../repositories/complaint-embedding.repository");
const { normalizeText } = require("./text-normalization.service");
const { normalizeCategory } = require("./classification.service");
const { evaluateDuplicate } = require("./duplicate.policy");
const { calculateDistanceMeters } = require("./duplicate.service");
const hotspotService = require("../spatial/hotspot.service");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeNotFound(message, code) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = code;
  return error;
}

async function semanticSearchComplaints({
  query,
  city = null,
  category = null,
  status = null,
  limit = 20,
} = {}) {
  const trimmedQuery = String(query || "").trim();
  const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const normalizedQueryInfo = normalizeText(trimmedQuery);
  const queryConcepts = new Set(normalizedQueryInfo.canonicalConcepts || []);

  let vectorResult = null;
  let vectorCandidates = [];
  const hasEmbeddings = await complaintEmbeddingRepository
    .supportsAnyEmbeddingsTable()
    .catch(() => false);

  if (hasEmbeddings) {
    await embeddingJob.backfillMissingEmbeddings(30).catch(() => {});
    try {
      vectorResult = await embeddingJob.generateComplaintVector(trimmedQuery);
      vectorCandidates =
        await complaintEmbeddingRepository.findSimilarComplaints(
          vectorResult.embedding,
          Math.max(parsedLimit * 2, 30),
          {
            city: city && city !== "all" ? city : null,
            category: category && category !== "all" ? category : null,
            status: status && status !== "all" ? status : null,
          },
        );
    } catch (err) {
      console.warn("Semantic search embedding failed:", err.message);
    }
  }

  // Exact keyword / reference ID fallback boost so reference IDs & rare words always match
  const keywordCandidates = await complaintRepository
    .findAllComplaints({
      city: city && city !== "all" ? city : undefined,
      category: category && category !== "all" ? category : undefined,
      status: status && status !== "all" ? status : undefined,
      query: trimmedQuery,
      limit: parsedLimit,
    })
    .catch(() => []);

  const merged = new Map();

  for (const row of vectorCandidates) {
    const id = row.complaint_id;
    const rowConcepts = Array.isArray(row.concepts) ? row.concepts : [];
    const matchedConcepts = rowConcepts.filter((c) => queryConcepts.has(c));
    const semanticScore = Number(row.similarity || 0);

    merged.set(id, {
      id,
      referenceId: row.reference_id || null,
      title: row.title,
      description: row.description,
      category: row.category,
      canonicalCategory: row.category ? normalizeCategory(row.category) : null,
      department: row.department || null,
      status: row.status,
      priority: row.priority || row.ai_priority || "MEDIUM",
      address: row.address,
      city: row.city || null,
      ward: row.ward || null,
      zone: row.zone || null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      aiSummary: row.ai_summary || null,
      aiConfidence:
        row.ai_confidence != null ? Number(row.ai_confidence) : null,
      aiTags: Array.isArray(row.ai_tags) ? row.ai_tags : [],
      upvoteCount: Number(row.upvote_count || 0),
      similarity: Number(semanticScore.toFixed(4)),
      keywordBoost: 0,
      relevanceScore: semanticScore,
      matchedConcepts,
      matchType: matchedConcepts.length > 0 ? "concept+semantic" : "semantic",
      createdAt: row.created_at,
    });
  }

  const lowerQuery = trimmedQuery.toLowerCase();
  for (const kw of keywordCandidates) {
    const isExactRef =
      String(kw.reference_id || "").toLowerCase() === lowerQuery;
    const isTitleMatch = String(kw.title || "").toLowerCase().includes(lowerQuery);
    const boost = isExactRef ? 0.99 : isTitleMatch ? 0.65 : 0.45;

    const existing = merged.get(kw.id);
    if (existing) {
      existing.keywordBoost = boost;
      existing.relevanceScore = Number(
        Math.min(1, Math.max(existing.similarity, boost) + (existing.similarity > 0.2 ? 0.08 : 0)).toFixed(4),
      );
      existing.matchType =
        existing.similarity >= 0.25 ? "semantic+keyword" : "keyword";
    } else {
      merged.set(kw.id, {
        id: kw.id,
        referenceId: kw.reference_id || null,
        title: kw.title,
        description: kw.description,
        category: kw.category,
        canonicalCategory: kw.category ? normalizeCategory(kw.category) : null,
        department: kw.department || null,
        status: kw.status,
        priority: kw.priority || kw.ai_priority || "MEDIUM",
        address: kw.address,
        city: kw.city || null,
        ward: kw.ward || null,
        zone: kw.zone || null,
        latitude: kw.latitude != null ? Number(kw.latitude) : null,
        longitude: kw.longitude != null ? Number(kw.longitude) : null,
        aiSummary: kw.ai_summary || null,
        aiConfidence:
          kw.ai_confidence != null ? Number(kw.ai_confidence) : null,
        aiTags: Array.isArray(kw.ai_tags) ? kw.ai_tags : [],
        upvoteCount: 0,
        similarity: 0,
        keywordBoost: boost,
        relevanceScore: boost,
        matchedConcepts: [],
        matchType: "keyword",
        createdAt: kw.created_at,
      });
    }
  }

  const ranked = Array.from(merged.values())
    .filter((item) => item.relevanceScore >= 0.14)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, parsedLimit);

  return {
    query: trimmedQuery,
    normalizedQuery: normalizedQueryInfo.normalizedText,
    expandedTokens: normalizedQueryInfo.expandedTokens,
    detectedConcepts: normalizedQueryInfo.canonicalConcepts,
    languageHint: normalizedQueryInfo.languageHint,
    embeddingSource: vectorResult?.source || "keyword-fallback",
    total: ranked.length,
    results: ranked,
  };
}

async function findRelatedComplaintsForComplaint(complaintId, { limit = 8 } = {}) {
  if (!UUID_REGEX.test(complaintId)) {
    throw safeNotFound("Complaint not found", "COMPLAINT_NOT_FOUND");
  }

  const target = await complaintRepository.findComplaintById(complaintId);
  if (!target) {
    throw safeNotFound("Complaint not found", "COMPLAINT_NOT_FOUND");
  }

  const parsedLimit = Math.min(Math.max(Number(limit) || 8, 1), 25);
  const [hasEmbeddings, hotspots] = await Promise.all([
    complaintEmbeddingRepository.supportsAnyEmbeddingsTable().catch(() => false),
    hotspotService.getHotspotsForComplaint(complaintId).catch(() => []),
  ]);

  let similarComplaints = [];

  if (hasEmbeddings) {
    await embeddingJob.backfillMissingEmbeddings(30).catch(() => {});
    try {
      const combinedText = [target.title, target.description, target.address]
        .filter(Boolean)
        .join("\n");
      const vectorResult = await embeddingJob.generateComplaintVector(combinedText);
      const candidates =
        await complaintEmbeddingRepository.findSimilarComplaints(
          vectorResult.embedding,
          Math.max(parsedLimit * 2, 16),
          { excludeComplaintId: complaintId },
        );

      const targetCategory = target.category
        ? normalizeCategory(target.category)
        : null;
      const targetCreatedMs = target.created_at
        ? new Date(target.created_at).getTime()
        : Date.now();

      similarComplaints = candidates
        .map((candidate) => {
          const distanceMeters = calculateDistanceMeters(
            target.latitude,
            target.longitude,
            candidate.latitude,
            candidate.longitude,
          );
          const candCreatedMs = candidate.created_at
            ? new Date(candidate.created_at).getTime()
            : null;
          const daysApart =
            candCreatedMs && Number.isFinite(candCreatedMs)
              ? Number(
                  (Math.abs(targetCreatedMs - candCreatedMs) / 86400000).toFixed(1),
                )
              : null;

          const candCategory = candidate.category
            ? normalizeCategory(candidate.category)
            : null;
          const categoryMatch =
            targetCategory != null &&
            candCategory != null &&
            targetCategory === candCategory;

          const decision = evaluateDuplicate({
            similarity: Number(candidate.similarity || 0),
            distanceMeters,
            daysApart,
            categoryMatch,
            timeWindowDays: 90,
          });

          const matchReasons = [];
          if (decision.semanticMatch) matchReasons.push("semantic similarity");
          if (decision.spatialMatch) matchReasons.push("same block / nearby");
          if (categoryMatch) matchReasons.push("same category");
          if (decision.temporalMatch && daysApart != null && daysApart <= 30) {
            matchReasons.push("recent timeframe");
          }

          return {
            complaintId: candidate.complaint_id,
            referenceId: candidate.reference_id || null,
            title: candidate.title,
            description: candidate.description,
            aiSummary: candidate.ai_summary || null,
            category: candidate.category,
            canonicalCategory: candCategory,
            status: candidate.status,
            priority: candidate.priority || candidate.ai_priority || "MEDIUM",
            address: candidate.address,
            city: candidate.city || null,
            ward: candidate.ward || null,
            latitude:
              candidate.latitude != null ? Number(candidate.latitude) : null,
            longitude:
              candidate.longitude != null ? Number(candidate.longitude) : null,
            upvoteCount: Number(candidate.upvote_count || 0),
            similarity: Number(Number(candidate.similarity || 0).toFixed(4)),
            distanceMeters:
              distanceMeters != null ? Math.round(distanceMeters) : null,
            daysApart,
            categoryMatch,
            matchReasons,
            ...decision,
            createdAt: candidate.created_at,
          };
        })
        .filter((item) => item.similarity >= 0.2 || item.spatialMatch)
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, parsedLimit);
    } catch (err) {
      console.warn("Related complaints lookup failed:", err.message);
    }
  }

  return {
    complaintId: target.id,
    referenceId: target.reference_id,
    city: target.city || null,
    ward: target.ward || null,
    zone: target.zone || null,
    hotspots,
    similarComplaints,
  };
}

module.exports = {
  semanticSearchComplaints,
  findRelatedComplaintsForComplaint,
};
