import fs from 'node:fs';

const radicalMap = {
  '⽜': '牛', '⼦': '子', '⽼': '老', '⿏': '鼠', '⾺': '馬', '⽺': '羊', '⿂': '魚',
  '⿔': '龜', '⼝': '口', '⾐': '衣', '⽑': '毛', '⾊': '色', '⿊': '黑', '⽩': '白',
  '賺': '賺', '⼈': '人', '⽔': '水', '⾷': '食', '⼒': '力', '⼩': '小', '⽣': '生',
  '⼭': '山', '⽕': '火', '⽤': '用', '⾨': '門', '⼱': '巾', '⼀': '一', '⼆': '二',
  '⼿': '手', '⽿': '耳', '⿒': '齒', '⾏': '行', '⽇': '日', '⼲': '干', '⾳': '音',
  '⽂': '文', '⿆': '麥', '⽪': '皮', '⽚': '片', '⾼': '高', '⾜': '足', '⿎': '鼓',
  '⾵': '風', '⼑': '刀', '⼋': '八', '⼗': '十', '⾞': '車', '⾶': '飛', '⾬': '雨',
  '⾯': '面', '⽅': '方', '⽐': '比', '⾒': '見', '⽰': '示', '⽴': '立', '⼼': '心',
  '⾮': '非', '⾃': '自', '⽵': '竹',
  '⾖': '豆', '⻄': '西', '⻑': '長'
};

function normalizeText(text) {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    result += radicalMap[char] || char;
  }
  return result
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/，/g, ',')
    .replace(/：/g, ':')
    .replace(/；/g, ';')
    .trim();
}

const vocabPath = './data/vocabulary.json';
const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));

// True error corrections mapping
const corrections = {
  'girl': { zh: '女孩', topic: 'People' },
  'refrigerator': { zh: '電冰箱', topic: 'House' },
  'socks': { zh: '襪子', topic: 'Clothing' },
  'sweater': { zh: '毛衣', topic: 'Clothing' },
  'dress': { zh: '洋裝', topic: 'Clothing' },
  'skirt': { zh: '裙子', topic: 'Clothing' },
  'tall': { zh: '高的', topic: 'Personal' },
  'short': { zh: '短的', topic: 'Sizes & measurements' }, // short can be sizes
  'airport': { zh: '機場', topic: 'Transportation' },
  'orange': { zh: '橘子', topic: 'Food' }, // For Food/Colors split
  'Moon': { zh: '月亮', topic: 'Weather & nature' }
};

// Topic mapping to normalize and fix odd topics
const topicMapping = {
  'Choose': 'Colors',
  'Jobs': 'Occupations',
  'General': 'Forms',
  'Houses': 'House',
  'Parts': 'Body',
  'Sport,': 'Sports',
  'Be': 'Be & Auxiliaries',
  'Verbs': 'Other verbs',
  'Size': 'Sizes & measurements'
};

let correctedCount = 0;
let normalizedCount = 0;
let topicFixedCount = 0;

const updatedVocab = vocab.map(entry => {
  const word = entry.word;
  let zh = entry.zh;
  let topic = entry.topic;
  
  // 1. Check Unicode normalization
  const normalizedZh = normalizeText(zh);
  if (normalizedZh !== zh) {
    zh = normalizedZh;
    normalizedCount++;
  }
  
  // 2. Check true errors correction
  if (corrections[word]) {
    zh = corrections[word].zh;
    topic = corrections[word].topic;
    correctedCount++;
  }
  
  // 3. Normalize topics
  if (topicMapping[topic]) {
    topic = topicMapping[topic];
    topicFixedCount++;
  }
  
  return {
    ...entry,
    zh,
    topic
  };
});

console.log('Correction summary:');
console.log('- Normalized Unicode of CJK characters:', normalizedCount);
console.log('- Fixed critical translation errors:', correctedCount);
console.log('- Standardized topic values:', topicFixedCount);

fs.writeFileSync(vocabPath, JSON.stringify(updatedVocab, null, 2), 'utf8');
console.log('Database updated successfully.');
