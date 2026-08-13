export function validateParams (schema){
    return (req, res, next) => {
        const result = schema.safeParse(req.params);

        if (!result.success) {
            return res.status(400).json({
            status: 'error',
            message: 'Invalid URL parameter',
            errors: result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
            });
        }
        
        req.params = result.data; // req.params.id is now a number, not a string
        next();
    }
}