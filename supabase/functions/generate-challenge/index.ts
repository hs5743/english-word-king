import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type FallbackWord = {
  word: string
  zh: string
  topic: string
  grade: number
  chunks: string[]
  phonetic: string
  sentence: string
  sentenceZh: string
}

type ChallengeItem = {
  word: string
  zh: string
  topic: string
  chunks: string[]
  phonetic: string
  pattern: string
  exampleSentence: string
  sentenceZh: string
  fillBlank: string
  distractors: string[]
}

const contexts = ['校園生活', '家庭晚餐', '下課時間', '運動會', '生日派對', '圖書館', '超市購物', '週末出遊']

const fallbackWords: FallbackWord[] = [
  { word: 'apple', zh: '蘋果', topic: 'Food', grade: 3, chunks: ['ap', 'ple'], phonetic: '/ˈæpəl/', sentence: 'What is this? It is an apple.', sentenceZh: '這是什麼？它是一顆蘋果。' },
  { word: 'book', zh: '書', topic: 'School', grade: 3, chunks: ['book'], phonetic: '/bʊk/', sentence: 'What is that? It is a book.', sentenceZh: '那是什麼？它是一本書。' },
  { word: 'dog', zh: '狗', topic: 'Animals', grade: 3, chunks: ['dog'], phonetic: '/dɔg/', sentence: 'Is it a dog? Yes, it is.', sentenceZh: '它是一隻狗嗎？是的。' },
  { word: 'red', zh: '紅色', topic: 'Colors', grade: 3, chunks: ['red'], phonetic: '/rɛd/', sentence: 'What color is it? It is red.', sentenceZh: '它是什麼顏色？它是紅色。' },
  { word: 'mother', zh: '媽媽', topic: 'Family', grade: 4, chunks: ['mo', 'ther'], phonetic: '/ˈmʌðər/', sentence: 'Who is she? She is my mother.', sentenceZh: '她是誰？她是我的媽媽。' },
  { word: 'run', zh: '跑', topic: 'Sports', grade: 4, chunks: ['run'], phonetic: '/rʌn/', sentence: 'What can you do? I can run.', sentenceZh: '你會做什麼？我會跑步。' },
  { word: 'sunny', zh: '晴朗的', topic: 'Weather', grade: 4, chunks: ['sun', 'ny'], phonetic: '/ˈsʌni/', sentence: 'How is the weather? It is sunny.', sentenceZh: '天氣如何？天氣晴朗。' },
  { word: 'teacher', zh: '老師', topic: 'School', grade: 5, chunks: ['tea', 'cher'], phonetic: '/ˈtitʃər/', sentence: 'Is she a teacher? Yes, she is.', sentenceZh: '她是老師嗎？是的。' },
  { word: 'water', zh: '水', topic: 'Food', grade: 5, chunks: ['wa', 'ter'], phonetic: '/ˈwɔtər/', sentence: 'What do you want? I want water.', sentenceZh: '你想要什麼？我想要水。' },
  { word: 'library', zh: '圖書館', topic: 'School', grade: 6, chunks: ['li', 'brar', 'y'], phonetic: '/ˈlaɪbrɛri/', sentence: 'Where are you going? I am going to the library.', sentenceZh: '你要去哪裡？我要去圖書館。' },
  { word: 'doctor', zh: '醫生', topic: 'Jobs', grade: 6, chunks: ['doc', 'tor'], phonetic: '/ˈdɑktər/', sentence: 'Is he a doctor? Yes, he is.', sentenceZh: '他是醫生嗎？是的。' },
  { word: 'basketball', zh: '籃球', topic: 'Sports', grade: 6, chunks: ['bas', 'ket', 'ball'], phonetic: '/ˈbæskɪtbɔl/', sentence: 'Do you like basketball? Yes, I do.', sentenceZh: '你喜歡籃球嗎？是的，我喜歡。' },
]

// ─── 主服務入口 ───────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. 初始化 Supabase（使用 Service Role 以讀取 system_config）
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 2. 驗證學生 JWT Token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse(401, 'unauthorized', '請先登入再進行挑戰。')
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return errorResponse(401, 'unauthorized', '登入驗證失敗，請重新登入。')
    }

    // 3. 驗證信箱網域（必須是 @gapp.hcc.edu.tw）
    const email = user.email ?? ''
    if (!email.endsWith('@gapp.hcc.edu.tw')) {
      return errorResponse(403, 'invalid_domain', '僅限新竹縣學校帳號（@gapp.hcc.edu.tw）使用。')
    }

    // 4. 解析請求參數
    const { grade, wrongWords = [], isPractice = false } = await req.json()

    if (!grade || grade < 3 || grade > 9) {
      return errorResponse(400, 'invalid_grade', '年級參數錯誤（需介於 3~9 年級）。')
    }

    // 5. 每日計分挑戰次數限制（練習模式不限制）
    if (!isPractice) {
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }) // yyyy-mm-dd

      const { data: attempts, error: checkError } = await supabase
        .from('daily_attempts')
        .select('id')
        .eq('student_uid', user.id)
        .eq('date', today)
        .eq('practice', false)

      if (checkError) throw checkError

      if (attempts && attempts.length > 0) {
        return errorResponse(400, 'limit_reached',
          '您今天已完成計分挑戰！每天限 1 次計分，其餘請進行練習模式。')
      }
    }

    // 6. 讀取 AI 金鑰（從 system_config，前端永遠看不到）
    const { data: configRows, error: configError } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['gemini_api_key', 'gemini_api_key_backup', 'groq_api_key'])

    if (configError) console.warn('讀取 AI 設定失敗，改用內建題庫 fallback:', configError.message)

    const keys = Object.fromEntries((configRows || []).map(r => [r.key, r.value])) as Record<string, string>

    // 7. 建立出題 Prompt
    const gradeLabel = grade <= 6 ? `國小 ${grade} 年級` : `國中 ${grade - 6} 年級`
    const wrongList = wrongWords.length > 0
      ? `\n\n【歷史錯題優先出題】：${JSON.stringify(wrongWords)}`
      : ''

    // 定義教育部 110 課綱國小基本學習內容句型
    const curriculumPatterns: Record<number, string[]> = {
      3: [
        "What's your name? - My name is [word/name].",
        "What's this/that? - It's a/an [word].",
        "What color is it? - It's [word/color].",
        "Is it/this/that a/an [word]? - Yes, it is. / No, it's not."
      ],
      4: [
        "What's your name? - My name is [word/name].",
        "What's this/that? - It's a/an [word].",
        "What color is it? - It's [word/color].",
        "Is it/this/that a/an [word]? - Yes, it is. / No, it's not."
      ],
      5: [
        "Who is he/she? - He's/She's my [word/family_member].",
        "How old are you? - I'm [word/number] years old.",
        "What can you do? - I can [word/verb].",
        "Can you [word/verb]? - Yes, I can. / No, I can't.",
        "What do you want/see/like? - I want/see/like [word]s.",
        "What time is it? - It's [word/number] o'clock.",
        "How's the weather? - It's [word/weather]."
      ],
      6: [
        "Are you a [word/job]? - Yes, I am. / No, I'm not.",
        "Is he/she a [word/job]? - Yes, he/she is. / No, he's/she's not.",
        "What are you doing? - I'm [word/verb-ing].",
        "What is he/she doing? - He's/She's [word/verb-ing].",
        "Do you like [word/noun]? - Yes, I do. / No, I don't.",
        "Where are you? - I'm in/at the [word/place].",
        "Where are you going? - I'm going to the [word/place].",
        "Where is my [word/object]? - It's in/on/under the box."
      ]
    };

    // 取得該年級句型 (預設為國小 3-6 年級句型，國中生則使用較進階之變化型)
    const activePatterns = curriculumPatterns[grade] || curriculumPatterns[6];
    const patternsText = activePatterns.map((p, i) => `${i + 1}. ${p}`).join('\n');
    const randomContext = contexts[Math.floor(Math.random() * contexts.length)]

    const prompt = `你是一位專業的台灣小學英語老師。請為${gradeLabel}學生出 12 題英語單字挑戰題，融入生活/校園情境「${randomContext}」。

核心要求：
每一題必須從該年級的【課綱指定基本句型】中選擇一個句型，並搭配該題的 target word 填入句型中，生成該題的 exampleSentence。

【本年級課綱指定基本句型】：
${patternsText}

回傳格式必須是 JSON 陣列，每個元素包含以下欄位：
- word: 英文單字（小寫，必須是符合${gradeLabel}程度的教育部課綱單字）
- zh: 中文翻譯
- topic: 主題類別（Food / Animals / Colors / Family / School / Body / Transport / Weather / Sports / Nature / Daily 其中之一）
- chunks: 音節分割陣列（例如 ["ap","ple"]）
- phonetic: 簡化音標（例如 /ˈæp.əl/）
- pattern: 該題所使用的基本句型結構說明（例如 "What can you do? - I can [verb]."）
- exampleSentence: 使用指定句型結構並帶入單字所生成的完整句子或對話（例如 "What can you do? I can run."，若句型為問答對話，請以單一字串呈現，中間以空格或標點隔開，單字本身應為 ${gradeLabel} 程度）
- sentenceZh: exampleSentence 的中文翻譯
- fillBlank: 將 exampleSentence 中對應 word 的單字替換為 "____" 得到的填空句
- distractors: 與 word 詞性及難度相近的 3 個英文干擾選項（不可包含 word）

難度需符合 ${gradeLabel} 程度的教育部基本英語學習內容字詞。${wrongList}

請直接輸出 JSON 陣列，不要有任何說明文字。`

    // 8. AI 出題（三段 Failover）
    let challengeData: any[] | null = null
    let lastError: unknown = null

    // 嘗試 1：主要 Gemini 金鑰
    if (keys.gemini_api_key && keys.gemini_api_key !== 'REPLACE_WITH_YOUR_GEMINI_KEY') {
      try {
        challengeData = await callGemini(keys.gemini_api_key, prompt)
        console.log('✅ Gemini 主金鑰出題成功')
      } catch (err) {
        console.warn('⚠️ Gemini 主金鑰失敗，嘗試備援...', getErrorMessage(err))
        lastError = err
      }
    }

    // 嘗試 2：備用 Gemini 金鑰
    if (!challengeData && keys.gemini_api_key_backup) {
      try {
        challengeData = await callGemini(keys.gemini_api_key_backup, prompt)
        console.log('✅ Gemini 備援金鑰出題成功')
      } catch (err) {
        console.warn('⚠️ Gemini 備援失敗，嘗試 Groq...', getErrorMessage(err))
        lastError = err
      }
    }

    // 嘗試 3：Groq Llama 3 備援
    if (!challengeData && keys.groq_api_key) {
      try {
        challengeData = await callGroq(keys.groq_api_key, prompt)
        console.log('✅ Groq 備援出題成功')
      } catch (err) {
        console.error('❌ 所有 AI 提供商均失敗', getErrorMessage(err))
        lastError = err
      }
    }

    if (!challengeData) {
      console.warn(`AI 出題失敗，改用內建題庫 fallback：${lastError ? getErrorMessage(lastError) : '無可用金鑰'}`)
      challengeData = buildFallbackChallenge(grade, wrongWords)
    }

    // 9. 驗證回傳資料格式
    if (!Array.isArray(challengeData) || challengeData.length === 0) {
      console.warn('AI 回傳格式異常，改用內建題庫 fallback。')
      challengeData = buildFallbackChallenge(grade, wrongWords)
    }

    return new Response(
      JSON.stringify({ success: true, challengeData: normalizeChallenge(challengeData, grade) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Edge Function 錯誤：', err)
    return errorResponse(500, 'server_error', getErrorMessage(err) || '伺服器發生錯誤，請稍後再試。')
  }
})

// ─── 輔助函數 ─────────────────────────────────────────────────

function errorResponse(status: number, code: string, message: string) {
  return new Response(
    JSON.stringify({ success: false, error: code, message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err || '')
}

function buildFallbackChallenge(grade: number, wrongWords: string[] = []): ChallengeItem[] {
  const available = fallbackWords.filter(w => w.grade <= Math.max(3, grade))
  const preferred = wrongWords
    .map(word => available.find(w => w.word === word))
    .filter((item): item is FallbackWord => Boolean(item))
  const pool: FallbackWord[] = [...preferred, ...shuffle(available)].filter((item, index, arr) =>
    arr.findIndex(other => other.word === item.word) === index
  )
  const expanded: FallbackWord[] = []
  while (expanded.length < 12) {
    expanded.push(...pool)
  }
  return expanded.slice(0, 12).map(item => toChallengeItem(item, available))
}

function normalizeChallenge(items: any[], grade: number): ChallengeItem[] {
  const available = fallbackWords.filter(w => w.grade <= Math.max(3, grade))
  const source = items.length >= 12 ? items : [...items, ...buildFallbackChallenge(grade)]
  return source.slice(0, 12).map((item, index) => {
    const fallback = available[index % available.length]
    const word = String(item.word || fallback.word).toLowerCase().trim()
    const sentence = item.exampleSentence || item.sentence || fallback.sentence
    return {
      word,
      zh: item.zh || fallback.zh,
      topic: item.topic || fallback.topic,
      chunks: Array.isArray(item.chunks) && item.chunks.length ? item.chunks : fallback.chunks,
      phonetic: item.phonetic || fallback.phonetic,
      pattern: item.pattern || '課綱基本句型',
      exampleSentence: sentence,
      sentenceZh: item.sentenceZh || fallback.sentenceZh,
      fillBlank: item.fillBlank || makeFillBlank(sentence, word),
      distractors: buildDistractors(word, available, item.distractors),
    }
  })
}

function toChallengeItem(item: FallbackWord, available: FallbackWord[]): ChallengeItem {
  return {
    word: item.word,
    zh: item.zh,
    topic: item.topic,
    chunks: item.chunks,
    phonetic: item.phonetic,
    pattern: '內建課綱句型',
    exampleSentence: item.sentence,
    sentenceZh: item.sentenceZh,
    fillBlank: makeFillBlank(item.sentence, item.word),
    distractors: buildDistractors(item.word, available),
  }
}

function makeFillBlank(sentence: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return sentence.replace(new RegExp(`\\b${escaped}\\b`, 'i'), '____')
}

function buildDistractors(word: string, available: FallbackWord[], provided: string[] = []): string[] {
  const clean = provided.filter(d => d && d !== word).slice(0, 3)
  const fill = shuffle(available.map(item => item.word).filter(candidate => candidate !== word && !clean.includes(candidate)))
  return [...clean, ...fill].slice(0, 3)
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5)
}

async function callGemini(key: string, prompt: string): Promise<any[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 2048,
      }
    })
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini API 錯誤 ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini 回傳內容為空')
  return JSON.parse(text)
}

async function callGroq(key: string, prompt: string): Promise<any[]> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [
        {
          role: 'system',
          content: 'You are a Taiwan English teacher. Always respond with a valid JSON array only, no other text.'
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Groq API 錯誤 ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  const rawText = data.choices?.[0]?.message?.content
  if (!rawText) throw new Error('Groq 回傳內容為空')
  const parsed = JSON.parse(rawText)
  // Groq 有時將陣列包在物件中
  return Array.isArray(parsed) ? parsed : (parsed.questions || parsed.words || parsed.data || [])
}
