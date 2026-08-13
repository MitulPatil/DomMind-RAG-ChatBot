import jwt from "jsonwebtoken";
import config from "../config.js";
import { setRlsContext } from "../db/db.js";

export function verifyToken(req,res,next){
    // Every protected route passes through this function before the route handler runs.

    // Step 1: Read the Authorization header.
    // The JWT convention is: Authorization: Bearer <token>
    // "Bearer" is a token type identifier from the OAuth 2.0 spec.
    // It just means "the bearer of this token is authenticated."
    const authHeader = req.headers['authorization'];
    // Note: Node.js lowercases all header names. 'Authorization' becomes 'authorization'.

    // If no Authorization header at all — request has no credentials.
    if (!authHeader) {
        return res.status(401).json({
            status:  'error',
            message: 'Access denied. No token provided.',
        });
    }

    // Step 2: Extract the token from "Bearer <token>"
    // authHeader = "Bearer eyJhbGciOiJIUzI1NiIs..."
    // .split(' ') = ["Bearer", "eyJhbGciOiJIUzI1NiIs..."]
    // [1] = the token string
    const parts = authHeader.split(' ');

    // Validate the format: must be exactly "Bearer <token>", nothing else.
    // Malformed headers (just the token, or "Basic xyz", or extra spaces) are rejected.
    
    if(parts.length !== 2 || parts[0] !== "Bearer"){
        const err = new Error("Token format invalid. Use : Authorization: Bearer <Token>");
        err.status = 401;
        return next(err);
    }

    const token = parts[1];

    try {
        // Step 3: Verify the token.
        // jwt.verify() does three things simultaneously:
        //   a) Re-computes the signature using JWT_SECRET and compares to token's signature
        //   b) Checks that 'exp' claim has not passed
        //   c) Returns the decoded payload if both checks pass
        //
        // If signature is invalid: throws JsonWebTokenError
        // If token is expired:     throws TokenExpiredError
        // If token is malformed:   throws JsonWebTokenError
        const decode = jwt.verify(token, config.jwtSecret,{
            // Always specify the expected algorithm.
            // Prevents the 'alg: none' attack where an attacker removes the signature
            // and sets the algorithm to 'none', claiming no verification is needed.
            // jsonwebtoken v9+ rejects 'none' by default, but explicit is safer.
            algorithms: ['HS256'],
            }
        );

        // decoded = { id: 3, email: 'mitul@devlog.com', iat: ..., exp: ... }

        // Step 4: Attach the decoded payload to the request object.
        // req.user is now available in every route handler downstream.
        // The route handler never needs to re-query the database for user identity —
        // the verified token payload contains what it needs.

        req.user = {
            id : decode.id,
            email : decode.email,
            // Deliberately pick only what you need — do not spread the entire decoded payload.
            // decoded also contains iat and exp — route handlers do not need those.
        }

        // Set the RLS context so PostgreSQL policies know who is making this request.
        // The route handler runs only after this promise resolves.
        setRlsContext(decode.id)
            .then(() => next())
            .catch(err => {
                console.error("Failed to set RLS context:", err.message);
                res.status(500).json({ error: "Internal server error" });
            });
    } catch (err) {
        // jwt.verify() throws on any failure.
        // Distinguish between "expired" and "invalid" for better client-side handling.
        if (err.name === 'TokenExpiredError') {
            // The token was valid but the exp timestamp has passed.
            // The client should redirect to the login page and prompt re-authentication.
            const err = new Error("Token expired, Please log in again.");
            err.status = 401;
            err.code = 'TOKEN_EXPIRED'; // client can check this code to know what to do
            return next(err);
        }

        // JsonWebTokenError: signature invalid, malformed token, wrong algorithm.
        // This covers tampering, using the wrong secret, and corrupted tokens.
        if (err.name === 'JsonWebTokenError') {
            const err = new Error("Invalid authentication Token.");
            err.status = 401;
            err.code = 'TOKEN_INVALID'; // client can check this code to know what to do
            return next(err);
        }

        err = new Error("Authentication failed.");
        err.status = 401;
        err.code = 'AUTH_FAILED'; // client can check this code to know what to do
        return next(err);
    }
}