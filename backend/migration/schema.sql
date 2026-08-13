-- schema.sql
-- DocMind V2 schema with async indexing progress and conversation history.

CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS chunks;
DROP TABLE IF EXISTS documents;

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  title TEXT,
  num_pages INTEGER,
  word_count INTEGER,
  chunk_count INTEGER,
  status TEXT NOT NULL DEFAULT 'processing',
  chunks_processed INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  word_count INTEGER,
  start_word INTEGER,
  end_word INTEGER,
  start_page INTEGER NOT NULL,
  end_page INTEGER NOT NULL,
  embedding vector(3072) NOT NULL,
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chunks_document_id ON chunks(document_id);
CREATE INDEX idx_chunks_content_tsv ON chunks USING gin(content_tsv);
CREATE INDEX idx_conversations_document_id ON conversations(document_id);
