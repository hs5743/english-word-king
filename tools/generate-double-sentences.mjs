import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CSV_PATH = path.join(ROOT, '英語單字王_單字庫_2026-07-09.csv');
const DRAFT_CSV_PATH = path.join(ROOT, 'data', 'vocabulary_double_sentences_draft.csv');
const REPORT_PATH = path.join(ROOT, 'data', 'translation_review_report.md');
const PROGRESS_PATH = path.join(ROOT, 'data', 'double-sentences-progress.json');
const ENV_PATH = path.join(ROOT, '.env.local');

// ─── CSV Parser ───
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

function toCSV(rows) {
  return rows.map(row => 
    row.map(cell => {
      const val = String(cell ?? '');
      if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(',')
  ).join('\n');
}

// ─── read env key ───
function readGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^GEMINI_API_KEY=(.+)$/);
      if (m) return m[1].trim();
    }
  }
  return null;
}

// ─── API call ───
async function callGemini(batch, apiKey) {
  const list = batch.map(w => `- ${w.word} (目前中譯: ${w.zh}) [例句1: ${w.sentence} / ${w.sentenceZh}]`).join('\n');
  const prompt = `你是一位專業的台灣國小英語教學專家與繁體中文校對。請針對以下英文單字列表，為我們執行以下三個任務：

1. 中文翻譯校對：審查「目前中譯」是否符合台灣國小（3-6年級）常用且準確的教學翻譯。若不合適或有錯誤，請提供建議的繁體中文翻譯（zh_suggested），否則保持相同。若中譯有修改，請設定 zh_changed 為 true，並在 change_reason 中簡短說明原因。
2. 音標生成：為每個單字生成正確的標準 IPA 音標（例如：apple 應為 /'æp.əl/ 或 /ˈæp.l̩/），格式統一。
3. 第二個例句生成（例句2 & 例句2中譯）：為單字生成第二個例句。要求：
   - 難度：句型單純、文法簡單，字數在 6-15 字之間，適合國小 3-6 年級學生朗讀與學習。
   - 內容主題：融入「校園生活」、「家庭日常互動」或「人生勵志」，句意要健康、溫暖、有學習價值。
   - 例句必須自然包含該單字（原形或常用變化形）。
   - 請提供準確的繁體中文翻譯（中譯不可含簡體字）。

請嚴格以下面 JSON 陣列格式回傳（不可有任何多餘的 markdown 或說明，只回傳 JSON 陣列本身）：
[
  {
    "word": "apple",
    "zh_original": "蘋果",
    "zh_suggested": "蘋果",
    "zh_changed": false,
    "change_reason": "",
    "phonetic": "/'æp.əl/",
    "sentence1": "I have a red apple in my schoolbag.",
    "translation1": "我的書包裡有一個紅蘋果。",
    "sentence2": "An apple a day keeps the doctor away.",
    "translation2": "一天一蘋果，醫生遠離我。"
  }
]

以下為單字清單：
${list}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const resJson = await response.json();
  const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty content');
  
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    console.error('Failed to parse Gemini output:', text);
    throw e;
  }
}

// ─── Main ───
async function main() {
  console.log('單字庫自動校對與雙例句生成工具');
  console.log('='.repeat(50));

  const apiKey = readGeminiKey();
  if (!apiKey) {
    console.error('錯誤：找不到 GEMINI_API_KEY！');
    console.error('請在專案根目錄下建立 .env.local 檔案並填入以下內容：');
    console.log('GEMINI_API_KEY=你的金鑰');
    process.exit(1);
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`錯誤：找不到來源 CSV 檔案 ${CSV_PATH}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const csvRows = parseCSV(csvContent);
  
  // Header: 單字(Word),中文(Chinese),主題(Topic),音標(Phonetic),難度年級(Grade),拼字音節(Chunks),例句(Sentence),例句中譯(Translation)
  const header = csvRows[0];
  const dataRows = csvRows.slice(1);
  console.log(`成功載入 ${dataRows.length} 個單字。`);

  // 還原進度
  let progress = { sentenceCache: {}, changes: [] };
  if (fs.existsSync(PROGRESS_PATH)) {
    try {
      progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
      console.log(`已從中斷點恢復進度，目前已有 ${Object.keys(progress.sentenceCache).length} 個單字處理完畢。`);
    } catch (e) {
      console.warn('無法讀取進度檔案，將重新開始。');
    }
  }

  const BATCH_SIZE = 15;
  const wordsToProcess = [];
  
  for (const row of dataRows) {
    const word = String(row[0] || '').trim();
    if (!word) continue;
    
    // 如果已經在快取中，跳過
    if (progress.sentenceCache[word.toLowerCase().trim()]) continue;

    wordsToProcess.push({
      word,
      zh: String(row[1] || '').trim(),
      topic: String(row[2] || '').trim(),
      phonetic: String(row[3] || '').trim(),
      grade: String(row[4] || '').trim(),
      chunks: String(row[5] || '').trim(),
      sentence: String(row[6] || '').trim(),
      sentenceZh: String(row[7] || '').trim()
    });
  }

  console.log(`需要發送 AI 處理的單字數: ${wordsToProcess.length}`);

  if (wordsToProcess.length > 0) {
    for (let i = 0; i < wordsToProcess.length; i += BATCH_SIZE) {
      const batch = wordsToProcess.slice(i, i + BATCH_SIZE);
      console.log(`[批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(wordsToProcess.length / BATCH_SIZE)}] 正在處理: ${batch.map(w => w.word).join(', ')}`);
      
      let attempts = 0;
      let success = false;
      while (attempts < 3 && !success) {
        try {
          const results = await callGemini(batch, apiKey);
          for (const res of results) {
            const w = res.word?.toLowerCase().trim();
            if (w) {
              progress.sentenceCache[w] = res;
              if (res.zh_changed) {
                progress.changes.push({
                  word: res.word,
                  oldZh: res.zh_original,
                  newZh: res.zh_suggested,
                  reason: res.change_reason
                });
              }
            }
          }
          fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf8');
          success = true;
          console.log(`  成功！進度已儲存。`);
        } catch (err) {
          attempts++;
          console.warn(`  失敗 (嘗試 ${attempts}/3): ${err.message}`);
          if (attempts < 3) {
            await new Promise(r => setTimeout(r, 4000));
          }
        }
      }
      
      if (!success) {
        console.error('由於連續批次失敗，程式中斷。請在重新執行時加上自動續傳。');
        process.exit(1);
      }
      
      // 避免 API 頻率過高
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // 組合最終資料輸出成草稿 CSV
  console.log('\n正在產生草稿 CSV 檔與校對報告...');
  const newHeader = [
    '單字(Word)', '中文(Chinese)', '主題(Topic)', '音標(Phonetic)', '難度年級(Grade)', '拼字音節(Chunks)',
    '例句1(Sentence1)', '例句1中譯(Translation1)',
    '例句2(Sentence2)', '例句2中譯(Translation2)'
  ];
  
  const finalRows = [newHeader];
  for (const row of dataRows) {
    const wordKey = String(row[0] || '').toLowerCase().trim();
    const cache = progress.sentenceCache[wordKey];
    
    if (cache) {
      finalRows.push([
        row[0],
        cache.zh_suggested || row[1],
        row[2],
        cache.phonetic || row[3],
        row[4],
        row[5],
        cache.sentence1 || row[6],
        cache.translation1 || row[7],
        cache.sentence2 || '',
        cache.translation2 || ''
      ]);
    } else {
      finalRows.push([
        row[0], row[1], row[2], row[3], row[4], row[5],
        row[6], row[7], '', ''
      ]);
    }
  }

  // 寫入 CSV
  fs.writeFileSync(DRAFT_CSV_PATH, toCSV(finalRows), 'utf8');
  console.log(`已成功寫入雙例句草稿 CSV: ${DRAFT_CSV_PATH}`);

  // 產生報告
  let report = `# 英語單字王 — 單字庫中譯自動校對報告\n\n`;
  report += `產生時間：${new Date().toLocaleString()}\n`;
  report += `總共校對單字數：${dataRows.length} 字\n`;
  report += `建議修正中譯的單字數：${progress.changes.length} 字\n\n`;
  report += `| 單字(Word) | 原中譯 | 建議修正中譯 | 建議原因 |\n`;
  report += `| --- | --- | --- | --- |\n`;
  
  for (const c of progress.changes) {
    report += `| **${c.word}** | ${c.oldZh} | \`${c.newZh}\` | ${c.reason || '更適合小學生常用定義'} |\n`;
  }
  
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`已成功寫入校對報告: ${REPORT_PATH}`);

  // 清除進度
  if (fs.existsSync(PROGRESS_PATH)) {
    fs.unlinkSync(PROGRESS_PATH);
  }
  
  console.log('\n恭喜！所有單字處理完畢！');
  console.log('請您在 Excel 或 Google Sheets 中開啟以下檔案進行審查：');
  console.log(`1. 草稿檔: ${DRAFT_CSV_PATH}`);
  console.log(`2. 校對報告: ${REPORT_PATH}`);
}

main().catch(err => {
  console.error('程式執行致命錯誤：', err.message);
  process.exit(1);
});
