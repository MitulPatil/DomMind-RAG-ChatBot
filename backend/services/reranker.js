// reranker.js
// LLM-based re-ranking using Gemini
// Takes the top N chunks from hybrid search and reorders them
// by asking Gemini to score each chunk's relevance to the question
// Only use this if you can afford the latency — adds ~1-2 seconds

import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
// Use the lite model for re-ranking — it's faster and cheaper
// Re-ranking doesn't need deep reasoning, just relevance scoring
const rerankerModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// rerankChunks — scores each chunk's relevance to the question
// Input: question string, array of chunk objects from hybridSearch
// Output: same chunks sorted by LLM-assigned relevance score, highest first
export async function rerankChunks(question, chunks) {
  if (!chunks || chunks.length <= 1) {
    // Nothing to rerank — return as-is
    return chunks;
  }

  // Build a prompt that asks Gemini to score each chunk
  // We use a structured JSON response so we can parse the scores reliably
  const chunksForScoring = chunks.map((chunk, i) => ({
    id: i,
    // Use id=i (array index) as the identifier inside the prompt
    // This is simpler than using chunk.id (database id) and avoids
    // the model confusing database IDs with relevance scores
    preview: chunk.content.substring(0, 300)
    // Send only first 300 chars — enough for relevance judgment
    // Sending full chunks would use too many tokens per reranking call
  }));

  const prompt = `You are a relevance scoring assistant. Given a question and several text passages, score how relevant each passage is to answering the question.

QUESTION: ${question}

PASSAGES:
${chunksForScoring.map(c => `[${c.id}]: ${c.preview}`).join("\n\n")}

Score each passage from 0 to 10 where:
- 10 = directly answers the question
- 7-9 = highly relevant, contains key information
- 4-6 = partially relevant, related topic
- 1-3 = loosely related
- 0 = completely irrelevant

Respond with ONLY a JSON array, no other text:
[{"id": 0, "score": 8}, {"id": 1, "score": 3}, ...]`;

  try {
    const result = await rerankerModel.generateContent(prompt);
    const responseText = result.response.text().trim();

    // Parse the JSON response — strip any markdown code fences the model adds
    const cleanJson = responseText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const scores = JSON.parse(cleanJson);
    // scores is now: [{ id: 0, score: 8 }, { id: 1, score: 3 }, ...]

    // Build a lookup map from id to score for O(1) access
    const scoreMap = new Map(scores.map(s => [s.id, s.score]));

    // Attach reranker scores to the original chunk objects
    const scoredChunks = chunks.map((chunk, i) => ({
      ...chunk,
      rerankerScore: scoreMap.get(i) ?? 0
      // Default to 0 if the model didn't return a score for this id
      // This prevents a missing score from crashing the sort
    }));

    // Sort by reranker score descending — highest relevance first
    return scoredChunks.sort((a, b) => b.rerankerScore - a.rerankerScore);

  } catch (err) {
    // If re-ranking fails for any reason (JSON parse error, API error, timeout)
    // fall back to the original RRF ordering — degraded but not broken
    console.warn(`[reranker] Failed, using original order: ${err.message}`);
    return chunks;
  }
}