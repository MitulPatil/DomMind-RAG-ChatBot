import fs from "fs";
import { pool } from "../db/db.js";
import { indexPdf,indexPdfAsync } from "../services/pdf-indexer.js";
import { hybridSearch } from "../services/retriever.js";
import { generateAnswer, generateAnswerStream } from "../services/generator.js";

export const uploadPdf = async (req,res,next) => {
    if (!req.file) {
        const err = new Error("No file uploaded");
        err.status = 400;
        return next(err);
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const userId = req.user.id;
  
    try {
      // Check if already indexed
      const existing = await req.db.query(
        "SELECT id, status FROM documents WHERE filename = $1 AND user_id = $2",
        [originalName, userId]
      );
  
      if (existing.rows.length > 0) {
        // Already exists — clean up the new upload and return existing ID
        fs.unlinkSync(filePath);
        return res.json({
          success: true,
          documentId: existing.rows[0].id,
          filename: originalName,
          alreadyIndexed: true,
          status: existing.rows[0].status
        });
      }
  
      // Insert document record with status 'processing'
      // This returns immediately — indexing happens in background
      const docResult = await req.db.query(
        `INSERT INTO documents (filename, title, status, user_id, chunks_processed, total_chunks)
         VALUES ($1, $2, 'processing', $3, 0, 0)
         RETURNING id`,
        [originalName, originalName, userId]
      );
      const documentId = docResult.rows[0].id;
  
      // Start background indexing — intentionally NOT awaited
      // The function runs independently after this line
      indexPdfAsync(documentId, filePath, userId);
      // filePath is passed to the background function — it will delete the file
      // when indexing completes. We do NOT delete it here.
  
      // Return immediately with documentId and processing status
      // Client should poll GET /documents/:id to track progress
      res.json({
        success: true,
        documentId,
        filename: originalName,
        alreadyIndexed: false,
        status: "processing",
        message: "PDF received. Indexing in progress — poll GET /documents/:id for status."
      });
  
    }catch (error) {
        // Clean up temp file if something failed before background indexing started
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch {}
        }
        console.error("Upload error:", error.message);
        const err = new Error(error.message);
        err.status = 500;
        err.success = false;
        next(err);
    }
}

export const askQuestion = async (req,res,next) => {
    const {documentId, question} = req.body;
    const userId = req.user.id;

    try {
        // Keep the document scoped to the authenticated user.
        const docresult = await req.db.query(
            `SELECT id, filename FROM documents WHERE id = $1 AND user_id = $2`,
            [documentId, userId]
        )

        if(docresult.rows.length === 0){
            const err = new Error(`Document with id ${documentId} not found`);
            err.status = 404;
            err.hint = "Upload the PDF first using POST /upload"
            return next(err);
        }
        const retrieval = await hybridSearch(question.trim(), documentId, req.user.id, 3);

        if(retrieval.gated){
            return res.json({
                success : true,
                documentId,
                question : question.trim(),
                answer : "The document does not contain relevant information to answer this question.",
                citations : [],
                retrievedChunks : [],
                debug : {
                    gated : true,
                    reason : retrieval.reason,
                    topSimilarity: retrieval.topSimilarity ?? null,
                    keywordCount: retrieval.keywordCount
                }
            })
        }

        const result = await generateAnswer(question.trim(), retrieval.chunks);

        res.json({
            success: true,
            documentId,
            question: question.trim(),
            answer: result.answer,
            citations: result.citations,
            retrievedChunks: result.retrievedChunks,
            debug: {
                gated: false,
                topSimilarity: retrieval.topSimilarity,
                keywordCount: retrieval.keywordCount,
                chunksAfterGate: retrieval.chunks.length,
                // true = chunks passed gate but LLM still refused
                // use this to tune ABSOLUTE_MINIMUM upward if it fires often
                refuse : result.citations.length === 0,
            }
        });        
    } catch (error) {
        console.error("Ask error:", error.message);
        const err = new Error(error.message);
        err.status = 500;
        err.success = false;
        next(err);       
    }
}

export const askStreamQuestion = async (req,res,next) => {
    let {documentId, question} = req.body;
    const userId = req.user.id;

    res.setHeader("Content-type","text/event-stream");
    res.setHeader("Cache-Control","no-cache");
    res.setHeader("Connection","keep-alive");
    res.setHeader("X-Accel-Buffering","no");

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    try {
        const docResult = await req.db.query(
        "SELECT id, filename, status FROM documents WHERE id = $1 AND user_id = $2",
        [documentId, userId]
       ) 

       if(docResult.rows.length === 0){
        sendEvent({type : "error", message : `Document ${documentId} is not found`});
        res.end();
        return;
       }

       if(docResult.rows[0].status !== "ready"){
        sendEvent({type : "error", message : "Document is still being Processed"});
        res.end();
        return;
       }

         const retrieval = await hybridSearch(question.trim(), documentId, userId, req.db, 3);

       if(retrieval.gated){
        sendEvent({
            type : "token",
            text : "The document does not contain relevant information to answer this question."
        });
        sendEvent({type : "citations",citations : []});
        sendEvent({type : "done"});
        res.end();
        return
       }

         await generateAnswerStream(res, question.trim(), retrieval.chunks, documentId, userId, retrieval, req.db);

       res.end();
    } catch (error) {
        console.error("Stream error:", error.message);
        try {
            sendEvent({type : "error", message : `${error.message}`});
            res.end();
        } catch {
            
        } 
    }
}

export const getAllConversation = async (req,res,next) => {

    const userId = req.user.id;  
    const { documentId } = req.params;

    try {
        const docCheck = await req.db.query(
            "SELECT id FROM documents WHERE id = $1 AND user_id = $2",
            [documentId, userId]
        );

        if (docCheck.rows.length === 0) {
            const err = new Error(`Document ${documentId} not found`);
            err.status = 404;
            return next(err);
        }

        const result = await req.db.query(
            `SELECT id, question, answer, citations, created_at
            FROM conversations
            WHERE document_id=$1
            AND user_id = $2
            ORDER BY created_at ASC`,
            [documentId, userId]
        );

        res.json({
            success : true,
            documentId,
            conversations : result.rows.map(row=>({
                id : row.id,
                question : row.question,
                answer : row.answer,
                citations : row.citations || [],
                // citations is stored as JSONB — comes back as a JS object already
                // no JSON.parse needed — pg handles JSONB deserialization automatically
                createdAt : row.created_at
            }))
        })        
    } catch (error) {
        const err = new Error(error.message);
        err.status = 500;
        next(err);
    }
}

export const getConversationById = async (req,res,next) => {
    const { documentId, conversationId } = req.params;
    const userId = req.user.id;

    try {
        const result = await req.db.query(
            `SELECT id, question, answer, citations, created_at
            FROM conversations
            WHERE id = $1 AND document_id = $2 AND user_id = $3`,
            [conversationId, documentId, userId]
        );

        if(result.rows.length === 0){
            const err = new Error(`Conversation ${conversationId} not found in document ${documentId}`);
            err.status = 404;
            return next(err);
        }

        const row = result.rows[0];

        res.json({
            success : true,
            conversation :{
                id : row.id,
                question : row.question,
                answer : row.answer,
                citations : row.citations || [],
                createdAt : row.created_at
            }
        })        
    } catch (error) {
        const err = new Error(error.message);
        err.status = 500;
        next(err);
    }
}

export const deleteConversationById = async (req,res,next) => {
    const { documentId, conversationId } = req.params;
    const userId = req.user.id;

    try {
        const result = await req.db.query(
        `DELETE FROM conversations
        WHERE id = $1 AND document_id = $2 AND user_id = $3
        RETURNING id`,
        [conversationId, documentId, userId]
        );

        if (result.rows.length === 0) {
            const err = new Error("Conversation not found");
            err.status = 404;
            return next(err);
        }

        res.json({ success: true, deleted: { conversationId } });
        
    } catch (error) {
        const err = new Error(error.message);
        err.status = 500;
        next(err);
    }
}

export const getAllDocuments = async (req,res,next) => {
    const userId = req.user.id;

    try {
        const result = await req.db.query(
        `SELECT id, filename, title, status, num_pages, word_count,
                chunk_count, chunks_processed, total_chunks,
                error_message, created_at
        FROM documents
        WHERE user_id = $1
        ORDER BY created_at DESC`
        ,[userId]
        );
        res.json({ success: true, documents: result.rows });        
    } catch (error) {
        const err = new Error(error.message);
        err.status = 500;
        next(err);
    }
}

export const getDocumentById = async (req,res,next) => {
    const documentId = parseInt(req.params.id);
    const userId = req.user.id;

    try {
        const result = await req.db.query(
          `SELECT id, filename, title, status, num_pages, word_count,
                  chunk_count, chunks_processed, total_chunks,
                  error_message, created_at
           FROM documents WHERE id = $1 AND user_id = $2`,
          [documentId, userId]
        );
    
        if (result.rows.length === 0) {
            const err = new Error(`Document ${documentId} not found`);
            err.status = 404;
            return next(err);
        }
    
        const doc = result.rows[0];
    
        // Compute progress percentage for the frontend progress bar
        const progress = doc.total_chunks > 0
          ? Math.round((doc.chunks_processed / doc.total_chunks) * 100)
          : 0;
        // 0 when total_chunks not yet set (extraction phase)
        // 0-99 during embedding
        // 100 when status becomes 'ready'
    
        res.json({
          success: true,
          document: {
            id: doc.id,
            filename: doc.filename,
            title: doc.title,
            status: doc.status,           // 'processing' | 'ready' | 'failed'
            numPages: doc.num_pages,
            wordCount: doc.word_count,
            chunkCount: doc.chunk_count,
            chunksProcessed: doc.chunks_processed,
            totalChunks: doc.total_chunks,
            progress,                      // 0-100 percentage
            errorMessage: doc.error_message,
            createdAt: doc.created_at
          }
        });
    } catch (error) {
        const err = new Error(error.message);
        err.status = 500;
        next(err);
    }
}

export const getChunkById = async (req,res,next) => {
    const chunkId = parseInt(req.params.id);
    const userId = req.user.id;

    try {
        const result = await req.db.query(
          `SELECT
             id,
             document_id,
             content,
             chunk_index,
             start_page,
             end_page,
             word_count
           FROM chunks
           WHERE id = $1 AND user_id = $2`,
          [chunkId, userId]
        );
        // Note: no embedding column — the vector is large (3072 floats) and
        // the frontend has no use for it. Never fetch data you don't need.
    
        if (result.rows.length === 0) {
            const err = new Error(`Chunk ${chunkId} not found`);
            err.status = 404;
            return next(err);
        }
    
        const chunk = result.rows[0];
        res.json({
            success: true,
            chunk: {
                id: chunk.id,
                documentId: chunk.document_id,
                content: chunk.content,          // full text — not just 150-char preview
                chunkIndex: chunk.chunk_index,
                pageReference: chunk.start_page === chunk.end_page
                ? `page ${chunk.start_page}`
                : `pages ${chunk.start_page}–${chunk.end_page}`,
                startPage: chunk.start_page,
                endPage: chunk.end_page,
                wordCount: chunk.word_count
            }
        });
    } catch (error) {
        const err = new Error(error.message);
        err.status = 500;
        next(err);
    }
}

export const deleteDocumentById = async (req,res,next) => {
    const docId = parseInt(req.params.id);
    const userId = req.user.id;

    if(isNaN(docId)){
        return res.status(400).json({error : "document id should be number"});
    }

    try {
        const result  = await req.db.query(
            `DELETE FROM documents WHERE id=$1 AND user_id = $2 RETURNING id,filename`,[docId, userId]
        );

        if(result.rows.length === 0){
            const err = new Error(`Document ${docId} is not found`);
            err.status = 500;
            return next(err);
        }

        res.json({
            success : true,
            deleted : {
                documentId : result.rows[0].id,
                filename : result.rows[0].filename
            }
        });    
    } catch (error) {
        const err = new Error(error.message);
        err.status = 500;
        err.success = false;
        next(err);
    }
}

export const getUsage = async (req,res) => {
    try {
        const days = Math.min(parseInt(req.query.days) || 30, 90);
        // Cap at 90 days — queries beyond that are slow without additional indexing

        const { getUserUsageSummary } = await import("../services/cost-tracker.js");
        const summary = await getUserUsageSummary(req.user.id, days);

        res.json({ success: true, usage: summary });
    } catch (err) {
        console.error("Usage endpoint error:", err.message);
        res.status(500).json({ error: err.message });
    }
}
