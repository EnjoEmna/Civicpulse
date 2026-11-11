function resolveThreshold(envValue, fallbackValue) {
  if (envValue === undefined || envValue === null || String(envValue).trim() === "") {
    return fallbackValue;
  }
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed)) {
    throw new Error("Invalid duplicate detection thresholds");
  }
  return parsed;
}

function evaluateDuplicate({
  similarity,
  distanceMeters,
  daysApart = null,
  categoryMatch = false,
  timeWindowDays = 90,
}) {
  const similarityThreshold = resolveThreshold(
    process.env.DUPLICATE_SIMILARITY_THRESHOLD,
    0.85,
  );
  const distanceThresholdMeters = resolveThreshold(
    process.env.DUPLICATE_DISTANCE_THRESHOLD_METERS,
    100,
  );

  if (
    !Number.isFinite(similarityThreshold) ||
    !Number.isFinite(distanceThresholdMeters)
  ) {
    throw new Error("Invalid duplicate detection thresholds");
  }

  const normalizedSimilarity = Math.max(0, Math.min(1, Number(similarity) || 0));
  const spatialMatch =
    distanceMeters != null &&
    Number.isFinite(Number(distanceMeters)) &&
    Number(distanceMeters) <= distanceThresholdMeters;

  const temporalMatch =
    daysApart == null ||
    (Number.isFinite(Number(daysApart)) && Number(daysApart) <= timeWindowDays);

  const minimumSemanticFloor = Math.max(0.62, Number((similarityThreshold - 0.18).toFixed(4)));
  const spatialProximityScore =
    spatialMatch && distanceThresholdMeters > 0
      ? Math.max(0, 1 - Number(distanceMeters) / distanceThresholdMeters)
      : 0;
  const temporalRecencyScore =
    daysApart == null || timeWindowDays <= 0
      ? 0.5
      : Math.max(0, 1 - Math.min(Math.max(0, Number(daysApart)), timeWindowDays) / timeWindowDays);

  const spatialBonus = spatialMatch ? 0.14 * spatialProximityScore : 0;
  const temporalBonus =
    spatialMatch && temporalMatch ? 0.04 * temporalRecencyScore : 0;
  const categoryBonus = spatialMatch && categoryMatch ? 0.05 : 0;

  const combinedScore = Math.min(
    1,
    Number(
      (
        normalizedSimilarity +
        (normalizedSimilarity >= minimumSemanticFloor
          ? spatialBonus + temporalBonus + categoryBonus
          : 0)
      ).toFixed(4),
    ),
  );

  const semanticMatch =
    normalizedSimilarity >= similarityThreshold ||
    (normalizedSimilarity >= minimumSemanticFloor &&
      combinedScore >= similarityThreshold);

  return {
    isDuplicate: semanticMatch && spatialMatch && temporalMatch,
    semanticMatch,
    spatialMatch,
    temporalMatch,
    combinedScore,
    similarityThreshold,
    distanceThresholdMeters,
  };
}

module.exports = {
  evaluateDuplicate,
};
