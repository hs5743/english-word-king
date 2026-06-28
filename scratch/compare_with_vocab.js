import fs from 'node:fs';

const vocab = JSON.parse(fs.readFileSync('./data/vocabulary.json', 'utf8'));
const pdfWords = JSON.parse(fs.readFileSync('./scratch/gept_ref_parsed.json', 'utf8'));

console.log('Vocabulary database total words:', vocab.length);
console.log('PDF reference total words:', pdfWords.length);

const pdfMap = new Map();
for (const entry of pdfWords) {
  pdfMap.set(entry.word.toLowerCase().trim(), entry);
}

const missingInPDF = [];
const translationMismatches = [];

for (const entry of vocab) {
  const cleanWord = entry.word.toLowerCase().trim();
  const pdfMatch = pdfMap.get(cleanWord);
  
  if (!pdfMatch) {
    missingInPDF.push(entry);
  } else {
    // Compare Chinese translation
    // Ignore minor differences like punctuation, parenthetical explanations
    const cleanZh = entry.zh.replace(/[\(\)（）\s\=\:\;\,\.\?\!\-\/\~]/g, '');
    const cleanPdfZh = pdfMatch.zh.replace(/[\(\)（）\s\=\:\;\,\.\?\!\-\/\~]/g, '');
    
    // Check if one contains the other, or they are reasonably different
    const isSimilar = cleanZh.includes(cleanPdfZh) || cleanPdfZh.includes(cleanZh);
    
    if (!isSimilar) {
      translationMismatches.push({
        word: entry.word,
        dbZh: entry.zh,
        pdfZh: pdfMatch.zh,
        dbTopic: entry.topic,
        pdfTopic: pdfMatch.topic
      });
    }
  }
}

// Find words in PDF that are missing in our DB
const missingInDB = [];
for (const entry of pdfWords) {
  const cleanWord = entry.word.toLowerCase().trim();
  const dbMatch = vocab.find(v => v.word.toLowerCase().trim() === cleanWord);
  if (!dbMatch) {
    missingInDB.push(entry);
  }
}

console.log('\n--- REPORT ---');
console.log('1. Words in DB but missing in PDF (Total:', missingInPDF.length, '):');
console.log(missingInPDF.map(m => `${m.word} (${m.zh}) [${m.topic}]`).slice(0, 50));
if (missingInPDF.length > 50) console.log('...and more');

console.log('\n2. Translation mismatches between DB and PDF (Total:', translationMismatches.length, '):');
console.log(translationMismatches);

console.log('\n3. Words in PDF but missing in DB (Total:', missingInDB.length, '):');
console.log(missingInDB.map(m => `${m.word} (${m.zh}) [${m.topic}]`).slice(0, 50));
if (missingInDB.length > 50) console.log('...and more');

// Save detailed reports to scratch files
fs.writeFileSync('./scratch/missing_in_pdf.json', JSON.stringify(missingInPDF, null, 2), 'utf8');
fs.writeFileSync('./scratch/translation_mismatches.json', JSON.stringify(translationMismatches, null, 2), 'utf8');
fs.writeFileSync('./scratch/missing_in_db.json', JSON.stringify(missingInDB, null, 2), 'utf8');
