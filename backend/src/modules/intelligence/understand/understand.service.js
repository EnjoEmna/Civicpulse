const classificationService = require("./classification.service");
const summarizationService = require("./summarization.service");

async function understandComplaint(
  {
    title,
    description,
    address,
    existingCategory,
    evidenceCount = 0,
  },
  options = {},
) {
  const classification = await classificationService.classifyComplaint(
    {
      title,
      description,
      address,
      existingCategory,
    },
    options,
  );

  const summarization = await summarizationService.summarizeComplaint(
    {
      title,
      description,
      address,
      category: classification.category,
      priority: classification.priority,
      evidenceCount,
    },
    options,
  );

  return {
    category: classification.category,
    citizenCategory: classification.citizenCategory,
    department: classification.department,
    priority: classification.priority,
    confidence: classification.confidence,
    tags: classification.tags,
    rationale: classification.rationale,
    summary: summarization.summary,
    keyPoints: summarization.keyPoints,
    recommendedAction: summarization.recommendedAction,
    metadata: {
      department: classification.department,
      rationale: classification.rationale,
      keyPoints: summarization.keyPoints,
      recommendedAction: summarization.recommendedAction,
      classificationProvenance: classification.provenance,
      summarizationProvenance: summarization.provenance,
      languageHint: classification.provenance?.languageHint || "en",
      totalLatencyMs:
        (classification.provenance?.durationMs || 0) +
        (summarization.provenance?.durationMs || 0),
      analyzedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  understandComplaint,
};
