const EmbeddingProvider = require("./embedding.provider");
const { normalizeText } = require("./text-normalization.service");

const DIMENSIONS = 192;
const CONCEPT_SLICE_SIZE = 32;
const TOKEN_SLICE_START = 32;
const TOKEN_SLICE_SIZE = 96;
const TRIGRAM_SLICE_START = 128;
const TRIGRAM_SLICE_SIZE = 64;

function fnv1aHash(str, seed = 2166136261) {
  let hash = seed >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function signBit(str) {
  return (fnv1aHash(str, 0x9e3779b9) & 1) === 0 ? 1 : -1;
}

function l2Normalize(vector) {
  let normSq = 0;
  for (let i = 0; i < vector.length; i += 1) {
    normSq += vector[i] * vector[i];
  }
  if (normSq === 0) {
    return vector;
  }
  const invNorm = 1 / Math.sqrt(normSq);
  return vector.map((v) => Number((v * invNorm).toFixed(6)));
}

function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i += 1) {
    const a = Number(vecA[i]) || 0;
    const b = Number(vecB[i]) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

const DOMAIN_TOPIC_WEIGHTS = {
  // Specific high-signal civic concepts get dedicated orthogonal concept slots
  pothole: { idx: 0, weight: 2.6 },
  road: { idx: 1, weight: 1.9 },
  asphalt: { idx: 2, weight: 1.8 },
  footpath: { idx: 3, weight: 1.6 },
  manhole: { idx: 4, weight: 2.1 },
  pipeline: { idx: 5, weight: 2.6 },
  drinking_water: { idx: 6, weight: 2.5 },
  leak: { idx: 7, weight: 2.4 },
  drainage: { idx: 8, weight: 2.5 },
  waterlogging: { idx: 9, weight: 1.9 },
  streetlight: { idx: 10, weight: 2.8 },
  electric_pole: { idx: 11, weight: 2.4 },
  electricity: { idx: 12, weight: 2.2 },
  outage: { idx: 13, weight: 2.2 },
  live_wire: { idx: 14, weight: 2.8 },
  garbage: { idx: 15, weight: 2.8 },
  sanitation: { idx: 16, weight: 2.4 },
  bin: { idx: 17, weight: 2.0 },
  overflow: { idx: 18, weight: 1.9 },
  uncleared: { idx: 19, weight: 1.8 },
  odor: { idx: 20, weight: 1.9 },
  hazard: { idx: 21, weight: 1.5 },
  damage: { idx: 22, weight: 1.4 },
  bus: { idx: 23, weight: 1.6 },
  stop: { idx: 24, weight: 1.5 },
  school: { idx: 25, weight: 1.7 },
  park: { idx: 26, weight: 1.7 },
  hospital: { idx: 27, weight: 1.7 },
  traffic: { idx: 28, weight: 1.6 },
  fire: { idx: 29, weight: 2.5 },
  collapse: { idx: 30, weight: 2.3 },
  erode: { idx: 31, weight: 1.9 },
};

class LocalSemanticEmbeddingProvider extends EmbeddingProvider {
  constructor() {
    super();
    this.model = "civicpulse-semantic-bow-v1";
    this.modelVersion = "v1.0";
    this.outputDimensionality = DIMENSIONS;
  }

  async generateEmbedding(text) {
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("Embedding input must be a non-empty string");
    }

    const vec = new Array(this.outputDimensionality).fill(0);
    const normalized = normalizeText(text);
    const tokens = normalized.expandedTokens;

    if (tokens.length === 0) {
      // Fallback to raw character trigrams if all words were filtered
      const raw = normalized.cleanedText.toLowerCase();
      for (let i = 0; i <= Math.max(0, raw.length - 3); i += 1) {
        const tri = raw.slice(i, i + 3);
        const bucket = TRIGRAM_SLICE_START + (fnv1aHash(tri) % TRIGRAM_SLICE_SIZE);
        vec[bucket] += signBit(tri);
      }
      return l2Normalize(vec);
    }

    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // 1. Canonical domain concept slice (0..31)
    for (const [token, count] of tf.entries()) {
      const sublinearTf = 1 + Math.log(count);
      const conceptSpec = DOMAIN_TOPIC_WEIGHTS[token];
      if (conceptSpec) {
        vec[conceptSpec.idx] += conceptSpec.weight * sublinearTf;
      }

      // 2. Hashed canonical unigrams (32..127)
      const tokenIdx = TOKEN_SLICE_START + (fnv1aHash(`u:${token}`) % TOKEN_SLICE_SIZE);
      vec[tokenIdx] += 1.25 * sublinearTf * signBit(`su:${token}`);
    }

    // Canonical bigrams capture multi-word location & phrase semantics (e.g., "bus stop", "4th cross")
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      const biIdx = TOKEN_SLICE_START + (fnv1aHash(`b:${bigram}`) % TOKEN_SLICE_SIZE);
      vec[biIdx] += 1.45 * signBit(`sb:${bigram}`);
    }

    // 3. Character trigrams for typo/morphological resilience (128..191)
    const compactText = tokens.join(" ");
    for (let i = 0; i <= Math.max(0, compactText.length - 3); i += 1) {
      const tri = compactText.slice(i, i + 3);
      if (!tri.trim()) continue;
      const triIdx = TRIGRAM_SLICE_START + (fnv1aHash(`t:${tri}`) % TRIGRAM_SLICE_SIZE);
      vec[triIdx] += 0.35 * signBit(`st:${tri}`);
    }

    return l2Normalize(vec);
  }
}

module.exports = LocalSemanticEmbeddingProvider;
module.exports.DIMENSIONS = DIMENSIONS;
module.exports.cosineSimilarity = cosineSimilarity;
