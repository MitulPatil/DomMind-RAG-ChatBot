import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import config from "./config.js";
import { pool } from "./db/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { verifyToken } from "./middleware/verifyToken.js";

import RagRouter from "./routes/Ragroutes.js";
import authRouter from "./routes/auth.js";

const app = express();

const corsOptions = {
  origin: config.clientUrl,
  credentials: true
};

app.use(helmet());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use(morgan("dev"));
app.use(requestLogger);


// ─────────────────────────────────────────────────────────────
// Public routes
// ─────────────────────────────────────────────────────────────

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      app: config.appName,
      environment: config.nodeEnv,
      database: "connected",
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    res.status(503).json({
      status: "degraded",
      database: "unreachable",
      error:
        config.nodeEnv === "development"
          ? err.message
          : "Database connection failed"
    });
  }
});


app.use("/api/v1/auth", authRouter);


// ─────────────────────────────────────────────────────────────
// Protected routes
// ─────────────────────────────────────────────────────────────

app.use(verifyToken);

app.use("/api/v1/rag", RagRouter);


// ─────────────────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);


// ─────────────────────────────────────────────────────────────
// Startup
// ─────────────────────────────────────────────────────────────

const startServer = async () => {
  try {
    const dbCheck = await pool.query(
      "SELECT NOW() AS startup_time"
    );

    console.log(
      `Database connected at: ${dbCheck.rows[0].startup_time}`
    );

    app.listen(config.port, "0.0.0.0", () => {
      console.log(
        `${config.appName} running on port ${config.port} [${config.nodeEnv}]`
      );
    });

  } catch (err) {
    console.error("Failed to start server:", err.message);
    console.error("Check DATABASE_URL and Supabase connectivity.");
    process.exit(1);
  }
};

startServer();