-- Enable RLS on every table that contains user data
ALTER TABLE documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Create isolation policies
-- FOR ALL covers SELECT, INSERT, UPDATE, DELETE
-- true as second arg to current_setting prevents errors when variable is unset

CREATE POLICY user_isolation ON documents
  FOR ALL
  USING (
    user_id = current_setting('app.current_user_id', true)::integer
  )
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)::integer
  );

CREATE POLICY user_isolation ON chunks
  FOR ALL
  USING (
    user_id = current_setting('app.current_user_id', true)::integer
  )
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)::integer
  );

CREATE POLICY user_isolation ON conversations
  FOR ALL
  USING (
    user_id = current_setting('app.current_user_id', true)::integer
  )
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)::integer
  );

-- The users table itself should NOT have RLS on SELECT
-- (users need to read their own row for login checks)
-- But it should prevent reading other users' rows
CREATE POLICY user_self_only ON users
  FOR ALL
  USING (id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (id = current_setting('app.current_user_id', true)::integer);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- EXCEPTION: login and register need to read/write users without a current user set
-- Create a separate policy for unauthenticated operations
-- Or handle auth operations using the postgres superuser (which bypasses RLS)
-- and everything else using docmind_app