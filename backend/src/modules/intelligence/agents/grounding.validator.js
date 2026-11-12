const ASSET_CODE_RE = /\b(?:RD|WP|DR|SL|SN)-[A-Z]{2,5}-\d+\b/gi;
const COMPLAINT_REF_RE = /\bCP-\d{4}-\d{3,}\b/gi;
const SCORE_RE = /\b(\d{1,3}(?:\.\d+)?)\s*\/\s*100\b/g;
const DISTANCE_RE = /\b(\d+(?:\.\d+)?)\s*m\b/gi;
const PCT_RE = /\b(\d{1,3}(?:\.\d+)?)\s*%/g;

const NON_CAUSAL_LABEL = "Potential Relationship (Non-Causal)";
const STRONG_CAUSAL_PHRASES = [
  /\bdefinitely\s+caused\s+by\b/gi,
  /\bproves?\s+causation\b/gi,
  /\bproven\s+to\s+cause\b/gi,
  /\bconfirmed\s+root\s+cause\b/gi,
  /\bis\s+100%\s+responsible\b/gi,
];

function createGroundingTrace() {
  return {
    toolCalls: [],
    groundTruth: {
      entities: new Set(),
      numbers: new Set(["0", "1", "2", "3", "4", "5", "100"]),
    },
  };
}

function registerSafeNumbers(trace, values = []) {
  for (const val of values) {
    if (typeof val === "number" && Number.isFinite(val)) {
      trace.groundTruth.numbers.add(String(val));
      trace.groundTruth.numbers.add(String(Math.round(val)));
    } else if (typeof val === "string" && val.trim()) {
      trace.groundTruth.numbers.add(val.trim());
    }
  }
}

function enforceNonCausalFraming(text, { hasInferredLinks = false } = {}) {
  if (!text || typeof text !== "string") {
    return { sanitizedText: "", adjusted: false };
  }
  let sanitized = text;
  let adjusted = false;

  for (const regex of STRONG_CAUSAL_PHRASES) {
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, "has a Potential Relationship (Non-Causal) with");
      adjusted = true;
    }
  }

  if (
    hasInferredLinks &&
    !sanitized.toLowerCase().includes("potential relationship (non-causal)")
  ) {
    sanitized = `${sanitized.trim()} [${NON_CAUSAL_LABEL} — field verification required]`;
    adjusted = true;
  }

  return { sanitizedText: sanitized, adjusted };
}

function validateTextAgainstGroundTruth(texts, groundTruth) {
  const combined = Array.isArray(texts) ? texts.filter(Boolean).join("\n") : String(texts || "");
  const entitiesSeen = groundTruth?.entities || new Set();
  const numbersSeen = groundTruth?.numbers || new Set();

  const unsupportedClaims = [];
  let checkedFactCount = 0;

  // 1. Validate cited infrastructure asset codes
  const assetMatches = combined.match(ASSET_CODE_RE) || [];
  for (const code of assetMatches) {
    checkedFactCount += 1;
    if (!entitiesSeen.has(code.toUpperCase())) {
      unsupportedClaims.push({
        type: "UNVERIFIED_ASSET_CODE",
        claim: code.toUpperCase(),
        reason: `Asset code ${code.toUpperCase()} was not returned by any verified tool call.`,
      });
    }
  }

  // 2. Validate cited complaint reference IDs
  const refMatches = combined.match(COMPLAINT_REF_RE) || [];
  for (const ref of refMatches) {
    checkedFactCount += 1;
    if (!entitiesSeen.has(ref.toUpperCase())) {
      unsupportedClaims.push({
        type: "UNVERIFIED_COMPLAINT_REF",
        claim: ref.toUpperCase(),
        reason: `Complaint reference ${ref.toUpperCase()} was not returned by any verified tool call.`,
      });
    }
  }

  // 3. Validate cited health scores (e.g. "37/100")
  let m;
  SCORE_RE.lastIndex = 0;
  while ((m = SCORE_RE.exec(combined)) !== null) {
    checkedFactCount += 1;
    const scoreStr = String(Math.round(Number(m[1])));
    if (!numbersSeen.has(scoreStr) && !numbersSeen.has(m[1])) {
      unsupportedClaims.push({
        type: "UNVERIFIED_SCORE",
        claim: `${m[1]}/100`,
        reason: `Health score ${m[1]}/100 does not match deterministic Layer 3 tool output.`,
      });
    }
  }

  // 4. Validate cited spatial distances (e.g. "62m")
  DISTANCE_RE.lastIndex = 0;
  while ((m = DISTANCE_RE.exec(combined)) !== null) {
    checkedFactCount += 1;
    const distStr = String(Math.round(Number(m[1])));
    if (!numbersSeen.has(distStr) && !numbersSeen.has(m[1])) {
      unsupportedClaims.push({
        type: "UNVERIFIED_DISTANCE",
        claim: `${m[1]}m`,
        reason: `Distance ${m[1]}m does not match verified spatial/graph tool output.`,
      });
    }
  }

  // 5. Validate cited percentages (e.g. "88%")
  PCT_RE.lastIndex = 0;
  while ((m = PCT_RE.exec(combined)) !== null) {
    checkedFactCount += 1;
    const pctNum = Number(m[1]);
    const confDecimal = (pctNum / 100).toFixed(2);
    const confDecimal1 = (pctNum / 100).toFixed(1);
    if (
      !numbersSeen.has(m[1]) &&
      !numbersSeen.has(String(Math.round(pctNum))) &&
      !numbersSeen.has(confDecimal) &&
      !numbersSeen.has(confDecimal1)
    ) {
      unsupportedClaims.push({
        type: "UNVERIFIED_PERCENTAGE",
        claim: `${m[1]}%`,
        reason: `Percentage ${m[1]}% was not observed in validated tool output.`,
      });
    }
  }

  const unsupportedClaimCount = unsupportedClaims.length;
  const groundedFactCount = Math.max(0, checkedFactCount - unsupportedClaimCount);
  const groundingScore =
    checkedFactCount > 0
      ? Number((groundedFactCount / checkedFactCount).toFixed(3))
      : 1.0;

  return {
    passed: unsupportedClaimCount === 0,
    checkedFactCount,
    groundedFactCount,
    unsupportedClaimCount,
    groundingScore,
    unsupportedClaims,
  };
}

function auditRecommendations({ recommendations, hasInferredLinks, groundTruth }) {
  const audited = [];
  const citationIssues = [];

  for (const rec of recommendations) {
    const nonCausalCheck = enforceNonCausalFraming(
      `${rec.proposedAction} ${rec.rationale}`,
      { hasInferredLinks: Boolean(rec.isNonCausalInferred || hasInferredLinks) },
    );
    let proposedAction = rec.proposedAction;
    let rationale = rec.rationale;
    if (nonCausalCheck.adjusted) {
      rationale = enforceNonCausalFraming(rationale, {
        hasInferredLinks: Boolean(rec.isNonCausalInferred),
      }).sanitizedText;
      proposedAction = enforceNonCausalFraming(proposedAction, {
        hasInferredLinks: false,
      }).sanitizedText;
    }

    const textCheck = validateTextAgainstGroundTruth(
      [rec.actionTitle, proposedAction, rationale],
      groundTruth,
    );
    if (!textCheck.passed) {
      citationIssues.push(...textCheck.unsupportedClaims);
    }

    audited.push({
      ...rec,
      proposedAction,
      rationale,
      requiresHumanConfirmation:
        rec.requiresHumanConfirmation !== undefined
          ? Boolean(rec.requiresHumanConfirmation)
          : true,
    });
  }

  return {
    recommendations: audited,
    citationIssues,
  };
}

module.exports = {
  NON_CAUSAL_LABEL,
  createGroundingTrace,
  registerSafeNumbers,
  enforceNonCausalFraming,
  validateTextAgainstGroundTruth,
  auditRecommendations,
};
