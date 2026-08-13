// indexer.js
// Same as Week 8 but with status updates so the frontend knows when indexing is done

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { pool } from "../db/db.js";
import { generateEmbedding, EMBEDDING_DIMENSIONS } from "./embeddings.js";
import { safeExtractPdf } from "./pdf-extractor.js";
import { chunkPdfPages } from "./pdf-chunker.js";

function isUsableChunk(chunkText){
  const words = chunkText.split(/\s+/).filter(w => w.length > 0);
  if(words.length < 20) return false;
  const numericWords = words.filter(w => /^[\d.,]+$/.test(w));
  return (numericWords.length / words.length) < 0.6;
}

async function embedInBatches(chunks, batchSize = 10, delayMs = 500){
  const result = [];

  for(let i=0;i< chunks.length ; i +=batchSize){
    const batch = chunks.slice(i, i + batchSize);

    const batchEmbedding = await Promise.all(
      batch.map(chunk => generateEmbedding(chunk.text))
    );

    result.push(...batchEmbedding);

    if(i + batchSize < chunks.length){
      await new Promise(resolve => setTimeout(resolve,delayMs));
    }
  }

  return result;
}

export async function indexPdf(filePath, title = null) {
  const filename = path.basename(filePath);

  // Check for existing document with same filename
  const existing = await pool.query(
    "SELECT id FROM documents WHERE filename = $1",
    [filename]
  );
  if (existing.rows.length > 0) {
    return { documentId: existing.rows[0].id, alreadyIndexed: true };
  }

  // Insert document record immediately with status 'processing'
  // This lets the frontend show "processing..." while indexing runs
  // If we waited until indexing was complete to insert, there'd be no record
  // for the frontend to poll against
  const docResult = await pool.query(
    `INSERT INTO documents (filename, title, status)
     VALUES ($1, $2,$3)
     RETURNING id`,
    [filename, title || filename, 'processing']
  );
  const documentId = docResult.rows[0].id;

  try {
    // Extract PDF text
    const extracted = await safeExtractPdf(filePath);
    if (!extracted.success) {
      throw new Error(`${extracted.error}. ${extracted.hint || ""}`);
    }

    // Chunk with page tracking
    const allChunks = chunkPdfPages(extracted.pages, 150, 30);
    if (allChunks.length === 0) {
      throw new Error("No chunks produced");
    }

    const chunks = allChunks.filter(c => isUsableChunk(c.text));

    if(chunks.length === 0){
      throw new Error("No usable chunks produced after quality chunk filtering");
    }

    await pool.query(
      `UPDATE documents 
      SET total_chunks = $1 WHERE id = $2`,
      [chunks.length, documentId]
    );

    const embeddings = await embedInBatches(chunks);

    // Insert chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Dimension mismatch on chunk ${i}`);
      }

      const vectorString = `[${embedding.join(",")}]`;

      await pool.query(
        `INSERT INTO chunks
           (document_id, content, chunk_index, word_count,
            start_word, end_word, start_page, end_page, embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [documentId, chunk.text, chunk.chunkIndex, chunk.wordCount,
         chunk.startWord, chunk.endWord, chunk.startPage, chunk.endPage,
         vectorString]
      );
    }

    // Update document record to 'ready' once all chunks are stored
    await pool.query(
      `UPDATE documents
       SET status = 'ready', num_pages = $1, word_count = $2, chunk_count = $3
       WHERE id = $4`,
      [extracted.numPages, extracted.wordCount, chunks.length, documentId]
    );

    return { documentId, alreadyIndexed: false, chunkCount: chunks.length };

  } catch (err) {
    // Update status to 'failed' so the frontend doesn't show it as loading forever
    await pool.query(
      "UPDATE documents SET status = 'failed' WHERE id = $1",
      [documentId]
    );
    throw err;  // re-throw so the caller (server.js) can return an error response
  }
}

// indexPdfAsync — the new async version for large PDFs
// This function is called WITHOUT await — it runs in the background
// while the HTTP response has already been sent to the client
export async function indexPdfAsync(documentId, filePath, userId) {
  let client;

  try {

    client = await pool.connect();

    // Establish RLS identity for this background job
    await client.query(
      `SELECT set_config('app.current_user_id', $1, false)`,
      [String(userId)]
    );

    console.log(
      `[indexer] Started document=${documentId} user=${userId}`
    );

    //PDF extraction
    const extracted = await safeExtractPdf(filePath);
    if (!extracted.success) {
      throw new Error(`${extracted.error}. ${extracted.hint || ""}`);
    }

    console.log(
      `[indexer] Extracted ${extracted.numPages} pages`
    );

    // Chunking
    const allChunks = chunkPdfPages(extracted.pages, 150, 30);
    const chunks = allChunks.filter(c => isUsableChunk(c.text));

    console.log(
      `[indexer] ${chunks.length} usable chunks`
    );

    if (chunks.length === 0) {
      throw new Error("No usable chunks produced after quality filtering");
    }

    // Set total_chunks now so the frontend can compute percentage
    // before any embedding has started
    await client.query(
      `UPDATE documents
       SET total_chunks = $1, num_pages = $2, word_count = $3
       WHERE id = $4 AND user_id = $5`,
      [chunks.length, extracted.numPages, extracted.wordCount, documentId, userId]
    );

    // Process in batches of 10 chunks each
    const BATCH_SIZE = 10;
    let processedCount = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      // Embed this batch in parallel
      const embeddings = await Promise.all(
        batch.map(chunk => generateEmbedding(chunk.text,{
          userId,
          documentId
        }))
      );

      // Insert this batch into the database
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const embedding = embeddings[j];

        if (embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(`Dimension mismatch on chunk ${i + j}`+`expected ${EMBEDDING_DIMENSIONS}, ` +
            `got ${embedding.length}`);
        }

        const vectorString = `[${embedding.join(",")}]`;

        await client.query(
          `INSERT INTO chunks
             (document_id, user_id,content, chunk_index, word_count,
              start_word, end_word, start_page, end_page, embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [documentId, userId,chunk.text, chunk.chunkIndex, chunk.wordCount,
           chunk.startWord, chunk.endWord, chunk.startPage, chunk.endPage,
           vectorString]
        );

        processedCount++;
      }

      // Update progress after each batch completes
      // This is what the frontend polls to show the progress bar
      await client.query(
        `UPDATE documents SET chunks_processed = $1 WHERE id = $2 AND user_id=$3`,
        [processedCount, documentId, userId]
      );

      // Rate limit delay between batches
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Mark as ready — document is now searchable
    await client.query(
      `UPDATE documents
       SET status = 'ready', chunk_count = $1, chunks_processed = $1
       WHERE id = $2
       AND user_id=$3`,
      [chunks.length, documentId,userId]
    );

    console.log(
      `✅ Async indexing complete: document=${documentId}`
    );

    console.log(`✅ Async indexing complete: document ${documentId}, ${chunks.length} chunks`);

  } catch (err) {
    console.error(`❌ Async indexing failed for document ${documentId}:`, err.message);

    // Update status to failed with the error message
    // Try to mark the document as failed.
    if (client) {
      try {
        await client.query(
          `UPDATE documents
           SET status = 'failed',
               error_message = $1
           WHERE id = $2
             AND user_id = $3`,
          [
            err.message,
            documentId,
            userId
          ]
        );
      } catch (updateErr) {
        console.error(
          `❌ Could not mark document as failed:`,
          updateErr
        );
      }
    }

  }finally {
      if (client) {
        try {
          await client.query(
            `RESET app.current_user_id`
          );
        } catch (resetErr) {
          console.error(
            "Failed to reset RLS context:",
            resetErr.message
          );
        }

        client.release();
      }

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupErr) {
          console.error(
            "Failed to delete temporary PDF:",
            cleanupErr.message
          );
        }
      }
    }
}
