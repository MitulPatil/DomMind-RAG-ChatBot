import jwt from "jsonwebtoken";
import config from "../config.js";
import { pool } from "../db/db.js";

export async function verifyToken(req, res, next) {
    // Every protected route passes through this middleware.

    const authHeader = req.headers["authorization"];

    // 1. Check Authorization header
    if (!authHeader) {
        return res.status(401).json({
            status: "error",
            message: "Access denied. No token provided."
        });
    }

    // 2. Validate Bearer token format
    const parts = authHeader.trim().split(/\s+/);

    if (parts.length !== 2 || parts[0] !== "Bearer") {
        const err = new Error(
            "Token format invalid. Use: Authorization: Bearer <Token>"
        );
        err.status = 401;
        return next(err);
    }

    const token = parts[1];

    let decoded;

    // 3. Verify JWT
    try {
        decoded = jwt.verify(token, config.jwtSecret, {
            algorithms: ["HS256"]
        });
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            const error = new Error(
                "Token expired. Please log in again."
            );
            error.status = 401;
            error.code = "TOKEN_EXPIRED";
            return next(error);
        }

        if (err.name === "JsonWebTokenError") {
            const error = new Error(
                "Invalid authentication token."
            );
            error.status = 401;
            error.code = "TOKEN_INVALID";
            return next(error);
        }

        const error = new Error("Authentication failed.");
        error.status = 401;
        error.code = "AUTH_FAILED";
        return next(error);
    }

    // 4. Validate user ID from JWT
    if (!decoded.id || !Number.isInteger(Number(decoded.id))) {
        const err = new Error("Invalid user identity in token.");
        err.status = 401;
        err.code = "INVALID_USER_ID";
        return next(err);
    }

    const userId = Number(decoded.id);

    // 5. Attach authenticated user to request
    req.user = {
        id: userId,
        email: decoded.email
    };

    let client;

    try {
        // 6. Get a dedicated PostgreSQL connection
        client = await pool.connect();

        // 7. Set RLS context on THIS connection
        await client.query(
            `SELECT set_config('app.current_user_id', $1, false)`,
            [String(userId)]
        );

        // 8. Make this connection available to protected controllers
        req.db = client;

        let cleanedUp = false;

        // 9. Release the connection when the HTTP request finishes
        const cleanup = async () => {
            if (cleanedUp) return;
            cleanedUp = true;

            try {
                // Remove the user-specific RLS context
                // before returning the connection to the pool.
                await client.query(
                    `RESET app.current_user_id`
                );
            } catch (err) {
                console.error(
                    "Failed to reset RLS context:",
                    err.message
                );
            } finally {
                client.release();

                // Don't leave the client accessible after release.
                req.db = null;
            }
        };

        res.once("finish", cleanup);
        res.once("close", cleanup);

        // 10. Continue to the protected route
        return next();

    } catch (err) {

        // If connection was acquired but RLS setup failed,
        // return it to the pool.
        if (client) {
            try {
                await client.query(
                    `RESET app.current_user_id`
                );
            } catch {}

            client.release();
        }

        console.error(
            "Failed to establish RLS context:",
            err.message
        );

        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
}