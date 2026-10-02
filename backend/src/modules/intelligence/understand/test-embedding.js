require("dotenv").config();

const GeminiEmbeddingProvider = require("./gemini.embedding");

async function main() {
    const provider = new GeminiEmbeddingProvider();

    const embedding = await provider.generateEmbedding(
        "There is a large pothole on the road near the bus stop."
    );

    console.log("Embedding generated successfully.");
    console.log("Dimensions:", embedding.length);
    console.log("First 5 values:", embedding.slice(0, 5));
}

main().catch((error) => {
    console.error("Embedding test failed:", error);
    process.exit(1);
});