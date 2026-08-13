import express from "express";
const router = express.Router();

import { upload } from "../services/fileupload.js";

import { 
    uploadPdf,
    askQuestion,
    askStreamQuestion,
    getAllConversation,
    getConversationById,
    deleteConversationById,
    getAllDocuments,
    getDocumentById,
    getChunkById,
    deleteDocumentById,
    getUsage
} from "../controllers/RagControllers.js"

// middleware
import { validate } from "../middleware/validate.js";
import { validateParams } from "../middleware/validateParams.js";

// Zod schemas

import { conversationParamsSchema, conversationDocumentIdParamSchema, documentIdParamSchema, chunkIdParamSchema} from "../schemas/IdSchema.js";
import { askQuestionSchema} from "../schemas/ragSchema.js";

router.post("/upload", upload.single("pdf"), uploadPdf);
router.post("/ask", validate(askQuestionSchema), askQuestion);
router.post("/ask-stream", validate(askQuestionSchema), askStreamQuestion);
router.get("/conversations/:documentId", validateParams(conversationDocumentIdParamSchema), getAllConversation);
router.get("/conversation/:documentId/:conversationId", validateParams(conversationParamsSchema), getConversationById);
router.delete("/conversations/:documentId/:conversationId", validateParams(conversationParamsSchema), deleteConversationById);
router.get("/documents", getAllDocuments);
router.get("/documents/:id", validateParams(documentIdParamSchema), getDocumentById);
router.get("/chunks/:id", validateParams(chunkIdParamSchema), getChunkById);
router.delete("/documents/:id", validateParams(documentIdParamSchema),  deleteDocumentById);
router.get('/usage', getUsage);

export default router;