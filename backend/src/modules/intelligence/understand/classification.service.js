const aiConfig = require("../../../config/ai");
const { Type } = aiConfig;
const { normalizeText } = require("./text-normalization.service");

const CANONICAL_CATEGORIES = [
  "ROAD",
  "WATER_SUPPLY",
  "ELECTRICITY",
  "SANITATION",
  "PUBLIC_SAFETY",
  "OTHER",
];

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const DEPARTMENT_BY_CATEGORY = {
  ROAD: "Roads & Public Works",
  WATER_SUPPLY: "Water Supply & Drainage",
  ELECTRICITY: "Electricity & Street Lighting",
  SANITATION: "Sanitation & Solid Waste",
  PUBLIC_SAFETY: "Public Safety & Enforcement",
  OTHER: "Municipal General Desk",
};

const CITIZEN_KEY_BY_CATEGORY = {
  ROAD: "roads",
  WATER_SUPPLY: "water_supply",
  ELECTRICITY: "electricity",
  SANITATION: "sanitation",
  PUBLIC_SAFETY: "public_safety",
  OTHER: "other",
};

const CATEGORY_KEYWORDS = {
  ROAD: [
    { term: "pothole", weight: 4 },
    { term: "road", weight: 2.5 },
    { term: "asphalt", weight: 3 },
    { term: "pavement", weight: 3 },
    { term: "footpath", weight: 3 },
    { term: "sidewalk", weight: 3 },
    { term: "bridge", weight: 2.5 },
    { term: "manhole", weight: 2.5 },
    { term: "speed breaker", weight: 3 },
    { term: "bump", weight: 1.5 },
    { term: "crack", weight: 2 },
    { term: "culvert", weight: 3 },
    { term: "highway", weight: 2.5 },
    { term: "junction", weight: 1.5 },
    { term: "traffic signal", weight: 2 },
  ],
  WATER_SUPPLY: [
    { term: "water", weight: 2.5 },
    { term: "pipeline", weight: 4 },
    { term: "pipe", weight: 2.5 },
    { term: "leak", weight: 3 },
    { term: "leakage", weight: 3.5 },
    { term: "sewage", weight: 3.5 },
    { term: "drainage", weight: 3 },
    { term: "drain", weight: 2.5 },
    { term: "tap", weight: 2 },
    { term: "contaminated", weight: 3 },
    { term: "drinking water", weight: 4 },
    { term: "borewell", weight: 3 },
    { term: "overflowing drain", weight: 3.5 },
    { term: "waterlogging", weight: 3 },
  ],
  ELECTRICITY: [
    { term: "streetlight", weight: 4 },
    { term: "street light", weight: 4 },
    { term: "electricity", weight: 3.5 },
    { term: "power outage", weight: 4 },
    { term: "blackout", weight: 3.5 },
    { term: "transformer", weight: 4 },
    { term: "electric pole", weight: 4 },
    { term: "voltage", weight: 3 },
    { term: "sparking", weight: 3.5 },
    { term: "flickering", weight: 3 },
    { term: "lamp", weight: 2.5 },
    { term: "bulb", weight: 2 },
    { term: "dark stretch", weight: 2.5 },
    { term: "wire", weight: 2 },
  ],
  SANITATION: [
    { term: "garbage", weight: 4 },
    { term: "trash", weight: 4 },
    { term: "waste", weight: 3 },
    { term: "bin", weight: 3 },
    { term: "dustbin", weight: 3.5 },
    { term: "dump", weight: 3 },
    { term: "litter", weight: 3 },
    { term: "sanitation", weight: 4 },
    { term: "sweeping", weight: 3 },
    { term: "stink", weight: 2.5 },
    { term: "foul smell", weight: 3 },
    { term: "odor", weight: 2.5 },
    { term: "uncollected", weight: 3 },
    { term: "mosquito", weight: 2 },
  ],
  PUBLIC_SAFETY: [
    { term: "accident", weight: 4 },
    { term: "live wire", weight: 5 },
    { term: "exposed wire", weight: 4.5 },
    { term: "electrocution", weight: 5 },
    { term: "collapse", weight: 4 },
    { term: "collapsed", weight: 4 },
    { term: "open manhole", weight: 4.5 },
    { term: "stray", weight: 2.5 },
    { term: "hazard", weight: 2.5 },
    { term: "dangerous", weight: 2.5 },
    { term: "unsafe", weight: 3 },
    { term: "flood", weight: 3 },
    { term: "fire", weight: 4 },
    { term: "crime", weight: 3.5 },
    { term: "emergency", weight: 3.5 },
    { term: "traffic hazard", weight: 3.5 },
  ],
};

const CRITICAL_INDICATORS = [
  "live wire",
  "exposed wire",
  "electrocution",
  "collapse",
  "collapsed",
  "gas leak",
  "fire",
  "injury",
  "injured",
  "accident",
  "open manhole",
  "sewage overflow",
  "contaminated water",
  "hospital",
  "school",
  "emergency",
  "urgent",
  "critical",
  "blocking traffic",
];

const HIGH_INDICATORS = [
  "major",
  "deep",
  "large",
  "severe",
  "flooded",
  "waterlogging",
  "hazard",
  "hazardous",
  "dangerous",
  "unsafe",
  "broken",
  "continuously",
  "leaking",
  "days",
  "weeks",
  "outage",
  "entire stretch",
];

const LOW_INDICATORS = [
  "minor",
  "small",
  "slight",
  "cosmetic",
  "faded paint",
  "trimming",
  "occasionally",
];

function normalizeCategory(rawCategory) {
  if (!rawCategory || typeof rawCategory !== "string") {
    return "OTHER";
  }

  const normalized = rawCategory.trim().toUpperCase().replace(/[\s-]+/g, "_");

  if (normalized === "ROAD" || normalized === "ROADS" || normalized === "INFRASTRUCTURE") {
    return "ROAD";
  }
  if (normalized === "WATER_SUPPLY" || normalized === "WATER") {
    return "WATER_SUPPLY";
  }
  if (
    normalized === "ELECTRICITY" ||
    normalized === "STREET_LIGHT" ||
    normalized === "STREETLIGHT" ||
    normalized === "STREETLIGHTS" ||
    normalized === "LIGHTING"
  ) {
    return "ELECTRICITY";
  }
  if (normalized === "SANITATION" || normalized === "GARBAGE" || normalized === "WASTE") {
    return "SANITATION";
  }
  if (normalized === "PUBLIC_SAFETY" || normalized === "SAFETY") {
    return "PUBLIC_SAFETY";
  }
  if (normalized === "OTHER" || normalized === "GENERAL") {
    return "OTHER";
  }

  return "OTHER";
}

function toCitizenCategory(canonicalCategory) {
  const normalized = normalizeCategory(canonicalCategory);
  return CITIZEN_KEY_BY_CATEGORY[normalized] || "other";
}

function getDepartmentForCategory(category) {
  const normalized = normalizeCategory(category);
  return DEPARTMENT_BY_CATEGORY[normalized] || DEPARTMENT_BY_CATEGORY.OTHER;
}

function normalizePriority(rawPriority) {
  if (!rawPriority || typeof rawPriority !== "string") {
    return "MEDIUM";
  }
  const upper = rawPriority.trim().toUpperCase();
  if (upper === "URGENT") return "CRITICAL";
  return VALID_PRIORITIES.includes(upper) ? upper : "MEDIUM";
}

function scoreKeywordMatches(text, rules) {
  let score = 0;
  const matchedTerms = [];

  for (const rule of rules) {
    if (text.includes(rule.term)) {
      score += rule.weight;
      matchedTerms.push(rule.term);
    }
  }

  return { score, matchedTerms };
}

function inferPriorityWithRules(combinedText) {
  const criticalMatches = CRITICAL_INDICATORS.filter((term) =>
    combinedText.includes(term),
  );
  if (criticalMatches.length > 0) {
    return { priority: "CRITICAL", severityTerms: criticalMatches };
  }

  const highMatches = HIGH_INDICATORS.filter((term) =>
    combinedText.includes(term),
  );
  if (highMatches.length >= 2 || (highMatches.length === 1 && combinedText.length > 80)) {
    return { priority: "HIGH", severityTerms: highMatches };
  }

  const lowMatches = LOW_INDICATORS.filter((term) =>
    combinedText.includes(term),
  );
  if (lowMatches.length > 0 && highMatches.length === 0) {
    return { priority: "LOW", severityTerms: lowMatches };
  }

  return { priority: highMatches.length === 1 ? "HIGH" : "MEDIUM", severityTerms: highMatches };
}

function classifyWithRules({
  title = "",
  description = "",
  address = "",
  existingCategory = null,
}) {
  const startedAt = Date.now();
  const titleNorm = normalizeText(title);
  const descNorm = normalizeText(description);
  const addressNorm = normalizeText(address);

  const titleLower = `${String(title || "").toLowerCase()} ${titleNorm.normalizedText}`.trim();
  const descLower = `${String(description || "").toLowerCase()} ${descNorm.normalizedText}`.trim();
  const addressLower = `${String(address || "").toLowerCase()} ${addressNorm.normalizedText}`.trim();
  const combined = `${titleLower} ${descLower} ${addressLower}`.trim();
  const languageHint =
    titleNorm.hinglishDetected || descNorm.hinglishDetected
      ? "en-hi-mixed"
      : "en";

  let bestCategory = "OTHER";
  let bestScore = 0;
  let secondScore = 0;
  let bestTags = [];

  for (const [category, rules] of Object.entries(CATEGORY_KEYWORDS)) {
    const titleMatch = scoreKeywordMatches(titleLower, rules);
    const bodyMatch = scoreKeywordMatches(descLower, rules);
    // Title hits carry slightly higher signal weight
    const totalScore = titleMatch.score * 1.35 + bodyMatch.score;
    const mergedTags = Array.from(
      new Set([...titleMatch.matchedTerms, ...bodyMatch.matchedTerms]),
    );

    if (totalScore > bestScore) {
      secondScore = bestScore;
      bestScore = totalScore;
      bestCategory = category;
      bestTags = mergedTags;
    } else if (totalScore > secondScore) {
      secondScore = totalScore;
    }
  }

  const fallbackExisting = existingCategory
    ? normalizeCategory(existingCategory)
    : "OTHER";

  if (bestScore === 0 && fallbackExisting !== "OTHER") {
    bestCategory = fallbackExisting;
  }

  const margin = Math.max(0, bestScore - secondScore);
  let confidence;
  if (bestScore === 0) {
    confidence = fallbackExisting !== "OTHER" ? 0.58 : 0.45;
  } else {
    confidence = Math.min(0.95, Number((0.62 + Math.min(0.28, bestScore * 0.03) + Math.min(0.08, margin * 0.02)).toFixed(2)));
  }

  const { priority, severityTerms } = inferPriorityWithRules(combined);
  const department = getDepartmentForCategory(bestCategory);
  const tags = Array.from(new Set([...bestTags, ...severityTerms])).slice(0, 6);

  const rationale =
    bestTags.length > 0
      ? `Detected ${bestCategory.toLowerCase().replace(/_/g, " ")} signals (${bestTags.slice(0, 3).join(", ")}) and rated severity as ${priority}.`
      : `Routed to ${department} based on submitted complaint details with ${priority} priority.`;

  return {
    category: bestCategory,
    citizenCategory: toCitizenCategory(bestCategory),
    department,
    priority,
    confidence,
    tags,
    rationale,
    provenance: {
      source: "rule-based",
      modelName: "civicpulse-keyword-classifier",
      modelVersion: "v1.1",
      languageHint,
      durationMs: Math.max(1, Date.now() - startedAt),
      timestamp: new Date().toISOString(),
    },
  };
}

const CLASSIFICATION_JSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      description: `Canonical complaint category. One of: ${CANONICAL_CATEGORIES.join(", ")}`,
    },
    priority: {
      type: Type.STRING,
      description: `Triage priority level. One of: ${VALID_PRIORITIES.join(", ")}`,
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence score from 0.0 to 1.0",
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Up to 5 short lowercase civic keywords extracted from the complaint",
    },
    rationale: {
      type: Type.STRING,
      description: "One concise sentence explaining category and priority classification grounded in the text.",
    },
  },
  required: ["category", "priority", "confidence", "tags", "rationale"],
  propertyOrdering: ["category", "priority", "confidence", "tags", "rationale"],
};

async function classifyWithGemini({
  title = "",
  description = "",
  address = "",
  existingCategory = null,
}) {
  const startedAt = Date.now();
  const prompt = [
    "Classify the following municipal citizen complaint accurately.",
    `Allowed categories: ${CANONICAL_CATEGORIES.join(", ")}`,
    `Allowed priorities: ${VALID_PRIORITIES.join(", ")}`,
    "",
    `Title: ${title}`,
    `Description: ${description}`,
    address ? `Address: ${address}` : null,
    existingCategory ? `Citizen-selected category hint: ${existingCategory}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await aiConfig.generateStructuredJson({
    prompt,
    systemInstruction:
      "You are CivicPulse's triage classifier. Categorize municipal civic grievances strictly into the provided enum taxonomy without inventing facts.",
    responseJsonSchema: CLASSIFICATION_JSON_SCHEMA,
    temperature: 0.1,
  });

  if (!response?.data) {
    return null;
  }

  const raw = response.data;
  const category = normalizeCategory(raw.category);
  const priority = normalizePriority(raw.priority);
  const rawConfidence = Number(raw.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.max(0, Math.min(1, Number(rawConfidence.toFixed(2))))
    : 0.85;
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return {
    category,
    citizenCategory: toCitizenCategory(category),
    department: getDepartmentForCategory(category),
    priority,
    confidence,
    tags,
    rationale:
      typeof raw.rationale === "string" && raw.rationale.trim()
        ? raw.rationale.trim()
        : `Classified as ${category} (${priority} priority) via Gemini AI.`,
    provenance: {
      source: "gemini",
      modelName: response.model,
      modelVersion: "current",
      durationMs: Math.max(1, Date.now() - startedAt),
      timestamp: new Date().toISOString(),
    },
  };
}

async function classifyComplaint(input, { preferGemini = true, strictGemini = false } = {}) {
  const { title = "", description = "" } = input || {};
  if (!String(title).trim() && !String(description).trim()) {
    throw new Error("Complaint title or description is required for classification");
  }

  if (preferGemini && aiConfig.hasGeminiApiKey()) {
    try {
      const aiResult = await classifyWithGemini(input);
      if (aiResult) {
        return aiResult;
      }
    } catch (err) {
      if (strictGemini) {
        throw err;
      }
      console.warn("Gemini classification failed, falling back to rule classifier:", err.message);
    }
  }

  return classifyWithRules(input);
}

module.exports = {
  CANONICAL_CATEGORIES,
  VALID_PRIORITIES,
  DEPARTMENT_BY_CATEGORY,
  normalizeCategory,
  toCitizenCategory,
  getDepartmentForCategory,
  normalizePriority,
  classifyWithRules,
  classifyWithGemini,
  classifyComplaint,
};
