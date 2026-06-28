import fs from 'node:fs';

// Map of Kangxi Radicals to standard CJK Unified Ideographs
const radicalMap = {
  '⽜': '牛', '⼦': '子', '⽼': '老', '⿏': '鼠', '⾺': '馬', '⽺': '羊', '⿂': '魚',
  '⿔': '龜', '⼝': '口', '⾐': '衣', '⽑': '毛', '⾊': '色', '⿊': '黑', '⽩': '白',
  '⼈': '人', '⽔': '水', '⾷': '食', '⼒': '力', '⼩': '小', '⽣': '生', '⼭': '山',
  '⽕': '火', '⽤': '用', '⾨': '門', '⼱': '巾', '⼀': '一', '⼆': '二', '⼿': '手',
  '⽿': '耳', '⿒': '齒', '⾏': '行', '⽇': '日', '⼲': '干', '⾳': '音', '⽂': '文',
  '⿆': '麥', '⽪': '皮', '⽚': '片', '⾼': '高', '⾜': '足', '⿎': '鼓', '⾵': '風',
  '⼑': '刀', '⼋': '八', '⼗': '十', '⾞': '車', '⾶': '飛', '⾬': '雨', '⾯': '面',
  '⽅': '方', '⽐': '比', '⾒': '見', '⽰': '示', '⽴': '立', '⼼': '心', '⾮': '非',
  '⾃': '自', '⽵': '竹'
};

function normalizeText(text) {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    result += radicalMap[char] || char;
  }
  // Standardize full-width/half-width symbols
  return result
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/，/g, ',')
    .replace(/：/g, ':')
    .replace(/；/g, ';')
    .replace(/·/g, '·')
    .trim();
}

const vocab = JSON.parse(fs.readFileSync('./data/vocabulary.json', 'utf8'));
const pdfWords = JSON.parse(fs.readFileSync('./scratch/gept_ref_parsed.json', 'utf8'));

const pdfMap = new Map();
for (const entry of pdfWords) {
  // Normalize PDF translation
  const normZh = normalizeText(entry.zh);
  pdfMap.set(entry.word.toLowerCase().trim(), { ...entry, normalizedZh: normZh });
}

const dbNormList = vocab.map(entry => {
  return {
    ...entry,
    normalizedZh: normalizeText(entry.zh)
  };
});

const trueMismatches = [];
const minorDiffs = [];

for (const entry of dbNormList) {
  const cleanWord = entry.word.toLowerCase().trim();
  const pdfMatch = pdfMap.get(cleanWord);
  
  if (pdfMatch) {
    const dbZh = entry.normalizedZh;
    const pdfZh = pdfMatch.normalizedZh;
    
    // Core comparison: strip out all punctuation and parentheses
    const coreDbZh = dbZh.replace(/[\(\)（）\s\=\:\;\,\.\?\!\-\/\~]/g, '');
    const corePdfZh = pdfZh.replace(/[\(\)（）\s\=\:\;\,\.\?\!\-\/\~]/g, '');
    
    if (coreDbZh !== corePdfZh) {
      // Check if they are actually different in meaning (e.g. "做飯" vs "做飯/廚師" is similar, but "男⼈" vs "女孩" is opposite)
      const isSubset = coreDbZh.includes(corePdfZh) || corePdfZh.includes(coreDbZh);
      
      const mismatch = {
        word: entry.word,
        dbZh: entry.zh,
        pdfZh: pdfMatch.zh,
        dbTopic: entry.topic,
        pdfTopic: pdfMatch.topic
      };
      
      if (!isSubset) {
        trueMismatches.push(mismatch);
      } else {
        minorDiffs.push(mismatch);
      }
    }
  }
}

console.log('True translation errors (Total:', trueMismatches.length, '):');
console.log(JSON.stringify(trueMismatches, null, 2));

console.log('\nMinor formatting differences (Total:', minorDiffs.length, '):');
console.log(minorDiffs.slice(0, 10));

fs.writeFileSync('./scratch/true_mismatches.json', JSON.stringify(trueMismatches, null, 2), 'utf8');
fs.writeFileSync('./scratch/minor_diffs.json', JSON.stringify(minorDiffs, null, 2), 'utf8');
