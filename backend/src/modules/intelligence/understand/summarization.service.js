const aiConfig = require("../../../config/ai");
const { Type } = aiConfig;
const { cleanRawText } = require("./text-normalization.service");
const {
  normalizeCategory,
  normalizePriority,
  getDepartmentForCategory,
} = require("./classification.service");

const RECOMMENDED_ACTION_BY_CATEGORY = {
  ROAD: "Inspect road surface condition, barricade hazard if needed, and schedule patchwork.",
  WATER_SUPPLY: "Inspect supply line pressure/valves and isolate active leakage before road work.",
  ELECTRICITY: "Dispatch electrical maintenance crew to test circuit safety and restore lighting.",
  SANITATION: "Assign waste collection vehicle for clearance and sanitize surrounding area.",
  PUBLIC_SAFETY: "Conduct urgent site safety assessment and coordinate hazard mitigation.",
  OTHER: "Review reported details and route to the appropriate municipal field desk.",
};

function cleanText(value) {
  return cleanRawText(value);
}

function splitSentences(text) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function truncateText(text, maxLength = 240) {
  if (text.length <= maxLength) return text;
  const trimmed = text.slice(0, maxLength - 1).trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  const cut = lastSpace > 40 ? trimmed.slice(0, lastSpace) : trimmed;
  return `${cut}…`;
}

function summarizeWithRules({
  title = "",
  description = "",
  category = "OTHER",
  priority = "MEDIUM",
  address = "",
  evidenceCount = 0,
}) {
  const startedAt = Date.now();
  const cleanTitle = cleanText(title);
  const cleanDesc = cleanText(description);
  const cleanAddress = cleanText(address);
  const canonicalCategory = normalizeCategory(category);
  const normalizedPriority = normalizePriority(priority);
  const department = getDepartmentForCategory(canonicalCategory);

  const sentences = splitSentences(cleanDesc);
  const primaryDetail = sentences[0] || cleanDesc || cleanTitle;
  const secondaryDetail = sentences[1] || "";

  let rawSummary = "";
  if (cleanTitle && !primaryDetail.toLowerCase().startsWith(cleanTitle.toLowerCase())) {
    rawSummary = `${cleanTitle}: ${primaryDetail}`;
  } else {
    rawSummary = primaryDetail || cleanTitle;
  }

  if (secondaryDetail && rawSummary.length + secondaryDetail.length + 1 <= 220) {
    rawSummary = `${rawSummary} ${secondaryDetail}`;
  }

  if (cleanAddress && !rawSummary.toLowerCase().includes(cleanAddress.toLowerCase())) {
    rawSummary = `${rawSummary.replace(/\.$/, "")} (Location: ${cleanAddress}).`;
  }

  const summary = truncateText(rawSummary, 260);

  const keyPoints = [];
  if (cleanAddress) {
    keyPoints.push(`Location: ${cleanAddress}`);
  }
  keyPoints.push(`Routed to: ${department} (${normalizedPriority} priority)`);
  if (evidenceCount > 0) {
    keyPoints.push(`Evidence attached: ${evidenceCount} file${evidenceCount === 1 ? "" : "s"}`);
  }
  if (sentences.length > 0) {
    keyPoints.push(`Reported detail: ${truncateText(sentences[0], 110)}`);
  }

  return {
    summary,
    keyPoints: keyPoints.slice(0, 4),
    recommendedAction:
      RECOMMENDED_ACTION_BY_CATEGORY[canonicalCategory] ||
      RECOMMENDED_ACTION_BY_CATEGORY.OTHER,
    provenance: {
      source: "extractive-fallback",
      modelName: "civicpulse-extractive-summarizer",
      modelVersion: "v1.0",
      durationMs: Math.max(1, Date.now() - startedAt),
      timestamp: new Date().toISOString(),
    },
  };
}

const SUMMARY_JSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description:
        "Concise 1-2 sentence operational brief for a municipal officer summarizing the exact problem, location, and severity without adding unverified claims.",
    },
    keyPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2 to 4 short factual bullet points drawn directly from the report.",
    },
    recommendedAction: {
      type: Type.STRING,
      description: "One concise next inspection or verification step for the field officer.",
    },
  },
  required: ["summary", "keyPoints", "recommendedAction"],
  propertyOrdering: ["summary", "keyPoints", "recommendedAction"],
};

async function summarizeWithGemini({
  title = "",
  description = "",
  category = "OTHER",
  priority = "MEDIUM",
  address = "",
  evidenceCount = 0,
}) {
  const startedAt = Date.now();
  const prompt = [
    "Summarize the following civic complaint for a municipal officer.",
    "Strictly rely only on facts present in the input. Do not invent asset IDs, numbers, or causes.",
    "",
    `Title: ${title}`,
    `Description: ${description}`,
    `Category: ${normalizeCategory(category)}`,
    `Priority: ${normalizePriority(priority)}`,
    address ? `Address: ${address}` : null,
    `Attached evidence count: ${evidenceCount}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await aiConfig.generateStructuredJson({
    prompt,
    systemInstruction:
      "You are CivicPulse's complaint summarization assistant. Produce concise, factual municipal triage summaries.",
    responseJsonSchema: SUMMARY_JSON_SCHEMA,
    temperature: 0.2,
  });

  if (!response?.data) {
    return null;
  }

  const raw = response.data;
  const fallback = summarizeWithRules({
    title,
    description,
    category,
    priority,
    address,
    evidenceCount,
  });

  return {
    summary:
      typeof raw.summary === "string" && raw.summary.trim()
        ? truncateText(raw.summary.trim(), 400)
        : fallback.summary,
    keyPoints: Array.isArray(raw.keyPoints) && raw.keyPoints.length > 0
      ? raw.keyPoints.map((item) => cleanText(item)).filter(Boolean).slice(0, 4)
      : fallback.keyPoints,
    recommendedAction:
      typeof raw.recommendedAction === "string" && raw.recommendedAction.trim()
        ? cleanText(raw.recommendedAction)
        : fallback.recommendedAction,
    provenance: {
      source: "gemini",
      modelName: response.model,
      modelVersion: "current",
      durationMs: Math.max(1, Date.now() - startedAt),
      timestamp: new Date().toISOString(),
    },
  };
}

async function summarizeComplaint(input, { preferGemini = true, strictGemini = false } = {}) {
  const { title = "", description = "" } = input || {};
  if (!cleanText(title) && !cleanText(description)) {
    throw new Error("Complaint title or description is required for summarization");
  }

  if (preferGemini && aiConfig.hasGeminiApiKey()) {
    try {
      const aiResult = await summarizeWithGemini(input);
      if (aiResult) {
        return aiResult;
      }
    } catch (err) {
      if (strictGemini) {
        throw err;
      }
      console.warn("Gemini summarization failed, falling back to extractive summarizer:", err.message);
    }
  }

  return summarizeWithRules(input);
}

function summarizeComplaintGroup(complaints = []) {
  if (!Array.isArray(complaints) || complaints.length === 0) {
    return {
      count: 0,
      summary: "No complaints in group.",
      categoryCounts: {},
    };
  }

  const categoryCounts = {};
  for (const c of complaints) {
    const cat = normalizeCategory(c.category);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  const breakdown = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `${count} ${cat.toLowerCase().replace(/_/g, " ")}`)
    .join(", ");

  return {
    count: complaints.length,
    categoryCounts,
    summary: `${complaints.length} complaints grouped (${breakdown}).`,
  };
}

module.exports = {
  summarizeWithRules,
  summarizeWithGemini,
  summarizeComplaint,
  summarizeComplaintGroup,
};
