// import {pool} from "../db/db.js";

export async function validateDocumentAccess(documentId, userId, db) {
    const id = parseInt(documentId);
    const ownerId = parseInt(userId);

    if(isNaN(id) || id<=0){
        throw new Error(`Invalid Documentid : "${documentId}"`);
    }

    if(isNaN(ownerId) || ownerId<=0){
        throw new Error("Authenticated user context is required to access documents");
    }

    const result = await db.query(
        `SELECT id, filename , status, chunk_count
        FROM documents
        WHERE id = $1 AND user_id = $2`,[id,ownerId]
    )

    if(result.rows.length === 0){
        throw new Error(`Document ${id} not found. Upload PDF first`);
    }

    const doc = result.rows[0];

    if(doc.status === "processing"){
        throw new Error(
            `Document "${doc.filename}" is still being indexed. `+
            `Please wait a few seconds and try again`
        );
    }

    if(doc.status === "failed"){
        throw new Error(
            `Document "${doc.filename}" failed to index. `+
            `Please delete it and upload again.`
        );
    }

    if(doc.status !== "ready"){
        throw new Error(`Document "${doc.filename}" has unknown status: ${doc.status}`);
    }

    if(!doc.chunk_count || doc.chunk_count === 0){
        throw new Error(
            `Document "${doc.filename}" has no indexed chunks.`+
            `This may indicate an indexing error`
        );
    }

    return doc;
}
