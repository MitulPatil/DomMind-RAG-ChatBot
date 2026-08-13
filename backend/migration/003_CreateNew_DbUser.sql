-- Create a non-superuser application user
CREATE USER docmind_app WITH PASSWORD 'choose_a_strong_password_here';

-- Grant necessary permissions on all current and future tables
GRANT CONNECT ON DATABASE semantic_search_db TO docmind_app;
GRANT USAGE ON SCHEMA public TO docmind_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO docmind_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO docmind_app;

-- Make future tables also accessible (for any new tables you create)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO docmind_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO docmind_app;