import ZodError from "zod";

// ZodError is the error class thrown by schema.parse().
// We import it to check err instanceof ZodError in the error handler.

// validate() is a middleware FACTORY.
// It takes a Zod schema and returns a middleware function.
// This is the same factory pattern as requireRole() from the auth sessions.

export function validate(schema){
    // The returned function is the actual middleware.
    // It has access to 'schema' via closure.
    return (req, res, next) => {
        // safeParse() never throws — returns success/error object.
        // We parse req.body — the request body sent by the client.
        const result = schema.safeParse(req.body);

        if (!result.success) {
        // Validation failed. Map Zod's issues array to a client-friendly format.
        // result.error.issues = array of { path, message, code }
        const errors = result.error.issues.map(issue => ({
            // issue.path is an array: ['tags', 0] for nested paths, ['title'] for top-level.
            // .join('.') turns ['tags', 0] into 'tags.0' — readable field identifier.
            field:   issue.path.join('.') || 'root',
            message: issue.message,
            // code is optional — helpful for frontend form libraries that handle specific codes.
            code:    issue.code,
        }));

        // 400 Bad Request — the client sent invalid data.
        // Return the structured errors array so the client knows exactly what to fix.
        return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors,  // [{ field: 'title', message: 'Required', code: 'invalid_type' }, ...]
        });
        }

        // Validation passed.
        // result.data is the PARSED data — not the raw req.body.
        // This matters because Zod may have applied transformations:
        //   .default() fills in missing optional fields
        //   .trim() removes whitespace
        //   .toLowerCase() normalises case
        //   .transform() applies custom transformations
        // By replacing req.body with result.data, your controller gets clean data.
        req.body = result.data;

        // Pass control to the next middleware or controller.
        next();
    }
}