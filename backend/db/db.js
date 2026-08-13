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
  config.AdminDbUrl
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
