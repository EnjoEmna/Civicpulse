class EmbeddingProvider {
    async generateEmbedding(text) {
        throw new Error("generateEmbedding() must be implemented");
    }
}

module.exports = EmbeddingProvider;