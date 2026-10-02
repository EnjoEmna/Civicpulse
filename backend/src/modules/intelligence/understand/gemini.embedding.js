const { GoogleGenAI } = require("@google/genai");
const EmbeddingProvider = require("./embedding.provider");

class GeminiEmbeddingProvider extends EmbeddingProvider {
  constructor() {
    super();

    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    this.model = "gemini-embedding-2";
    this.outputDimensionality = 768;
  }

  async generateEmbedding(text) {
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("Embedding input must be a non-empty string");
    }

    const response = await this.client.models.embedContent({
      model: this.model,
      contents: text,
      config: {
        outputDimensionality: this.outputDimensionality,
      },
    });

    const embedding = response.embeddings?.[0]?.values;

    if (!embedding) {
      throw new Error("Gemini returned no embedding");
    }

    if (embedding.length !== this.outputDimensionality) {
      throw new Error(
        `Expected ${this.outputDimensionality}-dimensional embedding, received ${embedding.length}`,
      );
    }

    return embedding;
  }
}

module.exports = GeminiEmbeddingProvider;
