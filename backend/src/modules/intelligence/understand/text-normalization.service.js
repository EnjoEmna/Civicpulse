const PHRASE_REPLACEMENTS = [
  [/\bbus\s+shelter\b/g, "bus stop"],
  [/\bbus\s+stand\b/g, "bus stop"],
  [/\bstreet\s+lights?\b/g, "streetlight"],
  [/\bstreet\s+lamps?\b/g, "streetlight"],
  [/\blamp\s+posts?\b/g, "streetlight"],
  [/\bnot\s+working\b/g, "outage"],
  [/\bnon\s*-?\s*functional\b/g, "outage"],
  [/\bdrinking\s+water\b/g, "drinking_water"],
  [/\bwater\s+line\b/g, "pipeline"],
  [/\bwater\s+main\b/g, "pipeline"],
  [/\belectric\s+pole\b/g, "electric_pole"],
  [/\blive\s+wires?\b/g, "live_wire"],
  [/\bexposed\s+wires?\b/g, "live_wire"],
  [/\bopen\s+manholes?\b/g, "open_manhole"],
  [/\bspeed\s+breakers?\b/g, "speed_breaker"],
  [/\bfoul\s+smell\b/g, "odor"],
  [/\bbad\s+smell\b/g, "odor"],
  [/\bpile\s*up\b/g, "overflow"],
  [/\bwater\s+logging\b/g, "waterlogging"],
  [/\bwater\s+logged\b/g, "waterlogging"],
  [/\b4th\s+cross\s+rd\b/g, "4th cross road"],
];

const TOKEN_SYNONYMS = {
  // Hinglish / colloquial terms
  gaddha: "pothole",
  khadda: "pothole",
  sadak: "road",
  marg: "road",
  paani: "water",
  pani: "water",
  nal: "tap",
  nalka: "tap",
  nala: "drainage",
  nali: "drainage",
  kachra: "garbage",
  kooda: "garbage",
  kuda: "garbage",
  bijli: "electricity",
  batti: "streetlight",
  taar: "wire",
  aag: "fire",

  // Domain normalization & lemmatization
  rd: "road",
  st: "street",
  ave: "avenue",
  potholes: "pothole",
  crater: "pothole",
  craters: "pothole",
  cavity: "pothole",
  sinkhole: "pothole",
  cavein: "pothole",
  "cave-in": "pothole",
  roads: "road",
  roadway: "road",
  asphalt: "asphalt",
  tarmac: "asphalt",
  walkway: "footpath",
  sidewalk: "footpath",
  pavement: "footpath",
  leaking: "leak",
  leakage: "leak",
  leaks: "leak",
  seepage: "leak",
  seeping: "leak",
  dripping: "leak",
  burst: "leak",
  pipes: "pipeline",
  pipe: "pipeline",
  pipelines: "pipeline",
  sewage: "drainage",
  sewer: "drainage",
  drain: "drainage",
  drains: "drainage",
  clogged: "block",
  blocked: "block",
  choked: "block",
  streetlights: "streetlight",
  lamps: "streetlight",
  lamp: "streetlight",
  bulb: "streetlight",
  bulbs: "streetlight",
  blackout: "outage",
  darkness: "outage",
  flickering: "outage",
  trash: "garbage",
  waste: "garbage",
  rubbish: "garbage",
  refuse: "garbage",
  litter: "garbage",
  dustbin: "bin",
  bins: "bin",
  overflowing: "overflow",
  overflowed: "overflow",
  accumulation: "overflow",
  piled: "overflow",
  uncollected: "uncleared",
  stink: "odor",
  stinking: "odor",
  hazardous: "hazard",
  dangerous: "hazard",
  danger: "hazard",
  risky: "hazard",
  unsafe: "hazard",
  broken: "damage",
  damaged: "damage",
  cracked: "damage",
  eroding: "erode",
  eroded: "erode",
  flooded: "waterlogging",
  flooding: "waterlogging",
  submerged: "waterlogging",
  puddles: "waterlogging",
  rains: "rain",
  rainwater: "rain",
  commuters: "commuter",
  vehicles: "traffic",
};

const HINGLISH_MARKERS = new Set([
  "gaddha",
  "khadda",
  "sadak",
  "marg",
  "paani",
  "pani",
  "nal",
  "nalka",
  "nala",
  "nali",
  "kachra",
  "kooda",
  "kuda",
  "bijli",
  "batti",
  "taar",
  "aag",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "has",
  "have",
  "had",
  "it",
  "its",
  "this",
  "that",
  "there",
  "here",
  "for",
  "from",
  "with",
  "into",
  "onto",
  "near",
  "at",
  "on",
  "in",
  "to",
  "of",
  "by",
  "very",
  "due",
  "also",
  "since",
  "over",
  "when",
  "which",
  "issue",
  "problem",
  "complaint",
  "report",
  "reported",
  "causing",
]);

const CONCEPT_RULES = [
  {
    concept: "CONCEPT_ROAD_POTHOLE",
    terms: ["pothole", "asphalt", "road", "footpath", "manhole", "erode", "speed_breaker"],
  },
  {
    concept: "CONCEPT_WATER_PIPELINE_LEAK",
    terms: ["pipeline", "drinking_water", "leak", "tap", "borewell"],
  },
  {
    concept: "CONCEPT_DRAINAGE_OVERFLOW",
    terms: ["drainage", "waterlogging", "block", "culvert"],
  },
  {
    concept: "CONCEPT_STREETLIGHT_OUTAGE",
    terms: ["streetlight", "outage", "electric_pole", "electricity", "transformer"],
  },
  {
    concept: "CONCEPT_GARBAGE_SANITATION",
    terms: ["garbage", "sanitation", "bin", "overflow", "uncleared", "odor", "mosquito"],
  },
  {
    concept: "CONCEPT_PUBLIC_SAFETY",
    terms: ["live_wire", "electrocution", "open_manhole", "accident", "collapse", "fire", "hazard"],
  },
  {
    concept: "CONCEPT_TRANSIT_JUNCTION",
    terms: ["bus", "stop", "school", "hospital", "park", "junction", "commuter", "traffic"],
  },
];

function cleanRawText(input) {
  return String(input || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(rawText) {
  const cleanedText = cleanRawText(rawText);
  if (!cleanedText) {
    return {
      cleanedText: "",
      normalizedText: "",
      tokens: [],
      expandedTokens: [],
      canonicalConcepts: [],
      hinglishDetected: false,
      languageHint: "en",
    };
  }

  let working = cleanedText.toLowerCase();
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    working = working.replace(pattern, replacement);
  }

  const rawTokens = working
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let hinglishDetected = false;
  const normalizedTokens = [];
  const meaningfulTokens = [];

  for (const token of rawTokens) {
    if (HINGLISH_MARKERS.has(token)) {
      hinglishDetected = true;
    }

    const mapped = TOKEN_SYNONYMS[token] || token;
    normalizedTokens.push(mapped);

    if (!STOP_WORDS.has(mapped) && mapped.length >= 2) {
      meaningfulTokens.push(mapped);
    }
  }

  const expandedSet = new Set(meaningfulTokens);
  const tokenSet = new Set(normalizedTokens);

  const canonicalConcepts = [];
  for (const rule of CONCEPT_RULES) {
    if (rule.terms.some((term) => tokenSet.has(term) || expandedSet.has(term))) {
      canonicalConcepts.push(rule.concept);
    }
  }

  return {
    cleanedText,
    normalizedText: normalizedTokens.join(" "),
    tokens: normalizedTokens,
    expandedTokens: meaningfulTokens,
    canonicalConcepts,
    hinglishDetected,
    languageHint: hinglishDetected ? "en-hi-mixed" : "en",
  };
}

function normalizeComplaintText({ title = "", description = "", address = "" } = {}) {
  const combined = [title, description, address]
    .map((v) => cleanRawText(v))
    .filter(Boolean)
    .join(" ");

  return normalizeText(combined);
}

module.exports = {
  cleanRawText,
  normalizeText,
  normalizeComplaintText,
};
