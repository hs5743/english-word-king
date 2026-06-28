import fs from 'node:fs';

const vocab = JSON.parse(fs.readFileSync('./data/vocabulary.json', 'utf8'));

const radicals = new Set();
const radicalCount = {};

for (const entry of vocab) {
  const zh = entry.zh;
  for (let i = 0; i < zh.length; i++) {
    const code = zh.charCodeAt(i);
    if (code >= 0x2f00 && code <= 0x2fdf) {
      const char = zh[i];
      radicals.add(char);
      radicalCount[char] = (radicalCount[char] || 0) + 1;
    }
  }
}

console.log('Unique Kangxi Radicals found in vocabulary.json:', Array.from(radicals));
console.log('Counts:', radicalCount);
