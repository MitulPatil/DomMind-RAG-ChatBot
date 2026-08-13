export function cleanText(text){
    return text
    .replace(/\r\n/g, "\n")        // normalise Windows line endings → Unix
    .replace(/\r/g, "\n")          // handle old Mac line endings
    .replace(/\t/g, " ")           // tabs → spaces (tabs break word splitting)
    .replace(/[ ]{2,}/g, " ")      // multiple spaces → single space
    .replace(/\n{3,}/g, "\n\n")    // 3+ blank lines → 2 (preserve paragraph breaks)
    .replace(/[^\S\n]+$/gm, "")    // trim trailing whitespace from each line
    .trim();
}

export async function chunkText(text, chunkSize = 150, overlap = 30, minChunkWord=30){
    if(overlap >= chunkSize){
        throw new Error(
            `overlap (${overlap}) must be less than chunkSize (${chunkSize}). ` +
            `Otherwise chunks never advance and you get an infinite loop.`
        );
    }

    const words = text.split(/\s+/).filter(w => w.length > 0);

    if(words.length === 0) return [];

    if(words.length <= chunkSize){
        return [{
            text : words.join(" "),
            wordCount : words.length,
            startWord : 0,
            endWord : words.length
        }]
    }

    const chunks = [];
    let startWord = 0;
    const stepSize = chunkSize - overlap;

    while(startWord < words.length){
        const endWord = Math.min(startWord + chunkSize, words.length);

        const chunkWords = words.slice(startWord, endWord);
        const chunkWordsCount = chunkWords.length;

        if(chunkWordsCount >= minChunkWord){
            chunks.push({
                text : chunkWords.join(" "),
                wordCount : chunkWordsCount,
                startWord : startWord,
                endWord : endWord
            })
        }

        startWord += stepSize;
    }

    return chunks;
}

export async function validateChunks(chunks, expectedDimensions = 3072) {
    const issues = [];

    chunks.forEach((chunk, i) => {
        if (!chunk.text || chunk.text.trim().length === 0) {
            issues.push(`Chunk ${i}: empty text`);
        }
        if (chunk.wordCount < 10) {
            issues.push(`Chunk ${i}: very short (${chunk.wordCount} words) - may produce weak embedding`);
        }
        if (chunk.wordCount > 400) {
            issues.push(`Chunk ${i}: very long (${chunk.wordCount} words) - may exceed token limit or dilute embedding`);
        }
    });

    if (issues.length > 0) {
        console.warn(`\n⚠️  Chunk validation warnings (${issues.length}):`);
        issues.forEach(issue => console.warn(`   ${issue}`));
    } else {
        console.log(`✅ All ${chunks.length} chunks passed validation`);
    }

    return issues.length === 0;  // true = all good, false = warnings found
}