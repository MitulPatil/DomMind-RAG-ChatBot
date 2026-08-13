import { logApiUsage } from "./cost-tracker.js";
import {GoogleGenerativeAI} from "@google/generative-ai";
import config from "../config.js"

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({model : "gemini-embedding-001"});

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 3072;

export async function generateEmbedding(text, options = {}) {
    if(!text || text.trim().length === 0) {
        throw new Error("Cannot embed empty string");
    }

    const { userId = null, documentId = null } = options;

    const result = await model.embedContent(text);

    // embedContent does not return usageMetadata reliably
    // Estimate token count: ~1.3 tokens per word is a reasonable approximation
    // for English text with the Gemini tokenizer
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const estimatedTokens = Math.ceil(wordCount * 1.3);

    // Fire-and-forget — logging must not slow down indexing
    logApiUsage({
        userId,
        documentId,
        operation: "embedding",
        model: EMBEDDING_MODEL,
        promptTokens: estimatedTokens,
        completionTokens: 0
    }); // intentionally not awaited

    return result.embedding.values;
}