// evaluator.js
// Evaluates RAG quality without requiring Python, RAGAS, or paid APIs
// Uses three approaches:
// 1. Keyword overlap — fast, no API calls, basic relevance check
// 2. LLM-as-judge — uses Gemini to evaluate faithfulness (one API call per Q&A pair)
// 3. Test set runner — runs a batch of known Q&A pairs and reports scores

import { GoogleGenerativeAI } from "@google/generative-ai";
import { pool } from "../db/db.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const judgeModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ── STOP WORDS ────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could","should",
  "may","might","shall","must","can","need","dare","ought","used",
  "to","of","in","on","at","by","for","with","about","against",
  "between","through","during","before","after","above","below",
  "and","or","but","if","then","else","so","yet","both","either",
  "this","that","these","those","it","its","they","them","their",
  "we","our","you","your","he","his","she","her","i","my","me"
]);

// ── METRIC 1: CONTEXT PRECISION (keyword overlap) ─────────────────────────

// evaluateContextPrecision — checks whether retrieved chunks contain
// words from the answer, as a proxy for relevance
// Fast, no API calls, not perfect but useful as a quick check
export function evaluateContextPrecision(retrievedChunks, generatedAnswer) {
  // Extract meaningful words from the answer
  const answerWords = generatedAnswer
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));

  if (answerWords.length === 0) {
    return { score: 0, reason: "Answer contains no meaningful words to evaluate" };
  }

  const chunkEvaluations = retrievedChunks.map((chunk, i) => {
    const chunkText = chunk.content.toLowerCase();

    // Count how many answer words appear in this chunk
    const matchingWords = answerWords.filter(w => chunkText.includes(w));
    const overlapRatio = matchingWords.length / answerWords.length;

    // A chunk is "relevant" if it contains at least 20% of the answer's key words
    // This threshold is loose — adjust based on your domain
    const isRelevant = overlapRatio >= 0.20;

    return {
      chunkIndex: chunk.chunkIndex,
      startPage: chunk.startPage,
      similarity: chunk.similarity,
      wordOverlapRatio: parseFloat(overlapRatio.toFixed(3)),
      isRelevant,
      matchCount: matchingWords.length,
      totalAnswerWords: answerWords.length,
      topMatchingWords: matchingWords.slice(0, 8)
    };
  });

  // Context precision: fraction of retrieved chunks that were relevant
  const relevantCount = chunkEvaluations.filter(e => e.isRelevant).length;
  const score = retrievedChunks.length > 0
    ? relevantCount / retrievedChunks.length
    : 0;

  return {
    score: parseFloat(score.toFixed(3)),
    // 1.0 = all retrieved chunks were relevant
    // 0.33 = only 1 of 3 chunks was relevant
    relevantChunks: relevantCount,
    totalChunks: retrievedChunks.length,
    chunkEvaluations,
    interpretation: score >= 0.8 ? "Good"
      : score >= 0.5 ? "Acceptable — some irrelevant chunks retrieved"
      : "Poor — most retrieved chunks were not relevant to the answer"
  };
}

// ── METRIC 2: FAITHFULNESS (LLM as judge) ────────────────────────────────

// evaluateFaithfulness — uses Gemini to check if the answer is grounded
// in the retrieved chunks or contains hallucinated content
// Costs one API call per evaluation — use sparingly or batch
export async function evaluateFaithfulness(question, retrievedChunks, generatedAnswer) {
  // Build a context summary for the judge
  const context = retrievedChunks
    .map((c, i) => `[Passage ${i + 1}]: ${c.content}`)
    .join("\n\n");

  // Ask Gemini to act as an impartial evaluator
  const judgePrompt = `You are a strict evaluator of AI-generated answers.
Your job is to check whether a given answer is fully supported by the provided passages, or whether it contains claims not found in the passages.

PASSAGES:
${context}

QUESTION: ${question}

ANSWER TO EVALUATE:
${generatedAnswer}

EVALUATION TASK:
1. List each distinct factual claim made in the answer
2. For each claim, indicate whether it is SUPPORTED by the passages or UNSUPPORTED (hallucinated)
3. Calculate a faithfulness score: number of supported claims / total claims

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{
  "claims": [
    {"claim": "text of claim", "supported": true, "evidence": "which passage supports it or 'none'"},
    {"claim": "text of claim", "supported": false, "evidence": "none"}
  ],
  "supportedCount": 0,
  "totalCount": 0,
  "faithfulnessScore": 0.0,
  "interpretation": "brief explanation"
}`;

  try {
    const result = await judgeModel.generateContent(judgePrompt);
    const responseText = result.response.text().trim();

    // Remove any markdown code block formatting if present
    const cleanJson = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const evaluation = JSON.parse(cleanJson);
    return {
      score: evaluation.faithfulnessScore,
      claims: evaluation.claims,
      supportedCount: evaluation.supportedCount,
      totalCount: evaluation.totalCount,
      interpretation: evaluation.interpretation,
      method: "llm_judge"
    };

  } catch (err) {
    // If parsing fails, return a graceful fallback
    return {
      score: null,
      error: `Evaluation parsing failed: ${err.message}`,
      method: "llm_judge",
      interpretation: "Could not evaluate — check judge model response format"
    };
  }
}

// ── METRIC 3: SIMILARITY DISTRIBUTION ANALYSIS ────────────────────────────

// analyzeSimilarityDistribution — shows the distribution of similarity scores
// across all retrieved chunks to detect retrieval quality patterns
// No API calls — uses the scores already returned from hybridSearch
export function analyzeSimilarityDistribution(retrievedChunks) {
  if (!retrievedChunks || retrievedChunks.length === 0) {
    return { analysis: "No chunks retrieved" };
  }

  const similarities = retrievedChunks
    .filter(c => c.similarity !== null)
    .map(c => c.similarity);

  if (similarities.length === 0) {
    return { analysis: "No similarity scores available (keyword-only results)" };
  }

  const topScore = Math.max(...similarities);
  const bottomScore = Math.min(...similarities);
  const average = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const spread = topScore - bottomScore;

  return {
    topScore: parseFloat(topScore.toFixed(4)),
    bottomScore: parseFloat(bottomScore.toFixed(4)),
    average: parseFloat(average.toFixed(4)),
    spread: parseFloat(spread.toFixed(4)),
    interpretation:
      topScore < 0.55 ? "POOR — all scores below absolute minimum threshold. No relevant content found."
      : topScore < 0.65 ? "WEAK — low similarity scores. Answer may be unreliable."
      : spread > 0.3 ? "MIXED — large score spread. Top chunk is relevant but others may not be."
      : "GOOD — consistent high scores suggest relevant retrieval."
  };
}

// ── FULL EVALUATION REPORT ────────────────────────────────────────────────

// evaluateQAPair — runs all metrics on a single question-answer pair
// Call this during development to evaluate specific responses
export async function evaluateQAPair(question, retrievedChunks, generatedAnswer, options = {}) {
  const { includeFaithfulness = false } = options;
  // includeFaithfulness = false by default to save API calls
  // Set to true when you want deep evaluation

  const contextPrecision = evaluateContextPrecision(retrievedChunks, generatedAnswer);
  const similarityAnalysis = analyzeSimilarityDistribution(retrievedChunks);

  const report = {
    question,
    chunksRetrieved: retrievedChunks.length,
    contextPrecision,
    similarityAnalysis,
    overallQuality: determineOverallQuality(contextPrecision.score, similarityAnalysis)
  };

  if (includeFaithfulness) {
    // Only call if explicitly requested — one API call per evaluation
    report.faithfulness = await evaluateFaithfulness(question, retrievedChunks, generatedAnswer);
  }

  return report;
}

function determineOverallQuality(precisionScore, similarityAnalysis) {
  if (similarityAnalysis.topScore < 0.55) return "POOR — no relevant content retrieved";
  if (precisionScore < 0.33) return "POOR — most retrieved chunks were irrelevant";
  if (precisionScore < 0.6 || similarityAnalysis.average < 0.6) return "ACCEPTABLE";
  return "GOOD";
}

// ── TEST SET RUNNER ───────────────────────────────────────────────────────

// runEvaluationSuite — runs a batch of test questions and produces an aggregate report
// This is how you systematically evaluate your system before and after changes
export async function runEvaluationSuite(testCases, hybridSearchFn, generateAnswerFn) {
  console.log(`\nRunning evaluation suite: ${testCases.length} test cases\n`);
  console.log("=".repeat(70));

  const results = [];

  for (const testCase of testCases) {
    process.stdout.write(`Testing: "${testCase.question.substring(0, 50)}..."  `);

    try {
      // Run retrieval
      const retrieval = await hybridSearchFn(
        testCase.question, testCase.documentId, testCase.userId, 3
      );

      if (retrieval.gated) {
        console.log("GATED");
        results.push({
          ...testCase,
          gated: true,
          quality: testCase.expectedGated ? "CORRECT_GATE" : "WRONG_GATE"
        });
        continue;
      }

      // Generate answer
      const generated = await generateAnswerFn(testCase.question, retrieval.chunks);

      // Evaluate
      const evaluation = await evaluateQAPair(
        testCase.question,
        retrieval.chunks,
        generated.answer,
        { includeFaithfulness: false }
        // Set to true for thorough evaluation, false for speed
      );

      // Check against expected answer if provided
      let answerMatch = null;
      if (testCase.expectedKeywords) {
        const answerLower = generated.answer.toLowerCase();
        const matchedKeywords = testCase.expectedKeywords.filter(kw =>
          answerLower.includes(kw.toLowerCase())
        );
        answerMatch = {
          matched: matchedKeywords.length,
          total: testCase.expectedKeywords.length,
          ratio: matchedKeywords.length / testCase.expectedKeywords.length,
          missingKeywords: testCase.expectedKeywords.filter(kw =>
            !answerLower.includes(kw.toLowerCase())
          )
        };
      }

      console.log(evaluation.overallQuality);

      results.push({
        question: testCase.question,
        gated: false,
        evaluation,
        answerMatch,
        topSimilarity: retrieval.topSimilarity,
        keywordCount: retrieval.keywordCount
      });

    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({ question: testCase.question, error: err.message });
    }
  }

  // Aggregate report
  const successfulRuns = results.filter(r => !r.error && !r.gated);
  const avgPrecision = successfulRuns.length > 0
    ? successfulRuns.reduce((sum, r) => sum + (r.evaluation?.contextPrecision?.score || 0), 0) / successfulRuns.length
    : 0;

  const qualityBreakdown = {
    GOOD: successfulRuns.filter(r => r.evaluation?.overallQuality === "GOOD").length,
    ACCEPTABLE: successfulRuns.filter(r => r.evaluation?.overallQuality === "ACCEPTABLE").length,
    POOR: successfulRuns.filter(r => r.evaluation?.overallQuality?.startsWith("POOR")).length,
    GATED: results.filter(r => r.gated).length,
    ERRORS: results.filter(r => r.error).length
  };

  console.log("\n" + "=".repeat(70));
  console.log("EVALUATION SUMMARY");
  console.log("=".repeat(70));
  console.log(`Total test cases: ${testCases.length}`);
  console.log(`Average context precision: ${avgPrecision.toFixed(3)}`);
  console.log(`\nQuality breakdown:`);
  Object.entries(qualityBreakdown).forEach(([quality, count]) => {
    if (count > 0) console.log(`  ${quality}: ${count}`);
  });

  return { results, summary: { avgPrecision, qualityBreakdown } };
}