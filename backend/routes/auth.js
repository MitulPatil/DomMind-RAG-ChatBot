// routes/auth.js
import express from 'express';
const router = express.Router();
import { register, login, getMe, logout } from '../controllers/authControllers.js';
import { verifyToken } from "../middleware/verifyToken.js";
import { validate } from "../middleware/validate.js";

// import { requireFields } from "../middleware/requireFields.js";

import { registerSchema, loginSchema } from "../schemas/authSchems.js";

// POST /api/v1/auth/register
// Public — no authentication required (users do not have an account yet)
router.post('/register', validate(registerSchema), register);

// POST /api/v1/auth/login
// Public — authentication is what THIS endpoint grants, not requires
router.post('/login', validate(loginSchema), login);

router.get('/me', verifyToken, getMe);
router.post('/logout', verifyToken, logout);


export default router;