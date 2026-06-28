// tools/regenerate-all-sentences.mjs
// 強制使用 Gemini 3.5 Flash 重新生成全部 706 個單字的高品質例句與中譯
// 支援中斷點續傳 (--resume) 與安全限流

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const VOCAB_PATH    = path.join(ROOT, 'data', 'vocabulary.json');
const PROGRESS_PATH = path.join(ROOT, 'data', 'vocabulary-regen-progress.json');
const ENV_PATH      = path.join(ROOT, '.env.local');

const isResume = process.argv.includes('--resume');

function readGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (fs.existsSync(ENV_PATH)) {
    for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const m = line.match(/^GEMINI_API_KEY=(.+)$/);
      if (m) return m[1].trim();
    }
  }
  return null;
}

async function callGemini(words, apiKey) {
  const list = words.map(w => `- ${w.word} (${w.zh})`).join('\n');
  const prompt = `你是一位專業的國小雙語英語教師。請為以下英文單字各創作一個高品質的英文例句，並提供繁體中文翻譯。

單字清單：
${list}

寫作要求：
1. 句子必須自然包含該單字（原形或單複數、時態變化形均可）。
2. 例句長度介於 6 到 15 個單字之間，句型必須生動活潑。
3. 詞彙與語法難度需適合台灣國小 3-6 年級學生。
4. 🔴 絕對禁止使用死板重複的套版句型，例如 "I see a [單字]"、"I can see a [單字]"、"Look at the [單字]" 或 "This is a [單字]" 等。請根據單字本身的語境量身打造。
5. 翻譯必須為地道、通順的繁體中文，且括號內的中文說明（如果有）不需要出現在翻譯句子中。

請以純 JSON 陣列格式回傳，不要有任何 Markdown 標記（如 \`\`\`json）或額外說明文字。陣列中每個物件必須精確包含 "word"、"sentence"、"sentenceZh" 三個屬性。`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API 錯誤 (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 回傳了空的內容');

  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // 嘗試清理可能夾帶的 markdown 標記
    const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanText);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('全單字庫高品質例句重新生成工具 v1.0');
  console.log(`模式：${isResume ? '繼續上次進度' : '全新重新生成'}`);
  console.log('='.repeat(60));

  const apiKey = readGeminiKey();
  if (!apiKey) {
    console.error('❌ 錯誤：找不到 GEMINI_API_KEY！');
    console.error('請在專案根目錄建立 .env.local 檔案並寫入：');
    console.error('GEMINI_API_KEY=您的金鑰');
    process.exit(1);
  }

  const vocabulary = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
  console.log(`已載入單字庫，共計 ${vocabulary.length} 個單字。`);

  const sentenceCache = {};
  if (isResume && fs.existsSync(PROGRESS_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
      Object.assign(sentenceCache, saved.sentenceCache || {});
      console.log(`  [Resume] 成功還原進度，已完成 ${Object.keys(sentenceCache).length} 個單字的造句。`);
    } catch (e) {
      console.warn('  [Warning] 進度存檔損毀，將重新開始。');
    }
  }

  const wordsNeedingAI = vocabulary.filter(w => !sentenceCache[w.id]);
  console.log(`待生成單字數：${wordsNeedingAI.length} / ${vocabulary.length}`);

  if (wordsNeedingAI.length === 0) {
    console.log('所有單字均已完成生成！');
  } else {
    const BATCH_SIZE = 20;
    let completedCount = Object.keys(sentenceCache).length;

    for (let i = 0; i < wordsNeedingAI.length; i += BATCH_SIZE) {
      const batch = wordsNeedingAI.slice(i, i + BATCH_SIZE);
      console.log(`\n[${completedCount + batch.length}/${vocabulary.length}] 正在呼叫 Gemini 生成：${batch.map(w => w.word).join(', ')}`);

      try {
        const results = await callGemini(batch, apiKey);
        let batchSaved = 0;

        for (const r of results) {
          const matched = batch.find(w => w.word.toLowerCase() === r.word?.toLowerCase().trim());
          if (matched && r.sentence) {
            sentenceCache[matched.id] = {
              sentence: r.sentence.trim(),
              sentenceZh: r.sentenceZh?.trim() || ''
            };
            batchSaved++;
          }
        }

        completedCount += batchSaved;
        // 寫入進度存檔
        fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ sentenceCache, ts: new Date().toISOString() }, null, 2), 'utf8');
        console.log(`  ➔ 成功生成 ${batchSaved} 個例句。進度已存檔。`);

        // 限流延遲：避免觸發免費版 15 RPM 限制，每批間隔 4 秒
        if (i + BATCH_SIZE < wordsNeedingAI.length) {
          console.log('  等待 4 秒以避免 Rate Limit...');
          await new Promise(r => setTimeout(r, 4000));
        }
      } catch (err) {
        console.error(`\n❌ 批次生成失敗：${err.message}`);
        console.error('請確認您的 API Key 是否有效，或網路連線是否正常。');
        console.error('您可以稍後使用以下指令從中斷點繼續：');
        console.error('  node tools/regenerate-all-sentences.mjs --resume');
        process.exit(1);
      }
    }
  }

  // 寫入最終單字庫
  console.log('\n步驟 4：組合並寫入最終的 vocabulary.json...');
  const upgraded = vocabulary.map(w => {
    const sc = sentenceCache[w.id];
    return {
      ...w,
      sentence:   sc?.sentence || w.sentence || '',
      sentenceZh: sc?.sentenceZh || w.sentenceZh || '',
    };
  });

  fs.writeFileSync(VOCAB_PATH, JSON.stringify(upgraded, null, 2), 'utf8');

  // 同步寫入 dist 資料夾
  const distDir = path.join(ROOT, 'dist', 'data');
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'vocabulary.json'), JSON.stringify(upgraded, null, 2), 'utf8');
  }

  // 刪除暫存的進度檔
  if (fs.existsSync(PROGRESS_PATH)) {
    fs.unlinkSync(PROGRESS_PATH);
  }

  console.log('='.repeat(60));
  console.log('🎉 恭喜！全部單字例句重新生成完成！');
  console.log(`  總單字數：${upgraded.length}`);
  console.log(`  高品質例句數：${upgraded.filter(w => w.sentence).length} / ${upgraded.length}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('執行失敗：', err.message);
  process.exit(1);
});
