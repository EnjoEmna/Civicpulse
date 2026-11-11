const { GoogleGenAI, Type } = require("@google/genai");

const AI_MODELS = {
  text: process.env.GEMINI_TEXT_MODEL || "gemini-3-flash-preview",
  fallbackText: "gemini-2.5-flash-lite",
  embedding: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2",
};

let cachedClient = null;
let cachedApiKey = null;

function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY;
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : null;
}

function hasGeminiApiKey() {
  return Boolean(getGeminiApiKey());
}

function getGenAIClient() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return null;
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedApiKey = apiKey;
  }

  return cachedClient;
}

function resetGenAIClient() {
  cachedClient = null;
  cachedApiKey = null;
}

async function generateStructuredJson({
  prompt,
  responseJsonSchema,
  systemInstruction,
  temperature = 0.2,
  model = AI_MODELS.text,
}) {
  const client = getGenAIClient();
  if (!client) {
    return null;
  }

  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      ...(systemInstruction ? { systemInstruction } : {}),
      temperature,
      responseMimeType: "application/json",
      ...(responseJsonSchema ? { responseJsonSchema } : {}),
    },
  });

  const rawText = typeof response?.text === "string" ? response.text.trim() : "";
  if (!rawText) {
    throw new Error("Gemini returned an empty response");
  }

  // Strip optional markdown code fences if a model wraps JSON output
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  return {
    data: parsed,
    model,
  };
}

module.exports = {
  AI_MODELS,
  Type,
  getGeminiApiKey,
  hasGeminiApiKey,
  getGenAIClient,
  resetGenAIClient,
  generateStructuredJson,
};
