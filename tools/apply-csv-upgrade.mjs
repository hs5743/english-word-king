// tools/apply-csv-upgrade.mjs - 應用 CSV 升級至 vocabulary.json
//
// 用法：
//   node tools/apply-csv-upgrade.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'data', 'vocabulary_double_sentences_draft.csv');
const JSON_PATH = path.join(ROOT, 'data', 'vocabulary.json');
const DIST_JSON_PATH = path.join(ROOT, 'dist', 'data', 'vocabulary.json');

// CSV Parser
function parseCSV(content) {
  const lines = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i+1];
    
    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(cell);
        cell = '';
      } else if (char === '\n' || char === '\r') {
        row.push(cell);
        if (row.length > 1 || row[0] !== '') {
          lines.push(row);
        }
        row = [];
        cell = '';
        if (char === '\r' && next === '\n') {
          i++;
        }
      } else {
        cell += char;
      }
    }
  }
  if (row.length > 0 || cell !== '') {
    row.push(cell);
    lines.push(row);
  }
  return lines;
}

async function main() {
  console.log('正在應用 CSV 升級至 vocabulary.json...');
  console.log('='.repeat(50));

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`錯誤：找不到 CSV 檔案 ${CSV_PATH}`);
    console.error(`請確認您已完成 CSV 的編輯並將其放於 ${CSV_PATH}`);
    process.exit(1);
  }

  // 1. 讀取 CSV
  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const csvRows = parseCSV(csvContent);
  const header = csvRows[0];
  const dataRows = csvRows.slice(1);

  // 2. 讀取目前的 JSON
  let originalJson = [];
  if (fs.existsSync(JSON_PATH)) {
    originalJson = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    console.log(`已讀取現有 JSON，共 ${originalJson.length} 個單字。`);
  }

  const jsonMap = new Map();
  for (const item of originalJson) {
    jsonMap.set(item.word.toLowerCase().trim(), item);
  }

  // 3. 更新/合併
  const upgradedJson = [];
  let updatedCount = 0;
  let newCount = 0;

  for (const row of dataRows) {
    const word = String(row[0] || '').trim();
    if (!word) continue;

    const key = word.toLowerCase().trim();
    const existing = jsonMap.get(key) || {};

    const zh = String(row[1] || '').trim();
    const topic = String(row[2] || '').trim();
    const phonetic = String(row[3] || '').trim();
    const gradeNum = parseInt(row[4]) || existing.grade || 3;
    const chunksText = String(row[5] || '').trim();
    const sentence1 = String(row[6] || '').trim();
    const translation1 = String(row[7] || '').trim();
    const sentence2 = String(row[8] || '').trim();
    const translation2 = String(row[9] || '').trim();

    // 處理 Chunks
    const chunks = chunksText ? chunksText.split('/').map(c => c.trim()).filter(Boolean) : [];

    const updatedItem = {
      id: existing.id || `passport-${key}`,
      word: word,
      zh: zh,
      topic: topic || existing.topic || 'Daily',
      gradeBand: existing.gradeBand || `G${gradeNum}`,
      grade: gradeNum,
      difficultyLevel: existing.difficultyLevel || gradeNum,
      source: existing.source || 'passport',
      chunks: chunks.length ? chunks : (existing.chunks || []),
      patterns: existing.patterns || [],
      phonetic: phonetic,
      sentence: sentence1,
      sentenceZh: translation1,
      sentence2: sentence2,
      sentence2Zh: translation2,
      enabled: existing.enabled !== false,
      needsReview: false // 已被人工審查過，重設為 false
    };

    if (jsonMap.has(key)) {
      updatedCount++;
    } else {
      newCount++;
    }

    upgradedJson.push(updatedItem);
  }

  // 4. 寫入檔案
  fs.writeFileSync(JSON_PATH, JSON.stringify(upgradedJson, null, 2), 'utf8');
  console.log(`成功寫入: ${JSON_PATH}`);

  // 同步寫入 dist/data/
  const distDir = path.dirname(DIST_JSON_PATH);
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(DIST_JSON_PATH, JSON.stringify(upgradedJson, null, 2), 'utf8');
    console.log(`成功同步寫入 dist 發佈區: ${DIST_JSON_PATH}`);
  }

  console.log('\n套用完畢！');
  console.log(`  更新單字數：${updatedCount}`);
  console.log(`  新增單字數：${newCount}`);
  console.log(`  總計單字數：${upgradedJson.length}`);
}

main().catch(err => {
  console.error('執行失敗：', err.message);
  process.exit(1);
});
