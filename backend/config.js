import dotenv from "dotenv";

dotenv.config();

const keys = ["GEMINI_API_KEY"];

keys.forEach(key => {
    if(!process.env[key]){
        console.error(`FATAL: missing required environment variable : ${key}`);
        console.error(`check your .env file or development environment settings`);
        process.exit(1);
    }
});

export const config = {
    port : parseInt(process.env.PORT,10) || 3000,
    nodeEnv : process.env.NODE_ENV || "development",
    clientUrl : process.env.CLIENT_URL || "http://localhost:5713",
    geminiApiKey : process.env.GEMINI_API_KEY,
    appName : process.env.APP_NAME || "DOCMIND",
    dbPass : process.env.DB_PASSWORD,
    dbUrl : process.env.DATABASE_URL,
    AdminDbUrl : process.env.ADMIN_DATABASE_URL,
    jwtSecret : process.env.JWT_SECRET,
    jwtExpiresIn : process.env.JWT_EXPIRES_IN || '7d',
    bcryptRounds : parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
    newDbUserPass : process.env.NEW_DB_USER_PASS
}

export default config;