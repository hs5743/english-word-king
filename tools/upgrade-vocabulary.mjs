// tools/upgrade-vocabulary.mjs - 單字庫升級指令碼 v1.0
// 新增 difficultyLevel (1-16) + 預載高品質例句
//
// 用法：
//   node tools/upgrade-vocabulary.mjs           # 正式執行
//   node tools/upgrade-vocabulary.mjs --dry-run # 預覽不寫入
//   node tools/upgrade-vocabulary.mjs --resume  # 從中斷點繼續

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const VOCAB_PATH    = path.join(ROOT, 'data', 'vocabulary.json');
const PATTERNS_PATH = path.join(ROOT, 'data', 'sentence-patterns.json');
const PROGRESS_PATH = path.join(ROOT, 'data', 'vocabulary-upgrade-progress.json');
const ENV_PATH      = path.join(ROOT, '.env.local');

const isDryRun = process.argv.includes('--dry-run');
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

// G3 有 584 字(83%)，給予最多關卡 Level 1-8，其餘年級依比例分配
const GRADE_LEVEL_RANGES = { G3:[1,8], G4:[9,10], G5:[11,12], G6:[13,13], G7:[14,14], G8:[15,15], G9:[16,16] };

function countSyllables(word) {
  return (word.toLowerCase().match(/[aeiouy]+/g) || []).length || 1;
}

function parseGradeNum(gb) {
  const m = (gb || 'G3').match(/\d+/);
  return m ? parseInt(m[0]) : 3;
}

function assignDifficultyLevels(words) {
  const groups = {};
  for (const w of words) {
    const gb = w.gradeBand || 'G3';
    (groups[gb] = groups[gb] || []).push(w);
  }
  const result = new Map();
  for (const [gb, gw] of Object.entries(groups)) {
    const [min, max] = GRADE_LEVEL_RANGES[gb] || [1,4];
    const count = max - min + 1;
    const sorted = [...gw].sort((a,b) => {
      const d = countSyllables(a.word) - countSyllables(b.word);
      if (d) return d;
      const d2 = a.word.length - b.word.length;
      if (d2) return d2;
      return a.word.localeCompare(b.word);
    });
    sorted.forEach((w,i) => result.set(w.id, min + Math.floor(i / sorted.length * count)));
  }
  return result;
}

async function callGemini(words, apiKey) {
  const list = words.map(w => '- ' + w.word + ' (' + w.zh + ')').join('\n');
  const prompt = '你是台灣專業英語老師，為以下英文單字各造一個高品質英文例句。\n' +
    '要求：\n' +
    '1. 句子自然包含該單字（原形或變化形均可）\n' +
    '2. 長度 8-18 個英文單字\n' +
    '3. 詞彙適合台灣國小 3-6 年級學生\n' +
    '4. 禁止使用 I see a / I can see a 等硬套句型\n' +
    '5. 提供繁體中文翻譯\n\n' +
    '以純 JSON 陣列回傳，每項含 word、sentence、sentenceZh：\n' +
    list + '\n\n只輸出 JSON，不要說明文字。';

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' + apiKey;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) {
    const e = await res.text();
    throw new Error('Gemini ' + res.status + ': ' + e.slice(0, 300));
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 回傳空內容');
  return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
}

async function main() {
  console.log('='.repeat(60));
  console.log('單字庫升級指令碼 v1.0');
  console.log('模式：' + (isDryRun ? 'DRY-RUN（預覽不寫入）' : isResume ? '繼續上次進度' : '正式執行'));
  console.log('='.repeat(60));

  const vocabulary = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
  const patterns   = JSON.parse(fs.readFileSync(PATTERNS_PATH, 'utf8'));

  const patternBySlot = {};
  for (const pat of patterns) {
    if (pat.enabled === false) continue;
    for (const sid of (pat.slots || [])) patternBySlot[sid] = pat;
  }

  // 步驟1：分配 difficultyLevel
  console.log('\n步驟1：計算 difficultyLevel (1-16)...');
  const levelMap = assignDifficultyLevels(vocabulary);
  const levelDist = {};
  for (const lv of levelMap.values()) levelDist[lv] = (levelDist[lv] || 0) + 1;
  for (let l = 1; l <= 16; l++) {
    const c = levelDist[l] || 0;
    console.log('  Level ' + String(l).padStart(2) + ' | ' + '#'.repeat(Math.ceil(c/2)) + ' (' + c + '字)');
  }

  // 步驟2：提取已有例句
  console.log('\n步驟2：提取已有例句...');
  const sentenceCache = {};
  if (isResume && fs.existsSync(PROGRESS_PATH)) {
    Object.assign(sentenceCache, JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')).sentenceCache || {});
    console.log('  已還原快取：' + Object.keys(sentenceCache).length + ' 條');
  }

  const wordsNeedingAI = [];
  for (const w of vocabulary) {
    if (sentenceCache[w.id]) continue;
    const pat = patternBySlot[w.id];
    if (pat && pat.exampleAnswer) {
      const ans = pat.exampleAnswer.trim();
      if (ans.toLowerCase().includes(w.word.toLowerCase()) && ans.length > 5) {
        sentenceCache[w.id] = { sentence: ans, sentenceZh: pat.zhHint || '' };
        continue;
      }
    }
    wordsNeedingAI.push(w);
  }
  console.log('  從 sentence-patterns 取得：' + (vocabulary.length - wordsNeedingAI.length) + ' 字');
  console.log('  需要 AI 生成：' + wordsNeedingAI.length + ' 字');

  // 步驟3：AI 批次生成
  if (wordsNeedingAI.length > 0) {
    if (isDryRun) {
      console.log('\n[DRY-RUN] 需 AI 生成的單字：');
      wordsNeedingAI.forEach(w => console.log('  - ' + w.word + ' (' + w.zh + ')'));
    } else {
      const apiKey = readGeminiKey();
      if (!apiKey) {
        console.error('找不到 GEMINI_API_KEY！請在 .env.local 加入 GEMINI_API_KEY=你的金鑰');
        process.exit(1);
      }
      console.log('\n步驟3：AI 批次生成 ' + wordsNeedingAI.length + ' 個例句...');
      const BATCH = 20;
      let done = 0;
      for (let i = 0; i < wordsNeedingAI.length; i += BATCH) {
        const batch = wordsNeedingAI.slice(i, i + BATCH);
        console.log('  批次' + (Math.floor(i/BATCH)+1) + '：' + batch.map(w => w.word).join(', '));
        try {
          const results = await callGemini(batch, apiKey);
          for (const r of results) {
            const matched = batch.find(w => w.word.toLowerCase() === r.word?.toLowerCase());
            if (matched && r.sentence) {
              sentenceCache[matched.id] = { sentence: r.sentence, sentenceZh: r.sentenceZh || '' };
              done++;
            }
          }
          fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ sentenceCache, ts: new Date().toISOString() }, null, 2), 'utf8');
          console.log('  進度存檔 (' + done + '/' + wordsNeedingAI.length + ')');
          if (i + BATCH < wordsNeedingAI.length) await new Promise(r => setTimeout(r, 1500));
        } catch(err) {
          console.error('  批次失敗：' + err.message);
          console.error('  請以 --resume 繼續：node tools/upgrade-vocabulary.mjs --resume');
          process.exit(1);
        }
      }
    }
  }

  // 步驟4：組合最終資料
  console.log('\n步驟4：組合最終 vocabulary.json...');
  const upgraded = vocabulary.map(w => {
    const lv = levelMap.get(w.id) || 3;
    const sc = sentenceCache[w.id];
    return {
      id:              w.id,
      word:            w.word,
      zh:              w.zh,
      topic:           w.topic || 'Daily',
      gradeBand:       w.gradeBand || 'G3',
      grade:           parseGradeNum(w.gradeBand),
      difficultyLevel: lv,
      source:          w.source,
      chunks:          w.chunks || [],
      patterns:        w.patterns || [],
      sentence:        sc?.sentence   || '',
      sentenceZh:      sc?.sentenceZh || '',
      enabled:         w.enabled !== false,
      needsReview:     w.needsReview || false,
    };
  });

  if (isDryRun) {
    console.log('\n[DRY-RUN] 前5筆預覽：');
    upgraded.slice(0,5).forEach(w =>
      console.log('  ' + w.word + ' |' + w.zh + '| Level:' + w.difficultyLevel + ' | ' + (w.sentence || '(待AI生成)'))
    );
    console.log('\nDry-run 完成，未寫入任何檔案。');
    return;
  }

  fs.writeFileSync(VOCAB_PATH, JSON.stringify(upgraded, null, 2), 'utf8');
  const distDir = path.join(ROOT, 'dist', 'data');
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'vocabulary.json'), JSON.stringify(upgraded, null, 2), 'utf8');
  }
  if (fs.existsSync(PROGRESS_PATH)) fs.unlinkSync(PROGRESS_PATH);

  const ws = upgraded.filter(w => w.sentence).length;
  console.log('\n升級完成！');
  console.log('  difficultyLevel 分配：' + upgraded.length + ' 字');
  console.log('  含預載例句：' + ws + '/' + upgraded.length + ' 字');
  console.log('\n下一步：');
  console.log('  git add data/vocabulary.json');
  console.log("  git commit -m '升級 vocabulary.json：新增 difficultyLevel + 預載例句'");
}

main().catch(err => { console.error('執行失敗：', err.message); process.exit(1); });
