import z from 'zod';

export const registerSchema = z.object({
  email: z.string()
    .trim()
    .toLowerCase()
    // .email() validates email format using the HTML5 email algorithm.
    // More thorough than a manual .includes('@') check.
    .email({ message: 'Please provide a valid email address' })
    .max(255, { message: 'Email must be 255 characters or less' }),

  password: z.string()
    // .min() before any transformation — check the RAW password.
    // Never trim passwords — a password with leading spaces is valid.
    .min(8,   { message: 'Password must be at least 8 characters' })
    .max(72,  { message: 'Password must be 72 characters or less' }),
    // bcrypt has a maximum effective length of 72 bytes.
    // Characters beyond 72 are silently ignored.
    // Inform the user rather than silently accepting an ineffective long password.
});

export const loginSchema = z.object({
  email: z.string()
    .trim()
    .toLowerCase()
    .email({ message: 'Please provide a valid email address' }),

  password: z.string()
    .min(1, { message: 'Password is required' }),
    // On login: just check it is present. The bcrypt compare handles validation.
    // Do NOT re-apply min(8) here — users who registered before stricter rules
    // should still be able to log in with shorter passwords.
});