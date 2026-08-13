import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "uploads");

// Create the uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// multer handles multipart/form-data — the format browsers use for file uploads
// diskStorage saves files to disk so pdf-parse can read them by path

// This code is configuring Multer so your server knows where to save uploaded PDFs, how to name them, and what files to allow.

// cb(error, result) 

const storage = multer.diskStorage({
    destination : (req,file,cb) => {
        cb(null,uploadsDir);
        // cb(error, destination) — null means no error
    },
    filename : (req,file,cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`
        cb(null,uniqueName);
    }
})

export const upload = multer({
    storage,
    limits : {fileSize : 20 * 1024 * 1024},
    fileFilter : (req,file,cb)=> {
        if(file.mimetype === "application/pdf"){
            cb(null, true);
        }else {
            cb(new Error("Only PDF files are accepted"), false);
        }
    }
})