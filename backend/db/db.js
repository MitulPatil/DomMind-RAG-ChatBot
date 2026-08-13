import pg from "pg";
import config from "../config.js"

const {Pool} = pg;

export const pool = new Pool(
    config.dbUrl 
    ? {
        connectionString : config.dbUrl,
        ssl : {
            rejectUnauthorized : false
        }
    }
    : {
        user: "docmind_app",
        host: "localhost",
        database: "PdfParse_semantic_db",
        password: config.newDbUserPass,
        port: 5432
    }
) 


// Admin pool — connects as postgres superuser (bypasses RLS)
// Use ONLY for auth operations: register, login
// Never use this pool in routes that handle user data
export const adminPool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: config.AdminDbUrl,
        ssl: { rejectUnauthorized: false }
      }
    : {
        user: "postgres",
        host: "localhost",
        database: "PdfParse_semantic_db",
        password: config.dbPass,
        port: 5432
      }
);


// setRlsContext — sets the session variable RLS policies read
// Call this at the start of every authenticated request
// before running any queries with the main pool
export async function setRlsContext(userId) {
  await pool.query(
    `SELECT set_config('app.current_user_id', $1::text, true)`,
    [userId.toString()]
    // true = transaction-scoped (resets after transaction ends)
    // This prevents the context from leaking between requests
    // in a connection pool where connections are reused
  );
}