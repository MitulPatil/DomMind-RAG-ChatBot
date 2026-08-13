-- API usage logging table
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id                  SERIAL    PRIMARY KEY,
  user_id             INTEGER   REFERENCES users(id) ON DELETE SET NULL,
  document_id         INTEGER   REFERENCES documents(id) ON DELETE SET NULL,
  operation           TEXT      NOT NULL,
  -- 'embedding', 'generation', 'generation_stream', 'judge'
  model               TEXT      NOT NULL,
  prompt_tokens       INTEGER   NOT NULL DEFAULT 0,
  completion_tokens   INTEGER   NOT NULL DEFAULT 0,
  total_tokens        INTEGER   NOT NULL DEFAULT 0,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_logs(created_at);