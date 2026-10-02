require("dotenv").config();

const {
  findDuplicateCandidates,
} = require("./duplicate.service");

async function main() {
  const results = await findDuplicateCandidates({
    description: "There is a large pothole near the market road",
    category: "ROAD",
    latitude: 13.0850,
    longitude: 80.2730,
  });

  console.log("\nDuplicate candidates:\n");

  for (const candidate of results) {
    console.log({
      complaintId: candidate.complaintId,
      description: candidate.description,
      category: candidate.category,

      similarity: candidate.similarity,
      categoryMatch: candidate.categoryMatch,
      distanceMeters: candidate.distanceMeters,

      semanticMatch: candidate.semanticMatch,
      spatialMatch: candidate.spatialMatch,
      isDuplicate: candidate.isDuplicate,

      similarityThreshold: candidate.similarityThreshold,
      distanceThresholdMeters: candidate.distanceThresholdMeters,
    });
  }
}

main().catch((error) => {
  console.error("Duplicate test failed:", error);
  process.exit(1);
});