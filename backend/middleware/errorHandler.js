// middleware/errorHandler.js
import config from "../config.js";

export const errorHandler = (err, req, res, next) => {
  console.error('ERROR:', err.message);

  // ZodError means schema.parse() (not safeParse()) was called and failed.
  // This can happen if you use .parse() directly in a controller.
  // Our validate middleware uses safeParse() so this is a safety net.
  if (err && Array.isArray(err.issues)) {
    return res.status(400).json({
      status:  'error',
      message: 'Validation failed',
      errors:  err.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  // PostgreSQL errors
  if (err.code === '23505') {
    return res.status(409).json({ status: 'error', message: 'Duplicate value — resource already exists' });
  }

  const statusCode = err.status || 500;
  res.status(statusCode).json({
    status:  'error',
    message: statusCode === 500 && !config.nodeEnv ? 'Internal server error' : err.message,
    ...(config.nodeEnv && { stack: err.stack }),
  });
};