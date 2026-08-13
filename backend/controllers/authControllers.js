import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import config from "../config.js";
import { pool, adminPool } from "../db/db.js";

export const register = async (req,res,next) => {
    try {
        const {email, password} = req.body;

        // Check if email already exists
        const existing = await adminPool.query(
            "SELECT id FROM users WHERE email = $1",
            [email.toLowerCase().trim()]
        );
        if (existing.rows.length > 0) {
            const err = new Error("An account with this email already exists");
            err.status = 400;
            return next(err);
        }
        
        const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

        const result = await adminPool.query(
            `INSERT INTO users(email, password_hash)
            VALUES ($1,$2)
            RETURNING id, email, created_at`,
            [email.toLowerCase().trim(), passwordHash]
        )

        res.status(200).json({
            success : true,
            user : result.rows[0]
        });
    } catch (err) {
        next(err);
    }
}

export const login = async (req,res,next) => {
    try {
        const {email, password} = req.body;

        const result = await adminPool.query(
            `SELECT id, email, password_hash FROM users WHERE email=$1`,
            [email.toLowerCase().trim()]
        );

        if(result.rows.length === 0){
            const err = new Error("email or password wrong");
            err.status = 404;
            return next(err);
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if(!passwordMatch){
            const err = new Error("email or password wrong");
            err.status = 404;
            return next(err);
        }

        const token = jwt.sign(
            { id : user.id, email : user.email },
            config.jwtSecret,
            {
                algorithm:  'HS256',
                expiresIn : "7d"
            }
        )

        const {password_hash, ...safeuser} = user;

        res.status(200).json({
            success : true,
            token,
            user : safeuser
        })

    } catch (err) {
        next(err);
    }
}

export const getMe = async (req, res, next) => {
  try {
    
    const result = await pool.query(`
        SELECT
            current_user,
            current_setting('app.current_user_id', true) AS rls_user_id
    `);

    console.log("RLS CONTEXT:", result.rows[0]);

    result = await pool.query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
            [req.user.id]
    );

    if (result.rowCount === 0) {
      const err = new Error("User no longer exists");
      err.status = 401;
      return next(err);
    }

    res.json({ success: true, user: result.rows[0] });

  } catch (err) {
    next(err);
  }
};


export const logout = (req, res) => {

    res.json({ success: true, message: 'Logged out successfully' });

};