// tools/patch-sentences.js
// 用於將批次生成的例句寫入 data/vocabulary.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const VOCAB_PATH = path.join(ROOT, 'data', 'vocabulary.json');
const DIST_PATH = path.join(ROOT, 'dist', 'data', 'vocabulary.json');

const updateData = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const vocabulary = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
let updatedCount = 0;

for (const item of vocabulary) {
  if (updateData[item.id]) {
    const [sentence, sentenceZh] = updateData[item.id];
    item.sentence = sentence;
    item.sentenceZh = sentenceZh;
    updatedCount++;
  }
}

fs.writeFileSync(VOCAB_PATH, JSON.stringify(vocabulary, null, 2), 'utf8');
if (fs.existsSync(path.dirname(DIST_PATH))) {
  fs.writeFileSync(DIST_PATH, JSON.stringify(vocabulary, null, 2), 'utf8');
}

const emptyCount = vocabulary.filter(w => !w.sentence).length;
console.log(`成功更新了 ${updatedCount} 個單字。`);
console.log(`目前有例句的單字數：${vocabulary.filter(w => w.sentence).length} / ${vocabulary.length} (剩餘 ${emptyCount} 個無例句)。`);
