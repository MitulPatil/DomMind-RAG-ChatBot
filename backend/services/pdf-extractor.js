import fs from "fs";
import {PDFParse} from "pdf-parse";

export async function safeExtractPdf(filepath) {
     // Guard 1: file must exist
    if(!fs.existsSync(filepath)){
        return {
            success : false,
            error : "File not found",
            hint : null
        }
    }

    // Guard 2: read the file into a buffer
    let dataBuffer;
    try {
        dataBuffer = fs.readFileSync(filepath);
    } catch (error) {
        return {
            success : false,
            error : `Cannot read file: ${error.message}`,
            hint : "Check file permission"
        }
    }

    // Guard 3: magic-byte check — PDF files always start with "%PDF-"
    // catches .txt or .docx files renamed to .pdf

    const header = dataBuffer.toString("ascii",0,5);
    if(header !== "%PDF-"){
        return {
            success : false,
            error : "File does not appear to be a valid PDF",
            hint : "Check that the file is not a renamed .txt or .docx"
        }
    }

    // Guard 4: attempt parsing with the v2 PDFParse class
    // catches password-protected, corrupted, or unsupported PDFs
    let textData;
    let textInfo;
    try {
        const parser = new PDFParse({data : dataBuffer});
        textData = await parser.getText();
        textInfo = await parser.getInfo();
    } catch (error) {
        return {
            success : false,
            error : `PDF parsing failed: ${error.message}`,
            hint : "This PDF may be password-protected, corrupted, or use an unsupported format"
        }
    }


    // Guard 5: confirm meaningful text was actually extracted
    // scanned PDFs parse "successfully" but return near-empty text

    const wordCount = textData.text.split(/\s+/).filter(w => w.length > 0).length;

    if(wordCount < 10){
        return {
            success : false,
            error : "PDF parsed but contains no extractable text",
            hint : "This PDF may be a scanned image — OCR would be required, which is not supported"
        }
    }

    return {
        success : true,
        pages : textData.pages.map(page => page.text),
        fullText : textData.text,
        numPages : textData.total,
        wordCount : wordCount,
        info : textInfo.info
    }
}