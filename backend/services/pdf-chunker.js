import {cleanText} from "./chunker.js"

export function chunkPdfPages(pages, chunkSize = 150, overlap = 30, minWords = 30) {
    if(overlap >= chunkSize){
        throw new Error(`overlap (${overlap}) must be less than chunkSize (${chunkSize})`);
    }

    const wordStream = [];

    pages.forEach((pageText, pageIndex)=>{
        const cleaned = cleanText(pageText);
        const pageNumber = pageIndex + 1;

        const words = cleaned.split(/\s+/).filter(w => w.length > 0);

        words.forEach(word => {
            wordStream.push({word , page : pageNumber});
        })
    });

    if(wordStream.length === 0) return [];

    const chunks = [];
    const stepsize = chunkSize - overlap;
    let startWord = 0;
    let chunkIndex = 0;

    while(startWord <= wordStream.length){
        const endWord = Math.min(startWord + chunkSize, wordStream.length);

        const windowWords = wordStream.slice(startWord , endWord);

        if(windowWords.length >= minWords){
            const text = windowWords.map(w => w.word).join(" ");

            const startPage = windowWords[0].page;
            const endPage= windowWords[windowWords.length - 1].page;

            chunks.push({
                text,
                wordCount : windowWords.length,
                chunkIndex : chunkIndex,
                startWord,
                endWord,
                startPage,
                endPage
            });

            chunkIndex ++;
        }

        startWord += stepsize;
    }

    return chunks;
}

export function formatPageCitation(startPage, endPage) {
  if (startPage === endPage) {
    return `page ${startPage}`;
  }
  return `pages ${startPage}–${endPage}`;
  // "pages 3–4" for cross-boundary chunks
}