function evaluateDuplicate({
  similarity,
  distanceMeters,
}) {
  const similarityThreshold = Number(
    process.env.DUPLICATE_SIMILARITY_THRESHOLD
  );

  const distanceThresholdMeters = Number(
    process.env.DUPLICATE_DISTANCE_THRESHOLD_METERS
  );

  if (
    !Number.isFinite(similarityThreshold) ||
    !Number.isFinite(distanceThresholdMeters)
  ) {
    throw new Error("Invalid duplicate detection thresholds");
  }

  const semanticMatch = similarity >= similarityThreshold;

  const spatialMatch =
    distanceMeters != null &&
    distanceMeters <= distanceThresholdMeters;

  return {
    isDuplicate: semanticMatch && spatialMatch,
    semanticMatch,
    spatialMatch,
    similarityThreshold,
    distanceThresholdMeters,
  };
}

module.exports = {
  evaluateDuplicate,
};