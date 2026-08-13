-- Add to schema.sql
CREATE TABLE IF NOT EXISTS evaluation_logs (
  id              SERIAL    PRIMARY KEY,
  document_id     INTEGER   REFERENCES documents(id),
  question        TEXT      NOT NULL,
  top_similarity  DECIMAL,
  context_precision DECIMAL,
  overall_quality TEXT,
  chunk_count     INTEGER,
  keyword_count   INTEGER,
  created_at      TIMESTAMP DEFAULT NOW()
);