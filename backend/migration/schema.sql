-- schema-v3.sql
-- Complete DocMind V3 schema
-- Run as postgres superuser: psql -U postgres -d semantic_search_db -f schema-v3.sql

-- ── EXTENSIONS ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- ── TABLES ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL    PRIMARY KEY,
  email         TEXT      NOT NULL UNIQUE,
  password_hash TEXT      NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id                SERIAL    PRIMARY KEY,
  user_id           INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename          TEXT      NOT NULL,
  title             TEXT,
  status            TEXT      NOT NULL DEFAULT 'processing',
  num_pages         INTEGER,
  word_count        INTEGER,
  chunk_count       INTEGER,
  chunks_processed  INTEGER   DEFAULT 0,
  total_chunks      INTEGER   DEFAULT 0,
  error_message     TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunks (
  id          SERIAL       PRIMARY KEY,
  document_id INTEGER      NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT         NOT NULL,
  chunk_index INTEGER      NOT NULL,
  word_count  INTEGER,
  start_word  INTEGER,
  end_word    INTEGER,
  start_page  INTEGER      NOT NULL,
  end_page    INTEGER      NOT NULL,
  embedding   vector(3072) NOT NULL,
  content_tsv tsvector     GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

CREATE TABLE IF NOT EXISTS conversations (
  id          SERIAL    PRIMARY KEY,
  document_id INTEGER   NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question    TEXT      NOT NULL,
  answer      TEXT      NOT NULL,
  citations   JSONB     DEFAULT '[]',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id                SERIAL    PRIMARY KEY,
  document_id       INTEGER   REFERENCES documents(id),
  user_id           INTEGER   REFERENCES users(id),
  question          TEXT      NOT NULL,
  top_similarity    DECIMAL,
  context_precision DECIMAL,
  overall_quality   TEXT,
  chunk_count       INTEGER,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- ── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_content_tsv ON chunks USING gin(content_tsv);
CREATE INDEX IF NOT EXISTS idx_conversations_document_id ON conversations(document_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_logs(created_at);

-- ── APPLICATION USER ────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'docmind_app') THEN
    CREATE USER docmind_app WITH PASSWORD 'docmind_app_password_change_this';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE semantic_search_db TO docmind_app;
GRANT USAGE ON SCHEMA public TO docmind_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO docmind_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO docmind_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO docmind_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO docmind_app;

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────────

ALTER TABLE documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_isolation ON documents;
DROP POLICY IF EXISTS user_isolation ON chunks;
DROP POLICY IF EXISTS user_isolation ON conversations;
DROP POLICY IF EXISTS user_self_only ON users;

CREATE POLICY user_isolation ON documents
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

CREATE POLICY user_isolation ON chunks
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

CREATE POLICY user_isolation ON conversations
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

CREATE POLICY user_self_only ON users
  FOR ALL USING (id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (id = current_setting('app.current_user_id', true)::integer);