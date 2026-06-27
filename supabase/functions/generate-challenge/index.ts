import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PUBLIC_DATA_BASE = 'https://hs5743.github.io/english-word-king/data'

type FallbackWord = {
  word: string
  zh: string
  topic: string
  grade: number
  chunks: string[]
  phonetic: string
  pattern?: string
  sentence: string
  sentenceZh: string
}

type PublicVocabularyItem = {
  id?: string
  word?: string
  zh?: string
  topic?: string
  gradeBand?: string
  chunks?: string[]
  patterns?: string[]
  enabled?: boolean
}

type PublicPatternItem = {
  id?: string
  pattern?: string
  zhHint?: string
  gradeBand?: string
  slots?: string[]
  exampleAnswer?: string
  enabled?: boolean
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

const gemTiers: { name: string, min: number, maxGrade: number, hardness: number, desc: string }[] = [
  { name: "滑石 (Talc) 🌱", min: 0, maxGrade: 3, hardness: 1, desc: "世界上最柔軟的礦物，硬度只有 1，常用來製作爽身粉，摸起來滑滑的！" },
  { name: "石膏 (Gypsum) 🐚", min: 5, maxGrade: 3, hardness: 2, desc: "硬度 2，非常容易被指甲刮傷，常被用來製作雕塑 and 粉筆喔！" },
  { name: "方解石 (Calcite) 💎", min: 12, maxGrade: 3, hardness: 3, desc: "硬度 3，具有很有趣的雙折射現象，光線穿過它會變兩條！" },
  { name: "螢石 (Fluorite) 🌟", min: 20, maxGrade: 3, hardness: 4, desc: "硬度 4，因為在紫外線照射下會發出美麗螢光而得名，顏色非常豐富。" },
  { name: "磷灰石 (Apatite) 🦕", min: 30, maxGrade: 4, hardness: 5, desc: "硬度 5，它是我們牙齒和骨骼裡重要的礦物成分喔！" },
  { name: "正長石 (Orthoclase) 🪵", min: 42, maxGrade: 4, hardness: 6, desc: "硬度 6，常出現在花崗岩中，是地殼中非常豐富的長石類礦物。" },
  { name: "石英 / 水晶 (Quartz) 🔮", min: 55, maxGrade: 4, hardness: 7, desc: "硬度 7，成分是二氧化矽，純淨時透明如冰，常被做成漂亮的裝飾品。" },
  { name: "黃玉 / 托帕石 (Topaz) 💛", min: 70, maxGrade: 4, hardness: 8, desc: "硬度 8，通常呈現金黃色 or 天藍色，在古代被視為友誼與希望的象徵。" },
  { name: "石榴石 (Garnet) 🍇", min: 82, maxGrade: 5, hardness: 7.5, desc: "硬度 7.5，形狀和顏色很像紅石榴的種子，古代常當作護身符。" },
  { name: "翡翠 / 硬玉 (Jadeite) 💚", min: 95, maxGrade: 5, hardness: 7, desc: "硬度 7，質地細膩堅韌，在東方文化中象徵著吉祥與好運。" },
  { name: "電氣石 / 碧璽 (Tourmaline) 🎨", min: 110, maxGrade: 5, hardness: 7.5, desc: "硬度 7.5，具有熱電性，加熱時會產生微量電荷，能呈現彩虹般的色彩。" },
  { name: "剛玉 / 紅藍寶石 (Corundum) ❤️", min: 125, maxGrade: 5, hardness: 9, desc: "硬度 9，僅次於鑽石。紅色品種是紅寶石，其他顏色都叫藍寶石。" },
  { name: "蛋白石 (Opal) 🌈", min: 140, maxGrade: 6, hardness: 6, desc: "硬度 6，擁有獨特的「遊彩現象」，在光線下會折射出彩虹般的斑斕光芒。" },
  { name: "祖母綠 (Emerald) 🌲", min: 155, maxGrade: 6, hardness: 8, desc: "硬度 8，擁有極具代表性的翠綠色，被譽為綠色寶石之王。" },
  { name: "貓眼石 (Chrysoberyl) 🐱", min: 175, maxGrade: 6, hardness: 8.5, desc: "硬度 8.5，具有神奇的貓眼效應，在光照下會出現一條明亮的光帶。" },
  { name: "鑽石 (Diamond) 👑", min: 200, maxGrade: 9, hardness: 10, desc: "硬度 10，自然界中硬度最高的終極王者，火彩璀璨，象徵永恆的榮耀。" }
]

function selectCandidatePool(
  available: FallbackWord[], 
  mastery: Record<string, number>, 
  wrongWords: string[]
): FallbackWord[] {
  const weakPool = available.filter(w => wrongWords.includes(w.word) || mastery[w.word] === 0)
  const learningPool = available.filter(w => mastery[w.word] === 1 || mastery[w.word] === 2)
  const masteredPool = available.filter(w => mastery[w.word] === 3)
  const newPool = available.filter(w => mastery[w.word] === undefined)

  const shuffledWeak = shuffle(weakPool)
  const shuffledNew = shuffle(newPool)
  const shuffledLearning = shuffle(learningPool)
  const shuffledMastered = shuffle(masteredPool)

  const selected: FallbackWord[] = []
  
  const targetWeak = Math.min(8, shuffledWeak.length)
  const targetNew = Math.min(12, shuffledNew.length)
  const targetLearning = Math.min(8, shuffledLearning.length)
  const targetMastered = Math.min(2, shuffledMastered.length)

  selected.push(...shuffledWeak.slice(0, targetWeak))
  selected.push(...shuffledNew.slice(0, targetNew))
  selected.push(...shuffledLearning.slice(0, targetLearning))
  selected.push(...shuffledMastered.slice(0, targetMastered))

  const selectedWords = new Set(selected.map(w => w.word))
  const remaining = available.filter(w => !selectedWords.has(w.word))
  const shuffledRemaining = shuffle(remaining)
  
  const needed = Math.min(30, available.length) - selected.length
  if (needed > 0) {
    selected.push(...shuffledRemaining.slice(0, needed))
  }

  return selected
}

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

    // 解析請求參數
    const body = await req.json().catch(() => ({}))
    const { grade, wrongWords = [], isPractice = false, testUid = '' } = body

    if (!grade || grade < 3 || grade > 9) {
      return errorResponse(400, 'invalid_grade', '年級參數錯誤（需介於 3~9 年級）。')
    }

    // 2. 驗證學生身份 (支援 X-Developer-Secret 測試通道)
    const authHeader = req.headers.get('Authorization')
    const devSecret = req.headers.get('X-Developer-Secret')
    let user = null

    if (devSecret === 'super-secret-test-token-2026' && testUid) {
      user = { id: testUid, email: 'tester@gapp.hcc.edu.tw' }
    } else {
      if (!authHeader) {
        return errorResponse(401, 'unauthorized', '請先登入再進行挑戰。')
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)

      if (authError || !authUser) {
        return errorResponse(401, 'unauthorized', '登入驗證失敗，請重新登入。')
      }
      user = authUser
    }

    // 3. 驗證信箱網域（必須是 @gapp.hcc.edu.tw）
    const email = user.email ?? ''
    if (!email.endsWith('@gapp.hcc.edu.tw') && devSecret !== 'super-secret-test-token-2026') {
      return errorResponse(403, 'invalid_domain', '僅限新竹縣學校帳號（@gapp.hcc.edu.tw）使用。')
    }

    // 4.5 讀取學生的 mastery 欄位與級數
    let studentMastery: Record<string, number> = {}
    let studentGrade = grade
    try {
      if (devSecret === 'super-secret-test-token-2026' && body.testMastery) {
        studentMastery = body.testMastery
      } else {
        const { data: studentProfile, error: profileError } = await supabase
          .from('students')
          .select('mastery, grade')
          .eq('uid', user.id)
          .single()
        
        if (!profileError && studentProfile) {
          if (studentProfile.mastery && typeof studentProfile.mastery === 'object') {
            studentMastery = studentProfile.mastery as Record<string, number>
          }
          if (studentProfile.grade) {
            studentGrade = studentProfile.grade
          }
        }
      }
    } catch (err) {
      console.warn('讀取學生 Mastery 與年級失敗，使用預設值:', getErrorMessage(err))
    }

    // 計算熟練單字數 (熟練度 >= 2 的單字數)
    let masteredCount = 0
    for (const key in studentMastery) {
      if (studentMastery[key] >= 2) {
        masteredCount++
      }
    }

    // 找出目前等級
    let currentTierIndex = 0
    for (let i = gemTiers.length - 1; i >= 0; i--) {
      if (masteredCount >= gemTiers[i].min) {
        currentTierIndex = i
        break
      }
    }
    const currentTier = gemTiers[currentTierIndex]
    const nextTier = gemTiers[currentTierIndex + 1]
    const adaptiveMaxGrade = currentTier.maxGrade

    console.log(`[Adaptive Learning] Student UID: ${user.id}, Mastered: ${masteredCount}, Tier: ${currentTier.name}, Max Grade: ${adaptiveMaxGrade}`)

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

    // 7. 載入題庫與過濾符合適性上限的單字
    const fallbackBank = await loadPublicFallbackWords(adaptiveMaxGrade)
    const candidatePool = selectCandidatePool(fallbackBank, studentMastery, wrongWords)
    const candidatesJson = candidatePool.map(c => ({
      word: c.word,
      zh: c.zh,
      topic: c.topic,
      chunks: c.chunks,
      pattern: c.pattern
    }))

    // 8. 建立出題 Prompt
    const gradeLabel = studentGrade <= 6 ? `國小 ${studentGrade} 年級` : `國中 ${studentGrade - 6} 年級`
    const randomContext = contexts[Math.floor(Math.random() * contexts.length)]

    const prompt = `你是一位專業的台灣小學英語老師。請為${gradeLabel}學生出 12 題英語單字挑戰題，融入生活/校園情境「${randomContext}」。

【重要約束】：
你只能從以下提供的 30 個【候選單字清單】中選擇其中的 12 個單字來出題。絕對不能使用清單之外的單字！
對於你挑選的每一題單字，其 "word"、"zh"、"topic"、"chunks"、"pattern" 必須完全與候選清單中提供的數值一致。

【候選單字清單】：
${JSON.stringify(candidatesJson, null, 2)}

回傳格式必須是 JSON 陣列，每個元素包含以下欄位：
- word: 英文單字（小寫，必須完全匹配候選清單中的 word）
- zh: 中文翻譯（必須完全匹配候選清單中的 zh）
- topic: 主題類別（必須完全匹配候選清單中的 topic）
- chunks: 音節分割陣列（必須完全匹配候選清單中的 chunks）
- pattern: 基本句型結構說明（必須完全匹配候選清單中的 pattern）
- exampleSentence: 使用該單字對應的 pattern (基本句型) 並帶入單字所生成的完整句子或對話。句子必須包含該 target word。例如對應句型為 "What is this? - It's a [word]."，帶入 apple 則生成 "What is this? It's an apple."
- sentenceZh: exampleSentence 的中文翻譯
- fillBlank: 將 exampleSentence 中對應 word 的單字替換為 "____" 得到的填空句
- distractors: 與 word 詞性及難度相近 of 3 個英文干擾選項（不可包含 word，且不能與 word 相同）

請直接輸出 JSON 陣列，不要有任何說明文字。`

    // 9. AI 出題（三段 Failover）
    let challengeData: any[] | null = null
    let lastError: unknown = null
    let challengeSource = 'ai'

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
      challengeSource = 'fallback'
      challengeData = buildFallbackChallenge(adaptiveMaxGrade, wrongWords, candidatePool, fallbackBank)
    }

    // 10. 驗證與過濾回傳資料格式
    const finalChallenge = normalizeChallenge(challengeData, adaptiveMaxGrade, candidatePool, fallbackBank)

    return new Response(
      JSON.stringify({
        success: true,
        source: challengeSource,
        fallbackSize: fallbackBank.length,
        levelTitle: currentTier.name,
        levelIndex: currentTierIndex + 1,
        levelDescription: `【莫氏硬度: ${currentTier.hardness}】\n${currentTier.desc}`,
        masteredCount: masteredCount,
        nextLevelThreshold: nextTier ? nextTier.min : -1,
        challengeData: finalChallenge
      }),
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

async function loadPublicFallbackWords(grade: number): Promise<FallbackWord[]> {
  try {
    const [vocabularyRes, patternsRes] = await Promise.all([
      fetch(`${PUBLIC_DATA_BASE}/vocabulary.json`),
      fetch(`${PUBLIC_DATA_BASE}/sentence-patterns.json`),
    ])

    if (!vocabularyRes.ok || !patternsRes.ok) {
      throw new Error(`public data fetch failed: ${vocabularyRes.status}/${patternsRes.status}`)
    }

    const vocabulary = await vocabularyRes.json() as PublicVocabularyItem[]
    const patterns = await patternsRes.json() as PublicPatternItem[]
    const patternById = new Map(
      patterns
        .filter(item => item.enabled !== false && item.id)
        .map(item => [item.id as string, item])
    )
    const maxGrade = Math.max(3, grade)
    const mapped = vocabulary
      .filter(item => item.enabled !== false && item.word)
      .map(item => toFallbackWord(item, patternById))
      .filter(item => item.grade <= maxGrade)

    if (mapped.length >= 12) return mapped
    throw new Error(`public fallback has only ${mapped.length} usable words`)
  } catch (err) {
    console.warn('Public fallback data unavailable; using embedded fallback:', getErrorMessage(err))
    return fallbackWords.filter(w => w.grade <= Math.max(3, grade))
  }
}

function toFallbackWord(item: PublicVocabularyItem, patternById: Map<string, PublicPatternItem>): FallbackWord {
  const patternId = Array.isArray(item.patterns) ? item.patterns[0] : ''
  const pattern = patternId ? patternById.get(patternId) : undefined
  const word = String(item.word || '').toLowerCase().trim()
  const exampleAnswer = pattern?.exampleAnswer || `I can see ${word}.`
  const patternText = pattern?.pattern || 'Practice sentence'
  const sentence = exampleAnswer.toLowerCase().includes(word)
    ? exampleAnswer
    : `${patternText} ${exampleAnswer}`

  return {
    word,
    zh: item.zh || word,
    topic: item.topic || 'Daily',
    grade: parseGradeBand(item.gradeBand || pattern?.gradeBand),
    chunks: Array.isArray(item.chunks) && item.chunks.length ? item.chunks : chunkWord(word),
    phonetic: '',
    pattern: patternText,
    sentence,
    sentenceZh: pattern?.zhHint || '',
  }
}

function parseGradeBand(gradeBand?: string): number {
  const match = String(gradeBand || '').match(/\d+/)
  return match ? Number(match[0]) : 3
}

function chunkWord(word: string): string[] {
  if (word.length <= 4) return [word]
  const chunks: string[] = []
  for (let i = 0; i < word.length; i += 3) chunks.push(word.slice(i, i + 3))
  return chunks
}

function buildFallbackChallenge(
  grade: number, 
  wrongWords: string[] = [], 
  candidatePool: FallbackWord[] = [], 
  bank: FallbackWord[] = fallbackWords
): ChallengeItem[] {
  const available = bank.filter(w => w.grade <= Math.max(3, grade))
  const pool = candidatePool.length >= 12 ? candidatePool : [...candidatePool, ...available]
  const shuffledPool = shuffle(pool).filter((item, index, arr) =>
    arr.findIndex(other => other.word === item.word) === index
  )
  const expanded: FallbackWord[] = []
  while (expanded.length < 12) {
    expanded.push(...shuffledPool)
  }
  return expanded.slice(0, 12).map(item => toChallengeItem(item, available))
}

function normalizeChallenge(
  items: any[], 
  grade: number, 
  candidatePool: FallbackWord[] = [], 
  bank: FallbackWord[] = fallbackWords
): ChallengeItem[] {
  const available = bank.filter(w => w.grade <= Math.max(3, grade))
  const poolMap = new Map(candidatePool.map(c => [c.word.toLowerCase().trim(), c]))
  const usedWords = new Set<string>()
  const validItems: ChallengeItem[] = []

  // 1. 過濾出符合約束的題目
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || !item.word) continue
      const wordClean = String(item.word).toLowerCase().trim()
      const candidate = poolMap.get(wordClean)
      
      // 必須存在於候選池中，且這次挑戰中尚未重複使用
      if (candidate && !usedWords.has(wordClean)) {
        usedWords.add(wordClean)
        const sentence = item.exampleSentence || item.sentence || candidate.sentence
        validItems.push({
          word: wordClean,
          zh: candidate.zh, // 強制使用題庫標準中文
          topic: candidate.topic, // 強制使用題庫標準主題
          chunks: candidate.chunks, // 強制使用題庫標準音節
          phonetic: item.phonetic || candidate.phonetic || '',
          pattern: candidate.pattern || 'Practice sentence', // 強制使用題庫標準句型
          exampleSentence: sentence,
          sentenceZh: item.sentenceZh || candidate.sentenceZh,
          fillBlank: item.fillBlank || makeFillBlank(sentence, wordClean),
          distractors: buildDistractors(wordClean, available, item.distractors),
        })
      }
    }
  }

  // 2. 如果合格題目不足 12 題，使用候選池中未使用的單字補齊
  if (validItems.length < 12) {
    const remainingCandidates = candidatePool.filter(c => !usedWords.has(c.word.toLowerCase().trim()))
    const shuffledRemaining = shuffle(remainingCandidates)
    
    for (const item of shuffledRemaining) {
      if (validItems.length >= 12) break
      const wordClean = item.word.toLowerCase().trim()
      usedWords.add(wordClean)
      validItems.push(toChallengeItem(item, available))
    }
  }

  // 3. 如果依然不足 12 題，用 available 隨機補齊
  if (validItems.length < 12) {
    const remainingAvailable = available.filter(w => !usedWords.has(w.word.toLowerCase().trim()))
    const shuffledRemaining = shuffle(remainingAvailable)
    for (const item of shuffledRemaining) {
      if (validItems.length >= 12) break
      const wordClean = item.word.toLowerCase().trim()
      usedWords.add(wordClean)
      validItems.push(toChallengeItem(item, available))
    }
  }

  // 4. 最後的最後，如果還是不夠，允許重複使用 available 的字
  while (validItems.length < 12) {
    const item = available[validItems.length % available.length]
    validItems.push(toChallengeItem(item, available))
  }

  return validItems.slice(0, 12)
}

function toChallengeItem(item: FallbackWord, available: FallbackWord[]): ChallengeItem {
  return {
    word: item.word,
    zh: item.zh,
    topic: item.topic,
    chunks: item.chunks,
    phonetic: item.phonetic,
    pattern: item.pattern || 'Practice sentence',
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
