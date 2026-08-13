import {pool} from "../db/db.js";
import {generateEmbedding} from "./embeddings.js";
import {validateDocumentAccess} from "./filter-validator.js";

const K = 60;
const ABSOLUTE_MINIMUM = 0.50;
const RELATIVE_THRESHOLD = 0.85;

async function semanticSearch(question, documentId, userId,topK=20) {
  const resultVector = await generateEmbedding(question);

  const vectorString = `[${resultVector}]`;

  const result = await pool.query(
    `SELECT 
      id,
      chunk_index,
      content,
      start_page,
      end_page,
      word_count,
      1 - (embedding <=> $1) AS similarity
    FROM chunks
    WHERE document_id=$2 AND user_id=$3
    ORDER BY embedding <=> $1 ASC
    LIMIT $4`,
    [vectorString, documentId, userId, topK]
  )

  return result.rows.map(row => ({
    id: parseInt(row.id),
    chunkIndex: row.chunk_index,
    content: row.content,
    startPage: row.start_page,
    endPage: row.end_page,
    wordCount: row.word_count,
    similarity: parseFloat(row.similarity),
    source: "semantic"
  }))
}

async function keywordSearch(question, documentId, userId,topK=20) {
  const result = await pool.query(
    `SELECT
      id,
      chunk_index,
      content,
      start_page,
      end_page,
      word_count,
      ts_rank(content_tsv, plainto_tsquery('english',$1)) AS keyword_score
    FROM chunks
    WHERE document_id=$2 AND user_id = $3 
      AND content_tsv @@ plainto_tsquery('english',$1)
    ORDER BY keyword_score DESC
    LIMIT $4`,
    [question, documentId, userId, topK]
  );

  return result.rows.map(row => ({
    id: parseInt(row.id),
    chunkIndex: row.chunk_index,
    content: row.content,
    startPage: row.start_page,
    endPage: row.end_page,
    wordCount: row.word_count,
    keywordScore: parseFloat(row.keyword_score),
    source: "keyword"
  }));

}

function applyRelevanceGate(chunks){
  if(!chunks || chunks.length === 0){
    return {chunks : [], gated : true, reason : "no_chunks_retrieved"}
  }

  const semanticChunks = chunks.filter(c => c.similarity !== null);
  const rankedSemanticChunks = [...semanticChunks].sort((a, b) => b.similarity - a.similarity);

  if(rankedSemanticChunks.length === 0){
    return {chunks, gated : false, reason : "keyword_only"}
  }

  const topSimilarity = rankedSemanticChunks[0].similarity;

  if(topSimilarity < ABSOLUTE_MINIMUM){
    return {
      chunks : [],
      gated : true,
      reason : "below_absolute_minimum",
      topSimilarity
    }
  }

  const relativeThreshold = topSimilarity * RELATIVE_THRESHOLD;

  const passed = chunks.filter(
    c => c.similarity === null || c.similarity >= relativeThreshold
  )

  return {
    chunks : passed,
    gated : passed.length === 0,
    reason : passed.length === 0 ? "all_below_relative_threshold" : null,
    topSimilarity,
    relativeThreshold
  }
}

function mergeAdjecentChunks(chunks){
  if(!chunks || chunks.length <= 1) return chunks;

  const sorted = [...chunks].sort((a,b)=> a.chunkIndex - b.chunkIndex);
  const merged = [];
  let current = {...sorted[0]};

  for(let i = 1 ; i < sorted.length ; i++){
    const next = sorted[i];
    const isAdjacent = next.chunkIndex <= current.chunkIndex + 2;

    if(isAdjacent){
      current = {
        ...current,
        content : current.content + " " + next.content,
        endPage : next.endPage,
        chunkIndex : next.chunkIndex,
        similarity : Math.max(current.similarity ?? 0 , next.similarity ?? 0)
      }
    }else{
      merged.push(current);
      current = {...next};
    }
  }

  merged.push(current);
  return merged;
}

export async function hybridSearch(question, documentId, userId,topK=3, useReranker = false) {
  await validateDocumentAccess(documentId, userId);

  const [similarityResults, keywordResults] = await Promise.all([
    semanticSearch(question, documentId, userId,20),
    keywordSearch(question, documentId, userId,20)
  ])

  if (keywordResults.length === 0) {
    console.warn(`[hybridSearch] keyword search returned 0 results for: "${question}"`);
  }

  const scores = new Map();

  similarityResults.forEach((chunk,rank)=>{
    const rrfScore = 1 / (K + rank + 1);

    if(scores.has(chunk.id)){
      scores.get(chunk.id).score += rrfScore;
    }else{
      scores.set(chunk.id, {score : rrfScore, chunk})
    }
  })

  keywordResults.forEach((chunk,rank) => {
    const rrfScore = 1 / (K + rank + 1);

    if(scores.has(chunk.id)){
      scores.get(chunk.id).score += rrfScore;
    }else{
      scores.set(chunk.id, {score : rrfScore, chunk})
    }
  });

  // Get more candidates than topK so re-ranker has material to work with
  // If using re-ranker, fetch topK*3 before re-ranking down to topK
  const fetchCount = useReranker ? topK * 3 : topK;

  const candidates = Array.from(scores.values())
    .sort((a,b)=> b.score - a.score)
    .slice(0,fetchCount)
    .map(({score, chunk})=>({
      ...chunk,
      rrfScore : parseFloat(score.toFixed(6)),
      similarity : chunk.similarity ?? null
    }))

  const gateResult = applyRelevanceGate(candidates);

  if (gateResult.gated) {
    return {
      chunks: [],
      gated: true,
      reason: gateResult.reason,
      topSimilarity: gateResult.topSimilarity ?? null,
      keywordCount: keywordResults.length
    };
  }

  let finalChunks = mergeAdjecentChunks(gateResult.chunks);
  
  // Optional LLM re-ranking step
  if (useReranker && finalChunks.length > 1) {
    const { rerankChunks } = await import("./reranker.js");
    finalChunks = await rerankChunks(question, finalChunks);
    // Take only topK after re-ranking
    finalChunks = finalChunks.slice(0, topK);
  }
    
  return {
    chunks: finalChunks,
    gated: false,
    reason: null,
    topSimilarity: gateResult.topSimilarity,
    keywordCount: keywordResults.length
  };
}


// Add to retriever.js — diagnostic and tuning utilities

// compareSearchMethods — runs semantic, keyword, and hybrid separately
// and shows side-by-side results so you can see what each method adds
// USE THIS during development to verify hybrid is actually helping

// export async function compareSearchMethods(question, documentId) {
//   await validateDocumentAccess(documentId);

//   const questionEmbedding = await generateEmbedding(question);
//   const vectorString = `[${questionEmbedding.join(",")}]`;

//   // Run all three in parallel
//   const [semanticRows, keywordRows, hybridResult] = await Promise.all([
//     // Semantic only — top 5
//     pool.query(
//       `SELECT id, chunk_index, content, start_page, end_page,
//               1 - (embedding <=> $1) AS similarity
//        FROM chunks WHERE document_id = $2
//        ORDER BY embedding <=> $1 ASC LIMIT 5`,
//       [vectorString, documentId]
//     ),
//     // Keyword only — top 5
//     pool.query(
//       `SELECT id, chunk_index, content, start_page, end_page,
//               ts_rank(content_tsv, plainto_tsquery('english', $1)) AS keyword_score
//        FROM chunks
//        WHERE document_id = $2
//          AND content_tsv @@ plainto_tsquery('english', $1)
//        ORDER BY keyword_score DESC LIMIT 5`,
//       [question, documentId]
//     ),
//     // Hybrid (your existing function)
//     hybridSearch(question, documentId, 5)
//   ]);

//   const semanticIds = new Set(semanticRows.rows.map(r => parseInt(r.id)));
//   const keywordIds = new Set(keywordRows.rows.map(r => parseInt(r.id)));
//   const hybridIds = new Set(hybridResult.chunks.map(c => c.id));

//   console.log(`\n=== SEARCH METHOD COMPARISON ===`);
//   console.log(`Question: "${question}"\n`);

//   console.log(`SEMANTIC TOP 5:`);
//   semanticRows.rows.forEach((r, i) => {
//     const inKeyword = keywordIds.has(parseInt(r.id)) ? " [also in keyword]" : "";
//     console.log(`  ${i+1}. [${parseFloat(r.similarity).toFixed(4)}] p${r.start_page} ${r.content.substring(0,60)}...${inKeyword}`);
//   });

//   console.log(`\nKEYWORD TOP 5:`);
//   if (keywordRows.rows.length === 0) {
//     console.log(`  (no keyword matches — query terms not found in document)`);
//   } else {
//     keywordRows.rows.forEach((r, i) => {
//       const inSemantic = semanticIds.has(parseInt(r.id)) ? " [also in semantic]" : "";
//       console.log(`  ${i+1}. [${parseFloat(r.keyword_score).toFixed(4)}] p${r.start_page} ${r.content.substring(0,60)}...${inSemantic}`);
//     });
//   }

//   console.log(`\nHYBRID TOP 5 (after RRF + gate + merge):`);
//   if (hybridResult.gated) {
//     console.log(`  GATED — ${hybridResult.reason} (topSimilarity: ${hybridResult.topSimilarity?.toFixed(4)})`);
//   } else {
//     hybridResult.chunks.forEach((c, i) => {
//       const sources = [];
//       if (semanticIds.has(c.id)) sources.push("semantic");
//       if (keywordIds.has(c.id)) sources.push("keyword");
//       console.log(`  ${i+1}. [rrf:${c.rrfScore}] [sim:${c.similarity?.toFixed(4)}] p${c.startPage} [${sources.join("+")}] ${c.content.substring(0,60)}...`);
//     });
//   }

//   // Compute what hybrid found that semantic alone missed
//   const hybridOnlyChunks = hybridResult.chunks.filter(
//     c => !semanticIds.has(c.id) && keywordIds.has(c.id)
//   );
//   if (hybridOnlyChunks.length > 0) {
//     console.log(`\n✅ HYBRID ADDED (keyword rescued these, semantic missed them):`);
//     hybridOnlyChunks.forEach(c => {
//       console.log(`  → p${c.startPage} ${c.content.substring(0,80)}...`);
//     });
//   } else {
//     console.log(`\nℹ️  No keyword-only additions this query — semantic and hybrid aligned`);
//   }

//   return {
//     semantic: semanticRows.rows,
//     keyword: keywordRows.rows,
//     hybrid: hybridResult
//   };
// }

// // weightedHybridSearch — variant where you control semantic vs keyword weight
// // Use when you know your document type benefits from stronger keyword matching
// // (e.g. legal documents with precise terminology, code documentation)
// // weights.semantic + weights.keyword should equal 1.0
// export async function weightedHybridSearch(
//   question, documentId, topK = 3,
//   weights = { semantic: 0.7, keyword: 0.3 }
// ) {
//   await validateDocumentAccess(documentId);

//   const [semanticResults, keywordResults] = await Promise.all([
//     semanticSearch(question, documentId, 20),
//     keywordSearch(question, documentId, 20)
//   ]);

//   const scores = new Map();

//   semanticResults.forEach((chunk, rank) => {
//     // Weight the RRF contribution by semantic weight
//     const rrfScore = weights.semantic * (1 / (K + rank + 1));
//     if (scores.has(chunk.id)) {
//       scores.get(chunk.id).score += rrfScore;
//     } else {
//       scores.set(chunk.id, { score: rrfScore, chunk });
//     }
//   });

//   keywordResults.forEach((chunk, rank) => {
//     // Weight the RRF contribution by keyword weight
//     const rrfScore = weights.keyword * (1 / (K + rank + 1));
//     if (scores.has(chunk.id)) {
//       scores.get(chunk.id).score += rrfScore;
//     } else {
//       scores.set(chunk.id, { score: rrfScore, chunk });
//     }
//   });

//   const candidates = Array.from(scores.values())
//     .sort((a, b) => b.score - a.score)
//     .slice(0, topK)
//     .map(({ score, chunk }) => ({
//       ...chunk,
//       rrfScore: parseFloat(score.toFixed(6)),
//       similarity: chunk.similarity || null
//     }));

//   const gateResult = applyRelevanceGate(candidates);

//   return {
//     chunks: gateResult.gated ? [] : mergeAdjacentChunks(gateResult.chunks),
//     gated: gateResult.gated,
//     reason: gateResult.reason,
//     topSimilarity: gateResult.topSimilarity ?? null,
//     keywordCount: keywordResults.length,
//     weights
//   };
// }
