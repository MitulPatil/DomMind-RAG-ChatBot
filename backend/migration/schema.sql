-- ============================================================
-- DocMind - Production Database Schema
-- PostgreSQL + pgvector + Row Level Security
--
-- Designed for:
--   Supabase PostgreSQL
--
-- Application:
--   DocMind RAG PDF Question Answering
--
-- IMPORTANT:
--   - Do NOT put database passwords in this file.
--   - Configure database credentials through environment variables.
--   - This schema intentionally does NOT create an application role.
--   - pgvector is used for 3072-dimensional Gemini embeddings.
--   - No HNSW/IVFFlat index is created because the current
--     embedding dimension (3072) exceeds the HNSW limitation
--     encountered in this deployment.
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================
-- 2. USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,

    email           TEXT NOT NULL UNIQUE,

    password_hash   TEXT NOT NULL,

    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 3. DOCUMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
    id                  SERIAL PRIMARY KEY,

    user_id             INTEGER NOT NULL
                        REFERENCES users(id)
                        ON DELETE CASCADE,

    filename             TEXT NOT NULL,

    title                TEXT,

    status               TEXT NOT NULL DEFAULT 'processing',

    num_pages            INTEGER,

    word_count           INTEGER,

    chunk_count          INTEGER,

    chunks_processed     INTEGER NOT NULL DEFAULT 0,

    total_chunks         INTEGER NOT NULL DEFAULT 0,

    error_message        TEXT,

    created_at           TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT documents_status_check
        CHECK (
            status IN ('processing', 'ready', 'failed')
        )
);


-- ============================================================
-- 4. CHUNKS
-- ============================================================

CREATE TABLE IF NOT EXISTS chunks (
    id              SERIAL PRIMARY KEY,

    document_id     INTEGER NOT NULL
                    REFERENCES documents(id)
                    ON DELETE CASCADE,

    user_id         INTEGER NOT NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,

    content         TEXT NOT NULL,

    chunk_index     INTEGER NOT NULL,

    word_count      INTEGER,

    start_word      INTEGER,

    end_word        INTEGER,

    start_page      INTEGER NOT NULL,

    end_page        INTEGER NOT NULL,

    -- Gemini embedding model:
    -- gemini-embedding-001
    -- 3072 dimensions
    embedding       vector(3072) NOT NULL,

    -- PostgreSQL full-text search representation
    content_tsv     tsvector
                    GENERATED ALWAYS AS (
                        to_tsvector('english', content)
                    ) STORED
);


-- ============================================================
-- 5. CONVERSATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
    id              SERIAL PRIMARY KEY,

    document_id     INTEGER NOT NULL
                    REFERENCES documents(id)
                    ON DELETE CASCADE,

    user_id         INTEGER NOT NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,

    question        TEXT NOT NULL,

    answer          TEXT NOT NULL,

    citations       JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 6. EVALUATION LOGS
--
-- Stores RAG retrieval/evaluation metrics.
--
-- This table is intentionally separate from api_usage_logs.
--
-- evaluation_logs
--     -> RAG quality
--
-- api_usage_logs
--     -> Gemini/API token usage
-- ============================================================

CREATE TABLE IF NOT EXISTS evaluation_logs (
    id                  SERIAL PRIMARY KEY,

    document_id         INTEGER
                        REFERENCES documents(id)
                        ON DELETE CASCADE,

    user_id             INTEGER NOT NULL
                        REFERENCES users(id)
                        ON DELETE CASCADE,

    question            TEXT NOT NULL,

    top_similarity      DECIMAL,

    context_precision   DECIMAL,

    overall_quality     TEXT,

    chunk_count         INTEGER,

    keyword_count       INTEGER,

    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 7. API USAGE LOGS
--
-- Stores Gemini API token usage.
--
-- Operations can include:
--   embedding
--   generation
--   generation_stream
--   judge
-- ============================================================

CREATE TABLE IF NOT EXISTS api_usage_logs (
    id                  SERIAL PRIMARY KEY,

    user_id             INTEGER
                        REFERENCES users(id)
                        ON DELETE SET NULL,

    document_id         INTEGER
                        REFERENCES documents(id)
                        ON DELETE SET NULL,

    operation           TEXT NOT NULL,

    model               TEXT NOT NULL,

    prompt_tokens       INTEGER NOT NULL DEFAULT 0,

    completion_tokens   INTEGER NOT NULL DEFAULT 0,

    total_tokens        INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 8. INDEXES
-- ============================================================

-- -------------------------
-- Documents
-- -------------------------

CREATE INDEX IF NOT EXISTS idx_documents_user_id
ON documents(user_id);


-- -------------------------
-- Chunks
-- -------------------------

CREATE INDEX IF NOT EXISTS idx_chunks_document_id
ON chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_chunks_user_id
ON chunks(user_id);

-- PostgreSQL Full-Text Search
CREATE INDEX IF NOT EXISTS idx_chunks_content_tsv
ON chunks
USING GIN(content_tsv);


-- -------------------------
-- Conversations
-- -------------------------

CREATE INDEX IF NOT EXISTS idx_conversations_document_id
ON conversations(document_id);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
ON conversations(user_id);


-- -------------------------
-- Evaluation logs
-- -------------------------

CREATE INDEX IF NOT EXISTS idx_evaluation_logs_document_id
ON evaluation_logs(document_id);

CREATE INDEX IF NOT EXISTS idx_evaluation_logs_user_id
ON evaluation_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_evaluation_logs_created_at
ON evaluation_logs(created_at);


-- -------------------------
-- API usage logs
-- -------------------------

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id
ON api_usage_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_api_usage_document_id
ON api_usage_logs(document_id);

CREATE INDEX IF NOT EXISTS idx_api_usage_created_at
ON api_usage_logs(created_at);


-- ============================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users
ENABLE ROW LEVEL SECURITY;

ALTER TABLE documents
ENABLE ROW LEVEL SECURITY;

ALTER TABLE chunks
ENABLE ROW LEVEL SECURITY;

ALTER TABLE conversations
ENABLE ROW LEVEL SECURITY;

ALTER TABLE evaluation_logs
ENABLE ROW LEVEL SECURITY;

ALTER TABLE api_usage_logs
ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 10. DROP OLD POLICIES
--
-- Safe to run repeatedly.
-- ============================================================

DROP POLICY IF EXISTS user_self_only
ON users;

DROP POLICY IF EXISTS user_isolation
ON documents;

DROP POLICY IF EXISTS user_isolation
ON chunks;

DROP POLICY IF EXISTS user_isolation
ON conversations;

DROP POLICY IF EXISTS user_isolation
ON evaluation_logs;

DROP POLICY IF EXISTS user_isolation
ON api_usage_logs;


-- ============================================================
-- 11. USERS RLS
--
-- A user can access only their own user row.
-- ============================================================

CREATE POLICY user_self_only
ON users
FOR ALL
USING (
    id = current_setting(
        'app.current_user_id',
        true
    )::integer
)
WITH CHECK (
    id = current_setting(
        'app.current_user_id',
        true
    )::integer
);


-- ============================================================
-- 12. DOCUMENTS RLS
-- ============================================================

CREATE POLICY user_isolation
ON documents
FOR ALL
USING (
    user_id = current_setting(
        'app.current_user_id',
        true
    )::integer
)
WITH CHECK (
    user_id = current_setting(
        'app.current_user_id',
        true
    )::integer
);


-- ============================================================
-- 13. CHUNKS RLS
-- ============================================================

CREATE POLICY user_isolation
ON chunks
FOR ALL
USING (
    user_id = current_setting(
        'app.current_user_id',
        true
    )::integer
)
WITH CHECK (
    user_id = current_setting(
        'app.current_user_id',
        true
    )::integer
);


-- ============================================================
-- 14. CONVERSATIONS RLS
-- ============================================================

CREATE POLICY user_isolation
ON conversations
FOR ALL
USING (
    user_id = current_setting(
        'app.current_user_id',
        true
    )::integer
)
WITH CHECK (
    user_id = current_setting(
        'app.current_user_id',
        true
    )::integer
);


-- ============================================================
-- 15. EVALUATION LOGS RLS
-- ============================================================

CREATE POLICY user_isolation
ON evaluation_logs
FOR ALL
USING (
    user_id = current_setting(
        'app.current_user_id',
        true
    )::integer
)
WITH CHECK (
    user_id = current_setting(
        'app.current_user_id',
        true
    )::integer
);


-- ============================================================
-- 16. API USAGE LOGS RLS
-- ============================================================

CREATE POLICY user_isolation
ON api_usage_logs
FOR ALL
USING (
    user_id = current_setting(
        'app.current_user_id',
        true
    )::integer
)
WITH CHECK (
    user_id = current_setting(
        'app.current_user_id',
        true
    )::integer
);


-- ============================================================
-- 17. VERIFICATION QUERIES
--
-- Run these manually after the schema if you want to verify
-- the production database.
-- ============================================================

-- Check tables:
-- SELECT tablename
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;


-- Check pgvector:
-- SELECT extname, extversion
-- FROM pg_extension
-- WHERE extname = 'vector';


-- Check RLS:
-- SELECT
--     schemaname,
--     tablename,
--     rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;


-- Check policies:
-- SELECT
--     schemaname,
--     tablename,
--     policyname,
--     cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;


-- Check embedding dimension:
-- SELECT
--     column_name,
--     data_type,
--     udt_name
-- FROM information_schema.columns
-- WHERE table_name = 'chunks'
-- AND column_name = 'embedding';


-- ============================================================
-- END OF DOCMIND SCHEMA
-- ============================================================