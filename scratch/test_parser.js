import fs from 'node:fs';

const lines = fs.readFileSync('./scratch/gept_ref_extracted.txt', 'utf8').split('\n');

const parsedEntries = [];
let currentTopic = '';

const ignorePatterns = [
  '「小學英檢」',
  '© 2026 LTTC',
  '-- ',
  '分類 (英) 分類 (成)',
  '分類 (英) 分類 (中)',
  '分類 (英) 分類 (中) 單字 中譯 詞性',
  '==Start of PDF==',
  '==End of PDF==',
  '==Start of OCR',
  '==End of OCR'
];

const knownPOS = [
  '代名詞',
  '助動詞',
  '形容詞',
  '介系詞',
  '連接詞',
  '感嘆詞',
  '限定詞',
  '副詞',
  '名詞',
  '動詞',
  '冠詞',
  '數字'
];

// All 35 English topic names in the GEPT Kids PDF
const topicNames = [
  'Animals & insects',
  'Clothing & accessories',
  'Colors',
  'Family',
  'Food & drink',
  'Forms of address',
  'Geographical terms',
  'Holidays & festivals',
  'Health',
  'Houses & apartments',
  'Money',
  'Numbers',
  'Occupations',
  'Parts of body',
  'People',
  'Personal characteristics',
  'Places & directions',
  'School',
  'Sizes & measurements',
  'Sports, interests & hobbies',
  'Tableware',
  'Time',
  'Transportation',
  'Weather & nature',
  'Articles & determiners',
  'Pronouns',
  'Be & auxiliaries',
  'Conjunctions',
  'Interjections',
  'Prepositions',
  'Other nouns',
  'Other verbs',
  'Other adjectives',
  'Other adverbs',
  'Wh-words'
];

for (let line of lines) {
  line = line.trim();
  if (!line) continue;
  
  if (ignorePatterns.some(p => line.startsWith(p) || line.includes(p))) {
    continue;
  }
  
  // Check if it's a known topic header
  const isTopic = topicNames.some(t => line.toLowerCase().startsWith(t.toLowerCase()));
  if (isTopic) {
    currentTopic = line;
    continue;
  }
  
  let asciiPart = '';
  let nonAsciiPart = '';
  let foundNonAscii = false;
  
  for (let i = 0; i < line.length; i++) {
    const charCode = line.charCodeAt(i);
    if (!foundNonAscii && charCode > 127) {
      foundNonAscii = true;
    }
    
    if (!foundNonAscii) {
      asciiPart += line[i];
    } else {
      nonAsciiPart += line[i];
    }
  }
  
  const word = asciiPart.trim();
  let rest = nonAsciiPart.trim();
  
  // Find POS at the end
  let pos = '';
  for (const kp of knownPOS) {
    if (rest.endsWith(kp)) {
      pos = kp;
      rest = rest.slice(0, rest.length - kp.length).trim();
      break;
    }
  }
  
  if (rest.endsWith(',') || rest.endsWith('，')) {
    rest = rest.slice(0, -1).trim();
    for (const kp of knownPOS) {
      if (rest.endsWith(kp)) {
        pos = kp + ', ' + pos;
        rest = rest.slice(0, rest.length - kp.length).trim();
        break;
      }
    }
  }
  
  const zh = rest.trim();
  
  parsedEntries.push({
    word,
    zh,
    pos,
    topic: currentTopic
  });
}

console.log('Total parsed entries from PDF:', parsedEntries.length);
console.log('Sample parsed entries (first 10):');
console.log(parsedEntries.slice(0, 10));
console.log('Sample parsed entries (middle 10):');
console.log(parsedEntries.slice(450, 460));
console.log('Sample parsed entries (last 10):');
console.log(parsedEntries.slice(-10));

fs.writeFileSync('./scratch/gept_ref_parsed.json', JSON.stringify(parsedEntries, null, 2), 'utf8');
