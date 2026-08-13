// cost-tracker.js
// Central module for tracking all Gemini API costs
// Every Gemini call in the application should call logApiUsage after completion

import { pool } from "../db/db.js";

// ── PRICING TABLE ─────────────────────────────────────────────────────────
// Prices in USD per 1 million tokens
// Source: ai.google.dev/pricing — verify these against current pricing
// We store raw token counts (facts) not costs (which change with pricing)
// This lets us recalculate retroactively if prices change

const PRICE_PER_MILLION_TOKENS = {
  "gemini-3.1-flash-lite-preview": {
    input: 0.25,    // prompt tokens
    output: 1.50     // completion tokens
  },
  "gemini-embedding-001": {
    input: 0.25,    // embedding model — no output tokens
    output: 0
  }
};

// ── CORE LOGGING FUNCTION ─────────────────────────────────────────────────

// logApiUsage — records one API call's token consumption to the database
// Should be called after EVERY Gemini API call in the application
// Never throws — a logging failure must never crash the main operation
export async function logApiUsage({
  userId,          // integer — which authenticated user triggered this
  documentId,      // integer — which document this relates to (null for non-document ops)
  operation,       // string — 'embedding' | 'generation' | 'generation_stream' | 'judge'
  model,           // string — model name from the SDK call
  promptTokens,    // integer — from usageMetadata.promptTokenCount
  completionTokens // integer — from usageMetadata.candidatesTokenCount
}) {
  // Validate token counts — negative or NaN values indicate a bug upstream
  const safePromptTokens = Math.max(0, parseInt(promptTokens) || 0);
  const safeCompletionTokens = Math.max(0, parseInt(completionTokens) || 0);
  const totalTokens = safePromptTokens + safeCompletionTokens;

  try {
    await pool.query(
      `INSERT INTO api_usage_logs
         (user_id, document_id, operation, model,
          prompt_tokens, completion_tokens, total_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId || null,
        documentId || null,
        operation,
        model,
        safePromptTokens,
        safeCompletionTokens,
        totalTokens
      ]
    );
  } catch (err) {
    // Log the failure but never propagate it
    // The user already received their answer — logging is a background concern
    console.warn(`[cost-tracker] Failed to log usage: ${err.message}`);
  }
}

// ── HELPER FOR STREAMING RESPONSES ───────────────────────────────────────

// logStreamUsage — called after a streaming response completes
// streamResult is the return value of model.generateContentStream()
// Must be called AFTER the for-await loop finishes — not during
export async function logStreamUsage(streamResult, { userId, documentId, operation, model }) {
  try {
    // streamResult.response is a Promise that resolves when the stream ends
    // It's safe to await here because we call this function after the loop
    const response = await streamResult.response;
    const usage = response.usageMetadata;

    if (usage) {
      await logApiUsage({
        userId,
        documentId,
        operation,
        model,
        promptTokens: usage.promptTokenCount || 0,
        completionTokens: usage.candidatesTokenCount || 0
      });
    }
  } catch (err) {
    console.warn(`[cost-tracker] Failed to log stream usage: ${err.message}`);
  }
}

// ── COST CALCULATION ──────────────────────────────────────────────────────

// calculateCost — converts token counts to estimated USD cost
// Returns null if the model is not in our pricing table
export function calculateCost(model, promptTokens, completionTokens) {
  const pricing = PRICE_PER_MILLION_TOKENS[model];
  if (!pricing) return null;

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    inputCostUSD: parseFloat(inputCost.toFixed(8)),
    outputCostUSD: parseFloat(outputCost.toFixed(8)),
    totalCostUSD: parseFloat(totalCost.toFixed(8))
  };
}

// ── USAGE QUERIES ─────────────────────────────────────────────────────────

// getUserUsageSummary — aggregated stats for a specific user
// Returns usage grouped by operation type, with cost estimates
export async function getUserUsageSummary(userId, days = 30) {
  // Group by operation and model to show a breakdown
  const byOperation = await pool.query(
    `SELECT
       operation,
       model,
       COUNT(*)::integer               AS call_count,
       SUM(prompt_tokens)::integer     AS total_prompt_tokens,
       SUM(completion_tokens)::integer AS total_completion_tokens,
       SUM(total_tokens)::integer      AS total_tokens,
       MIN(created_at)                 AS first_call,
       MAX(created_at)                 AS last_call
     FROM api_usage_logs
     WHERE user_id = $1 
       AND created_at >= NOW() - ($2 || ' days')::INTERVAL
     GROUP BY operation, model
     ORDER BY total_tokens DESC`,
    [userId, days]
  );

  // Daily breakdown — useful for showing a usage trend graph
  const byDay = await pool.query(
    `SELECT
       DATE(created_at)              AS day,
       SUM(total_tokens)::integer    AS tokens,
       COUNT(*)::integer             AS calls
     FROM api_usage_logs
     WHERE user_id = $1
       AND created_at >= NOW() - ($2 || ' days')::INTERVAL
     GROUP BY DATE(created_at)
     ORDER BY day ASC`,
    [userId, days]
  );

  // Add cost estimates to each operation row
  const operationsWithCost = byOperation.rows.map(row => {
    const cost = calculateCost(
      row.model,
      row.total_prompt_tokens,
      row.total_completion_tokens
    );
    return { ...row, estimatedCost: cost };
  });

  // Calculate totals
  const totals = operationsWithCost.reduce(
    (acc, row) => ({
      totalTokens: acc.totalTokens + row.total_tokens,
      totalCalls: acc.totalCalls + row.call_count,
      totalCostUSD: acc.totalCostUSD + (row.estimatedCost?.totalCostUSD || 0)
    }),
    { totalTokens: 0, totalCalls: 0, totalCostUSD: 0 }
  );

  return {
    userId,
    periodDays: days,
    operations: operationsWithCost,
    dailyBreakdown: byDay.rows,
    totals: {
      ...totals,
      totalCostUSD: parseFloat(totals.totalCostUSD.toFixed(6))
    }
  };
}

// getSystemUsageSummary — admin view of all users' usage
// Call this only from admin endpoints, never expose to regular users
export async function getSystemUsageSummary(days = 30) {
  const result = await pool.query(
    `SELECT
       u.email,
       al.user_id,
       COUNT(*)::integer             AS total_calls,
       SUM(al.total_tokens)::integer AS total_tokens,
       MAX(al.created_at)            AS last_activity
     FROM api_usage_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.created_at >= NOW() - ($1 || ' days')::INTERVAL
     GROUP BY al.user_id, u.email
     ORDER BY total_tokens DESC`,
    [days]
  );
  return result.rows;
}