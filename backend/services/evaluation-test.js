// evaluation-suite.js
// Edit the TEST_CASES array to match your actual indexed document
// Run with: node evaluation-suite.js

import { pool } from "./db.js";
import { hybridSearch } from "./retriever.js";
import { generateAnswer } from "./generator.js";
import { runEvaluationSuite } from "./evaluator.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

// ── CONFIGURE THESE TO MATCH YOUR SETUP ──────────────────────────────────
const USER_ID = 1;        // ID of the user who owns the test document
const DOCUMENT_ID = 2;    // ID of the indexed document to test against

// ── TEST CASES ────────────────────────────────────────────────────────────
// Edit these to match actual content in your document
// expectedKeywords: words you expect to appear in a correct answer
// expectedGated: true if this question should NOT be answerable from the document

const TEST_CASES = [
  {
    question: "What is a decision tree?",
    documentId: DOCUMENT_ID,
    userId: USER_ID,
    expectedKeywords: ["decision", "tree", "split", "node"],
    expectedGated: false
  },
  {
    question: "How does backpropagation work?",
    documentId: DOCUMENT_ID,
    userId: USER_ID,
    expectedKeywords: ["backward", "gradient", "weights", "layer"],
    expectedGated: false
  },
  {
    question: "What causes overfitting?",
    documentId: DOCUMENT_ID,
    userId: USER_ID,
    expectedKeywords: ["overfitting", "training", "noise", "complex"],
    expectedGated: false
  },
  {
    // This question should NOT be answerable — tests gating
    question: "Who won the cricket World Cup in 2023?",
    documentId: DOCUMENT_ID,
    userId: USER_ID,
    expectedKeywords: [],
    expectedGated: true
  },
  {
    // Paraphrased question — tests semantic search quality
    question: "Why does a model perform well during training but fail on new data?",
    documentId: DOCUMENT_ID,
    userId: USER_ID,
    expectedKeywords: ["overfitting", "training", "test"],
    expectedGated: false
  }
];

async function main() {
  try {
    await runEvaluationSuite(TEST_CASES, hybridSearch, generateAnswer);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error("Evaluation failed:", err.message);
  process.exit(1);
});