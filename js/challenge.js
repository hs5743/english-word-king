/**
 * 新港國小英語單字王 — 挑戰主邏輯 (challenge.js)
 * ============================================================
 * 功能模組：
 *   1. 初始化與登入驗證
 *   2. 載入題目（呼叫 Deno Edge Function，整合教育部基本學習內容句型）
 *   3. 題型分流與動態渲染（Spelling、Speech、Sentence）
 *   4. Tile Mode (字磚拼字)、Type Mode (單字打字)、MCQ Mode (選擇題)
 *   5. Speech Mode (AI 語音口說對齊診斷)
 *   6. Sentence Pattern Practice (課綱句型融入與口說挑戰)
 *   7. 間隔複習與熟練度管理 (Spaced Repetition)
 *   8. 多維度排行榜切換與歷史紀錄寫入
 */

;(function () {
  'use strict'

  // 16階礦物寶石等級科普定義
  const gemTiers = [
    { name: "滑石 (Talc)", emoji: "🌱", min: 0, hardness: 1, desc: "世界上最柔軟的礦物，硬度只有 1，常用來製作爽身粉，摸起來滑滑的！" },
    { name: "石膏 (Gypsum)", emoji: "🐚", min: 5, hardness: 2, desc: "硬度 2，非常容易被指甲刮傷，常被用來製作雕塑和粉筆喔！" },
    { name: "方解石 (Calcite)", emoji: "💎", min: 12, hardness: 3, desc: "硬度 3，具有很有趣的雙折射現象，光線穿過它會變兩條！" },
    { name: "螢石 (Fluorite)", emoji: "🌟", min: 20, hardness: 4, desc: "硬度 4，因為在紫外線照射下會發出美麗螢光而得名，顏色非常豐富。" },
    { name: "磷灰石 (Apatite)", emoji: "🦕", min: 30, hardness: 5, desc: "硬度 5，它是我們牙齒和骨骼裡重要的礦物成分喔！" },
    { name: "正長石 (Orthoclase)", emoji: "🪵", min: 42, hardness: 6, desc: "硬度 6，常出現在花崗岩中，是地殼中非常豐富的長石類礦物。" },
    { name: "石英 / 水晶 (Quartz)", emoji: "🔮", min: 55, hardness: 7, desc: "硬度 7，成分是二氧化矽，純淨時透明如冰，常被做成漂亮的裝飾品。" },
    { name: "黃玉 / 托帕石 (Topaz)", emoji: "💛", min: 70, hardness: 8, desc: "硬度 8，通常呈現金黃色或天藍色，在古代被視為友誼與希望的象徵。" },
    { name: "石榴石 (Garnet)", emoji: "🍇", min: 82, hardness: 7.5, desc: "硬度 7.5，形狀和顏色很像紅石榴的種子，古代常當作護身符。" },
    { name: "翡翠 / 硬玉 (Jadeite)", emoji: "💚", min: 95, hardness: 7, desc: "硬度 7，質地細膩堅韌，在東方文化中象徵著吉祥與好運。" },
    { name: "電氣石 / 碧璽 (Tourmaline)", emoji: "🎨", min: 110, hardness: 7.5, desc: "硬度 7.5，具有熱電性，加熱時會產生微量電荷，能呈現彩虹般的色彩。" },
    { name: "剛玉 / 紅藍寶石 (Corundum)", emoji: "❤️", min: 125, hardness: 9, desc: "硬度 9，僅次於鑽石。紅色品種是紅寶石，其他顏色都叫藍寶石。" },
    { name: "蛋白石 (Opal)", emoji: "🌈", min: 140, hardness: 6, desc: "硬度 6，擁有獨特的「遊彩現象」，在光線下會折射出彩虹般的斑斕光芒。" },
    { name: "祖母綠 (Emerald)", emoji: "🌲", min: 155, hardness: 8, desc: "硬度 8，擁有極具代表性的翠綠色，被譽為綠色寶石之王。" },
    { name: "貓眼石 (Chrysoberyl)", emoji: "🐱", min: 175, hardness: 8.5, desc: "硬度 8.5，具有神奇的貓眼效應，在光照下會出現一條明亮的光帶。" },
    { name: "鑽石 (Diamond)", emoji: "👑", min: 200, hardness: 10, desc: "硬度 10，自然界中硬度最高的終極王者，火彩璀璨，象徵永恆的榮耀。" }
  ]

  // 全域狀態變數
  let supabase = null
  let currentUser = null
  let studentProfile = null
  let initialGemTierIndex = -1
  let currentSpeechRate = 0.85
  let currentMode = 'daily'        // daily (每日計分) | free (自由練習) | class (課堂挑戰)
  let currentType = 'spelling'     // spelling | speech | sentence
  let currentChallenge = []        // 12題題目資料
  let currentIndex = 0
  let isDoneToday = false          // 今天是否已挑戰過計分模式
  let currentSessionId = null      // 當前加入的課堂場次 UUID
  let speechBonusPoints = 0        // 口說額外加分
  let hasBonusAwarded = new Array(12).fill(false) // 避免重複加分
  let isSpellingRecording = false  // spelling 錄音狀態

  // 挑戰統計數據
  let correctCount = 0
  let sessionStars = 0
  let sessionWrongWords = []
  let sessionSpeechScores = []
  let questionAnswered = new Array(12).fill(false)
  let startTime = 0

  // Tile 模式狀態
  let tilePlacedLetters = []

  /* ═══════════════════════════════════════════════════════════
   * 1. BOOTSTRAP / INITIALIZATION
   * ═══════════════════════════════════════════════════════════ */

  async function init() {
    showLoading(true, '正在載入您的資料...')

    // 1. 等待 SupabaseConfig 載入
    let attempts = 0
    while (!window.SupabaseConfig && attempts < 50) {
      await new Promise(r => setTimeout(r, 100))
      attempts++
    }

    if (!window.SupabaseConfig) {
      showToast('系統設定載入失敗，請重新整理頁面。', 'error')
      return
    }

    supabase = window.SupabaseConfig.getSupabase()
    currentUser = await window.SupabaseConfig.getCurrentUser()

    if (!currentUser) {
      // 未登入，導向登入頁
      window.location.href = 'join.html'
      return
    }

    try {
      // 2. 獲取學生檔案
      let { data: profile, error: profileError } = await supabase
        .from('students')
        .select('*')
        .eq('uid', currentUser.id)
        .maybeSingle()

      if (profileError || !profile) {
        try {
          await window.SupabaseConfig.ensureStudentProfile(currentUser)
          const retry = await supabase
            .from('students')
            .select('*')
            .eq('uid', currentUser.id)
            .maybeSingle()
          profile = retry.data
          profileError = retry.error
        } catch (bootstrapError) {
          console.error('[Challenge] profile bootstrap error:', bootstrapError)
        }
      }

      if (profileError || !profile) {
        showToast('無法取得您的學生資料，請確認已在學生名冊並重新登入。', 'error')
        await new Promise(r => setTimeout(r, 2000))
        window.location.href = 'join.html'
        return
      }

      studentProfile = profile

      // 計算初始寶石等級索引
      let initialMasteredCount = 0
      if (studentProfile && studentProfile.mastery) {
        for (const word in studentProfile.mastery) {
          if (studentProfile.mastery[word] >= 2) {
            initialMasteredCount++
          }
        }
      }
      initialGemTierIndex = 0
      for (let i = gemTiers.length - 1; i >= 0; i--) {
        if (initialMasteredCount >= gemTiers[i].min) {
          initialGemTierIndex = i
          break
        }
      }

      // 3. 填寫頂部資訊列
      updateTopbarInfo()

      // 4. 檢查今日是否已挑戰過
      const initialClassCode = getInitialClassCode()
      if (initialClassCode) {
        await startClassFromCode(initialClassCode)
      } else {
        await checkTodayAttempt()

      // 5. 載入挑戰題目
        await loadSessionChallenge()
      }

    } catch (err) {
      console.error('[Challenge] Init error:', err)
      showToast('初始化發生錯誤，請重新整理。', 'error')
    }
  }

  // 更新頂部使用者資訊
  function updateTopbarInfo() {
    if (!studentProfile) return

    const name = studentProfile.name || currentUser.email
    const school = studentProfile.school || '新港國小'
    const className = studentProfile.class || ''

    document.getElementById('studentName').textContent = name
    document.getElementById('studentSchool').textContent = className
    document.getElementById('studentAvatar').textContent = name[0].toUpperCase()

    // 學校 Badge
    const badge = document.getElementById('schoolBadge')
    badge.textContent = school
    badge.className = 'school-badge'
    if (school === '新港國小') badge.classList.add('school-badge--xingang')
    else if (school === '鳳岡國小') badge.classList.add('school-badge--fenggong')
    else if (school === '豐田國小') badge.classList.add('school-badge--fengtian')

    // 天數與分數
    document.getElementById('streakCount').textContent = studentProfile.streak || 0
    document.getElementById('todayScore').textContent = studentProfile.total_score || 0

    // 寶石等級徽章
    let masteredCount = 0
    if (studentProfile.mastery) {
      for (const word in studentProfile.mastery) {
        if (studentProfile.mastery[word] >= 2) {
          masteredCount++
        }
      }
    }
    let currentTier = gemTiers[0]
    for (let i = gemTiers.length - 1; i >= 0; i--) {
      if (masteredCount >= gemTiers[i].min) {
        currentTier = gemTiers[i]
        break
      }
    }
    const levelBadge = document.getElementById('levelBadge')
    if (levelBadge) {
      levelBadge.textContent = `${currentTier.emoji} ${currentTier.name}`
      levelBadge.style.display = 'inline-flex'
    }
  }

  // 檢查今日是否有完成計分挑戰
  async function checkTodayAttempt() {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }) // yyyy-mm-dd
    const { data: attempts, error } = await supabase
      .from('daily_attempts')
      .select('id')
      .eq('student_uid', currentUser.id)
      .eq('date', today)
      .eq('practice', false)

    if (attempts && attempts.length > 0) {
      isDoneToday = true
      document.getElementById('dailyBadge').style.display = 'none'
      // 預設切換至自由練習
      switchMode('free', document.querySelector('[data-mode="free"]'))
    } else {
      isDoneToday = false
      document.getElementById('dailyBadge').style.display = 'inline-block'
      // 預設為每日挑戰
      switchMode('daily', document.querySelector('[data-mode="daily"]'))
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * 2. LOAD CHALLENGE FROM EDGE FUNCTION
   * ═══════════════════════════════════════════════════════════ */

  function getInitialClassCode() {
    const params = new URLSearchParams(window.location.search)
    const urlMode = params.get('mode')
    const urlCode = params.get('code')
    const storedCode = sessionStorage.getItem('pendingClassCode')
    const rawCode = urlMode === 'class' ? (urlCode || storedCode) : storedCode
    const code = String(rawCode || '').replace(/\D/g, '').slice(0, 6)
    return /^\d{6}$/.test(code) ? code : ''
  }

  function activateModeTab(mode) {
    document.querySelectorAll('.mode-tab').forEach(tab => {
      if (tab.dataset.mode === mode) tab.classList.add('active')
      else tab.classList.remove('active')
    })
  }

  async function startClassFromCode(code) {
    currentMode = 'class'
    currentSessionId = null
    activateModeTab('class')
    document.getElementById('sessionJoinCard').style.display = 'block'
    document.getElementById('challengeCard').style.display = 'none'
    document.getElementById('sessionJoinError').style.display = 'none'
    document.getElementById('sessionCodeInput').value = code
    sessionStorage.removeItem('pendingClassCode')
    await window.ChallengeApp.joinClassSession()
  }

  async function loadSessionChallenge() {
    showLoading(true, '正在呼叫 AI 生成題目中...')

    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) throw new Error('Session 已失效')

      // 取得錯題列表（按熟熟練度排序，取熟練度低於 3 且最低的前 5 個）
      const wrongWords = []
      if (studentProfile.mastery) {
        const sorted = Object.entries(studentProfile.mastery)
          .filter(([_, score]) => score < 3)
          .sort((a, b) => a[1] - b[1])
          .map(([word, _]) => word)
        wrongWords.push(...sorted.slice(0, 5))
      }

      const isPractice = (currentMode === 'free' || currentMode === 'class')

      const response = await fetch(`${window.SupabaseConfig.SUPABASE_URL}/functions/v1/generate-challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          grade: studentProfile.grade,
          wrongWords,
          isPractice
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '無法取得挑戰題目。')
      }

      const data = await response.json()
      currentChallenge = data.challengeData
      window.currentChallenge = currentChallenge // 讓外部/語音引擎可取用

      // 重設挑戰狀態
      currentIndex = 0
      correctCount = 0
      sessionStars = 0
      sessionWrongWords = []
      sessionSpeechScores = new Array(12).fill(0)
      questionAnswered = new Array(12).fill(false)
      startTime = Date.now()

      // 清空側邊欄紀錄
      document.getElementById('masteryList').innerHTML = ''
      document.getElementById('masteryListMobile').innerHTML = ''

      // 開始挑戰
      showLoading(false)
      renderQuestion(0)

    } catch (err) {
      console.error('[Challenge] Load error:', err)
      showToast(err.message || '出題失敗，請稍後重試。', 'error')
      showLoading(false)
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * 3. RENDER QUESTION
   * ═══════════════════════════════════════════════════════════ */

  function renderQuestion(index) {
    if (!currentChallenge || currentChallenge.length === 0) return
    currentIndex = index
    const q = currentChallenge[index]

    // 1. 更新進度標籤與進度條
    document.getElementById('qCurrent').textContent = index + 1
    const progressPct = ((index + 1) / 12) * 100
    document.getElementById('progressFill').style.width = progressPct + '%'

    // 2. 重置上一題的狀態
    resetQuestionState()

    // 3. 計分挑戰模式（Daily）：題目鎖定流，自由練習則依據當前所選 Tab 分流
    if (currentMode === 'daily') {
      // 0-3: spelling, 4-7: speech, 8-11: sentence
      let targetType = 'spelling'
      if (index >= 4 && index <= 7) targetType = 'speech'
      else if (index >= 8) targetType = 'sentence'

      currentType = targetType
      updateTypeTabsUI(targetType)
    }

    // 4. 分流渲染面板
    if (currentType === 'spelling') {
      showPanel('panelSpelling')
      renderSpellingQuestion(q, index)
    } else if (currentType === 'speech') {
      showPanel('panelSpeech')
      renderSpeechQuestion(q)
    } else if (currentType === 'sentence') {
      showPanel('panelSentence')
      renderSentenceQuestion(q)
    }

    // 5. 更新 Navigation 按鈕
    updateNavButtons()
  }

  function resetQuestionState() {
    // 隱裝所有答案 Reveal
    document.getElementById('spellingReveal').style.display = 'none'
    document.getElementById('speechResult').style.display = 'none'
    document.getElementById('sentenceReveal').style.display = 'none'
    document.getElementById('sentenceSpeechPrompt').style.display = 'none'
    document.getElementById('sentenceFollowUpSpeech').style.display = 'none'

    // 重設輸入框與 feedback
    document.getElementById('typeInput').value = ''
    document.getElementById('wordleFeedback').innerHTML = ''
    tilePlacedLetters = []

    // 停止語音
    if (window.SpeechEngine) {
      window.SpeechEngine.stopListening()
      window.SpeechEngine.stopSpeaking()
      window.SpeechEngine.stopWaveform()
    }
    document.getElementById('micBtn').classList.remove('listening')
    document.getElementById('sentenceMicBtn').classList.remove('listening')
    document.getElementById('sentenceFollowMic').classList.remove('listening')
    const spellingMicBtn = document.getElementById('spellingMicBtn')
    if (spellingMicBtn) spellingMicBtn.classList.remove('listening')

    document.getElementById('micStatus').textContent = '按麥克風開始朗讀'
    document.getElementById('followMicStatus').textContent = '按麥克風開始'
    const spellingMicStatus = document.getElementById('spellingMicStatus')
    if (spellingMicStatus) spellingMicStatus.textContent = '點擊按鈕，開始朗讀單字'
    isSpellingRecording = false
  }

  function updateTypeTabsUI(type) {
    document.querySelectorAll('.type-tab').forEach(btn => {
      if (btn.dataset.type === type) {
        btn.classList.add('active')
      } else {
        btn.classList.remove('active')
      }
    })
  }

  function showPanel(panelId) {
    document.querySelectorAll('.challenge-panel').forEach(p => {
      p.classList.remove('active')
    })
    document.getElementById(panelId).classList.add('active')
  }

  function updateNavButtons() {
    const prevBtn = document.getElementById('prevBtn')
    const nextBtn = document.getElementById('nextBtn')

    // 每日挑戰不可回頭
    if (currentMode === 'daily') {
      prevBtn.setAttribute('disabled', 'true')
    } else {
      if (currentIndex > 0) prevBtn.removeAttribute('disabled')
      else prevBtn.setAttribute('disabled', 'true')
    }

    // 若已回答，開放下一題，否則鎖定
    if (questionAnswered[currentIndex]) {
      nextBtn.removeAttribute('disabled')
    } else {
      nextBtn.setAttribute('disabled', 'true')
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * 4. SPELLING MODES (TILE / TYPE / MCQ)
   * ═══════════════════════════════════════════════════════════ */

  let typeAttempts = 0

  function renderSpellingQuestion(q, index) {
    document.getElementById('spellingMeaning').textContent = q.zh
    document.getElementById('spellingTopic').textContent = '📚 ' + q.topic
    document.getElementById('spellingPhonetic').textContent = q.phonetic

    // 依題數分流 Spelling 的子題型
    // 0 -> Tile, 1 -> Type, 2 -> MCQ, 3 -> Matching
    let spellingSubMode = 'tile'
    const subIdx = index % 4
    if (subIdx === 1) spellingSubMode = 'type'
    else if (subIdx === 2) spellingSubMode = 'mcq'
    else if (subIdx === 3) spellingSubMode = 'matching'

    // 顯示對應模式
    document.getElementById('tileMode').style.display = 'none'
    document.getElementById('typeMode').style.display = 'none'
    document.getElementById('mcqMode').style.display = 'none'
    document.getElementById('matchingMode').style.display = 'none'

    const badge = document.getElementById('subModeBadge')
    badge.className = 'sub-mode-badge'

    if (spellingSubMode === 'tile') {
      document.getElementById('tileMode').style.display = 'block'
      badge.textContent = '🧩 拼字模式'
      badge.classList.add('sub-mode-badge--tile')
      setupTileMode(q.word)
    } else if (spellingSubMode === 'type') {
      document.getElementById('typeMode').style.display = 'block'
      badge.textContent = '⌨️ 打字模式'
      badge.classList.add('sub-mode-badge--type')
      setupTypeMode(q.word)
    } else if (spellingSubMode === 'mcq') {
      document.getElementById('mcqMode').style.display = 'block'
      badge.textContent = '🔘 選擇模式'
      badge.classList.add('sub-mode-badge--mcq')
      setupMcqMode(q)
    } else if (spellingSubMode === 'matching') {
      document.getElementById('matchingMode').style.display = 'block'
      badge.textContent = '🎴 配對模式'
      badge.classList.add('sub-mode-badge--mcq')
      setupMatchingMode(q)
    }
  }

  // 🧩 TILE MODE 設置
  function setupTileMode(word) {
    const answerZone = document.getElementById('tileAnswerZone')
    const bank = document.getElementById('tileBank')
    answerZone.innerHTML = '<span style="color:var(--clr-text-muted);font-size:0.85rem" id="tileZonePlaceholder">將字母磁磚拖曳或點擊到這裡</span>'
    bank.innerHTML = ''

    const letters = word.split('')
    // 打亂字母
    const shuffled = [...letters].sort(() => Math.random() - 0.5)

    shuffled.forEach((l, idx) => {
      const tile = document.createElement('div')
      tile.className = 'letter-tile'
      tile.textContent = l
      tile.setAttribute('draggable', 'true')
      tile.dataset.letter = l
      tile.dataset.id = idx

      // 點擊移動字磚
      tile.addEventListener('click', () => {
        if (tile.parentElement === bank) {
          moveTileToAnswer(tile)
        } else {
          moveTileToBank(tile)
        }
      })

      // 拖曳處理
      tile.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', tile.dataset.id)
      })

      bank.appendChild(tile)
    })
  }

  function moveTileToAnswer(tile) {
    const answerZone = document.getElementById('tileAnswerZone')
    const placeholder = document.getElementById('tileZonePlaceholder')
    if (placeholder) placeholder.remove()

    tile.classList.add('placed')
    answerZone.appendChild(tile)

    // 檢查答案是否拼完
    checkTileSpellingComplete()
  }

  function moveTileToBank(tile) {
    const bank = document.getElementById('tileBank')
    tile.classList.remove('placed')
    bank.appendChild(tile)

    const answerZone = document.getElementById('tileAnswerZone')
    if (answerZone.children.length === 0) {
      answerZone.innerHTML = '<span style="color:var(--clr-text-muted);font-size:0.85rem" id="tileZonePlaceholder">將字母磁磚拖曳或點擊到這裡</span>'
    }
  }

  function checkTileSpellingComplete() {
    const answerZone = document.getElementById('tileAnswerZone')
    const word = currentChallenge[currentIndex].word
    const placed = Array.from(answerZone.querySelectorAll('.letter-tile'))

    if (placed.length === word.length) {
      const attempt = placed.map(t => t.dataset.letter).join('')
      if (attempt === word) {
        // 答對！
        placed.forEach(t => {
          t.classList.add('correct-tile')
          t.setAttribute('draggable', 'false')
        })
        handleCorrectSpelling(word)
      } else {
        // 答錯，紅閃後回彈
        placed.forEach(t => t.classList.add('wrong-tile'))
        showToast('拼錯囉，請再試一次！', 'error')
        setTimeout(() => {
          placed.forEach(t => {
            t.classList.remove('wrong-tile')
            moveTileToBank(t)
          })
        }, 1200)
        updateMastery(word, false)
      }
    }
  }

  // ⌨️ TYPE MODE 設置
  function setupTypeMode(word) {
    typeAttempts = 0
    const feedback = document.getElementById('wordleFeedback')
    feedback.innerHTML = ''

    // 產生 Wordle 空白框
    for (let i = 0; i < word.length; i++) {
      const cell = document.createElement('div')
      cell.className = 'wordle-cell wordle-cell--wrong'
      cell.textContent = ''
      feedback.appendChild(cell)
    }

    const input = document.getElementById('typeInput')
    input.setAttribute('maxlength', word.length)
    input.value = ''
    setTimeout(() => input.focus(), 200)
  }

  window.submitTypeAnswer = function() {
    const input = document.getElementById('typeInput')
    const val = input.value.trim().toLowerCase()
    const word = currentChallenge[currentIndex].word

    if (!val) return

    const feedback = document.getElementById('wordleFeedback')
    feedback.innerHTML = ''

    typeAttempts++

    if (val === word) {
      // 答對
      for (let i = 0; i < word.length; i++) {
        const cell = document.createElement('div')
        cell.className = 'wordle-cell wordle-cell--correct'
        cell.textContent = word[i]
        feedback.appendChild(cell)
      }
      handleCorrectSpelling(word)
    } else {
      // 答錯，進行 Wordle 渲染
      for (let i = 0; i < word.length; i++) {
        const cell = document.createElement('div')
        const char = val[i] || ''

        if (char === word[i]) {
          cell.className = 'wordle-cell wordle-cell--correct'
        } else if (word.includes(char)) {
          cell.className = 'wordle-cell wordle-cell--partial'
        } else {
          cell.className = 'wordle-cell wordle-cell--wrong'
        }
        cell.textContent = char
        feedback.appendChild(cell)
      }

      input.value = ''
      input.focus()

      // 輸入框震動
      input.style.animation = 'wrongShake 0.4s ease'
      setTimeout(() => input.style.animation = '', 400)

      if (typeAttempts >= 2) {
        showToast(`正確答案是: ${word}`, 'info')
        revealSpellingAnswer(word, false)
      } else {
        showToast('答錯囉，還剩 1 次機會！', 'warning')
      }
      updateMastery(word, false)
    }
  }

  // 🔘 MCQ MODE 設置
  function setupMcqMode(q) {
    const grid = document.getElementById('mcqGrid')
    grid.innerHTML = ''

    // MCQ 選項為英文單字，題目顯示中文 meanings
    const correctOption = q.word
    const distractors = q.distractors || []

    const options = [correctOption, ...distractors].slice(0, 4)
    // 打亂
    options.sort(() => Math.random() - 0.5)

    const labels = ['A', 'B', 'C', 'D']
    options.forEach((opt, idx) => {
      const btn = document.createElement('button')
      btn.className = 'mcq-option'
      btn.textContent = opt
      btn.setAttribute('data-label', labels[idx])

      btn.addEventListener('click', () => {
        // 停用所有按鈕
        grid.querySelectorAll('.mcq-option').forEach(b => b.setAttribute('disabled', 'true'))

        if (opt === correctOption) {
          btn.classList.add('correct')
          grid.querySelectorAll('.mcq-option').forEach(b => {
            if (b !== btn) b.classList.add('dimmed')
          })
          handleCorrectSpelling(correctOption)
        } else {
          btn.classList.add('wrong')
          grid.querySelectorAll('.mcq-option').forEach(b => {
            if (b.textContent === correctOption) b.classList.add('correct')
            else if (b !== btn) b.classList.add('dimmed')
          })
          revealSpellingAnswer(correctOption, false)
          updateMastery(correctOption, false)
        }
      })

      grid.appendChild(btn)
    })
  }

  // 答對單字後處置
  function handleCorrectSpelling(word) {
    triggerConfetti()
    correctCount++
    if (window.SpeechEngine) {
      window.SpeechEngine.speak(word, 'en-US', currentSpeechRate)
    }
    revealSpellingAnswer(word, true)
    updateMastery(word, true)
  }

  function revealSpellingAnswer(word, isCorrect) {
    const q = currentChallenge[currentIndex]
    document.getElementById('revealWord').textContent = `${word} ${q.phonetic}`
    document.getElementById('revealSentence').textContent = q.exampleSentence
    document.getElementById('revealMeaning').textContent = `${q.sentenceZh} (${q.zh})`
    document.getElementById('spellingReveal').style.display = 'block'

    // 初始化/更新 spelling 朗讀麥克風狀態
    const spellingMicBtn = document.getElementById('spellingMicBtn')
    const spellingMicStatus = document.getElementById('spellingMicStatus')
    if (spellingMicBtn) spellingMicBtn.classList.remove('listening')
    if (spellingMicStatus) {
      if (hasBonusAwarded[currentIndex]) {
        spellingMicStatus.textContent = '🌟 已成功取得口說加分！'
      } else {
        spellingMicStatus.textContent = '點擊按鈕，開始朗讀單字'
      }
    }

    // 解鎖下一題
    document.getElementById('nextBtn').removeAttribute('disabled')
    questionAnswered[currentIndex] = true

    updateMasteryItem(word, isCorrect, isCorrect ? 100 : 0)
  }

  // 🎴 MATCHING GAME 配對連連看
  let selectedMatchingCard = null

  function setupMatchingMode(q) {
    const grid = document.getElementById('matchingGrid')
    grid.innerHTML = ''
    selectedMatchingCard = null

    // 取得 3 組單字 (正確字 + 前 2 個干擾字)
    const word1 = q.word
    const zh1 = q.zh
    
    // 兜底防禦
    const distractors = q.distractors || []
    const distractorZhs = q.distractorZhs || {}
    
    const word2 = distractors[0] || 'apple'
    const zh2 = distractorZhs[word2] || '蘋果'
    const word3 = distractors[1] || 'book'
    const zh3 = distractorZhs[word3] || '書'

    const pairs = [
      { id: 1, type: 'en', val: word1, matchId: 1 },
      { id: 2, type: 'zh', val: zh1, matchId: 1 },
      { id: 3, type: 'en', val: word2, matchId: 2 },
      { id: 4, type: 'zh', val: zh2, matchId: 2 },
      { id: 5, type: 'en', val: word3, matchId: 3 },
      { id: 6, type: 'zh', val: zh3, matchId: 3 }
    ]

    // 打亂所有卡片
    const shuffledPairs = [...pairs].sort(() => Math.random() - 0.5)

    let matchedCount = 0

    shuffledPairs.forEach(cardData => {
      const card = document.createElement('div')
      card.className = 'matching-card'
      
      // 設定樣式與文字
      card.style.cssText = 'background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 8px; text-align:center; cursor:pointer; font-weight:600; font-size:0.95rem; transition:all 0.2s; min-height:58px; display:flex; align-items:center; justify-content:center; word-break:break-all;'
      card.textContent = cardData.val
      card.dataset.matchId = cardData.matchId
      card.dataset.type = cardData.type

      if (cardData.type === 'zh') {
        card.style.fontFamily = 'var(--font-zh)'
      } else {
        card.style.fontFamily = 'var(--font-en)'
      }

      card.addEventListener('click', () => {
        if (card.classList.contains('matched') || card.classList.contains('wrong-temp')) return

        if (!selectedMatchingCard) {
          // 選擇第一張
          selectedMatchingCard = card
          card.classList.add('selected')
          card.style.background = 'rgba(245,200,66,0.15)'
          card.style.borderColor = 'var(--clr-gold-1)'
          card.style.boxShadow = '0 0 10px rgba(245,200,66,0.2)'
        } else {
          // 選擇第二張
          if (selectedMatchingCard === card) {
            // 重複點選，取消選擇
            card.style.background = 'rgba(255,255,255,0.04)'
            card.style.borderColor = 'rgba(255,255,255,0.1)'
            card.style.boxShadow = 'none'
            card.classList.remove('selected')
            selectedMatchingCard = null
            return
          }

          const card1 = selectedMatchingCard
          const card2 = card

          // 必須是一中一英配對
          if (card1.dataset.type === card2.dataset.type) {
            // 同類型，更換選取目標
            card1.style.background = 'rgba(255,255,255,0.04)'
            card1.style.borderColor = 'rgba(255,255,255,0.1)'
            card1.style.boxShadow = 'none'
            card1.classList.remove('selected')

            selectedMatchingCard = card2
            card2.classList.add('selected')
            card2.style.background = 'rgba(245,200,66,0.15)'
            card2.style.borderColor = 'var(--clr-gold-1)'
            card2.style.boxShadow = '0 0 10px rgba(245,200,66,0.2)'
            return
          }

          // 檢查是否配對成功
          if (card1.dataset.matchId === card2.dataset.matchId) {
            // 配對成功！
            card1.classList.remove('selected')
            card1.classList.add('matched')
            card2.classList.add('matched')
            
            const successStyle = 'background:rgba(105,240,174,0.12); border-color:var(--clr-green-1); color:var(--clr-green-1); opacity:0.65; cursor:default; pointer-events:none;'
            card1.style.cssText += successStyle
            card2.style.cssText += successStyle
            
            // 播放答對音效
            if (window.AudioContext || window.webkitAudioContext) {
              try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)()
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain)
                gain.connect(ctx.destination)
                osc.frequency.setValueAtTime(523.25, ctx.currentTime) // C5
                gain.gain.setValueAtTime(0.05, ctx.currentTime)
                osc.start()
                osc.stop(ctx.currentTime + 0.1)
              } catch(e){}
            }

            matchedCount++
            selectedMatchingCard = null

            if (matchedCount === 3) {
              // 全部配對完成！
              setTimeout(() => {
                handleCorrectSpelling(word1)
              }, 400)
            }
          } else {
            // 配對失敗！
            card1.classList.remove('selected')
            card1.classList.add('wrong-temp')
            card2.classList.add('wrong-temp')

            card1.style.background = 'rgba(255,107,107,0.18)'
            card1.style.borderColor = 'var(--clr-red-1)'
            card1.style.boxShadow = '0 0 10px rgba(255,107,107,0.2)'
            card2.style.background = 'rgba(255,107,107,0.18)'
            card2.style.borderColor = 'var(--clr-red-1)'
            card2.style.boxShadow = '0 0 10px rgba(255,107,107,0.2)'

            card1.style.animation = 'wrongShake 0.4s ease'
            card2.style.animation = 'wrongShake 0.4s ease'

            // 播放錯誤音效
            if (window.AudioContext || window.webkitAudioContext) {
              try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)()
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain)
                gain.connect(ctx.destination)
                osc.frequency.setValueAtTime(150, ctx.currentTime)
                gain.gain.setValueAtTime(0.05, ctx.currentTime)
                osc.start()
                osc.stop(ctx.currentTime + 0.15)
              } catch(e){}
            }

            setTimeout(() => {
              card1.classList.remove('wrong-temp')
              card2.classList.remove('wrong-temp')
              card1.style.animation = ''
              card2.style.animation = ''
              card1.style.background = 'rgba(255,255,255,0.04)'
              card1.style.borderColor = 'rgba(255,255,255,0.1)'
              card1.style.boxShadow = 'none'
              card2.style.background = 'rgba(255,255,255,0.04)'
              card2.style.borderColor = 'rgba(255,255,255,0.1)'
              card2.style.boxShadow = 'none'
            }, 600)

            selectedMatchingCard = null
          }
        }
      })

      grid.appendChild(card)
    })
  }

  // 🎤 Spelling 答對揭曉後的口說朗讀單字挑戰
  window.toggleSpellingRecording = function () {
    const btn = document.getElementById('spellingMicBtn')
    const statusLabel = document.getElementById('spellingMicStatus')
    const expectedWord = currentChallenge[currentIndex].word

    if (!window.SpeechEngine) return

    if (isSpellingRecording) {
      window.SpeechEngine.stopListening()
      btn.classList.remove('listening')
      statusLabel.textContent = '按麥克風開始'
      isSpellingRecording = false
    } else {
      isSpellingRecording = true
      btn.classList.add('listening')
      statusLabel.textContent = '語音辨識中，請朗讀單字...'

      window.SpeechEngine.startListening(
        expectedWord,
        (interim, isFinal) => {
          statusLabel.textContent = isFinal ? `辨識結果: ${interim}` : `聽到了: ${interim}`
        },
        (err) => {
          statusLabel.textContent = `錯誤: ${err.message || err}`
          btn.classList.remove('listening')
          isSpellingRecording = false
        }
      ).then(transcript => {
        btn.classList.remove('listening')
        isSpellingRecording = false
        if (transcript) {
          const res = window.SpeechEngine.scoreTranscript(expectedWord, transcript)
          statusLabel.textContent = `朗讀分數: ${res.score}分!`
          if (res.score >= 80) {
            triggerConfetti()
            if (!hasBonusAwarded[currentIndex]) {
              hasBonusAwarded[currentIndex] = true
              speechBonusPoints += 2
              showToast('🎉 口說挑戰成功，獲得額外加 2 分！', 'success')
              statusLabel.textContent = `🌟 口說分數: ${res.score}分! 挑戰成功！`
            }
          } else {
            statusLabel.textContent = `口說分數: ${res.score}分! (未達80分，請再試一次)`
          }
        } else {
          statusLabel.textContent = '未偵測到聲音，請再試一次。'
        }
      }).catch(err => {
        console.error(err)
        btn.classList.remove('listening')
        isSpellingRecording = false
      })
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * 5. SPEECH CHALLENGE
   * ═══════════════════════════════════════════════════════════ */

  function renderSpeechQuestion(q) {
    document.getElementById('speechWord').textContent = q.word
    document.getElementById('speechPhonetic').textContent = q.phonetic
    document.getElementById('speechExample').textContent = q.exampleSentence

    const micBtn = document.getElementById('micBtn')
    micBtn.className = 'mic-btn'
    document.getElementById('micStatus').textContent = '按麥克風開始朗讀'
    document.getElementById('speechResult').style.display = 'none'
    const diagnosisBox = document.getElementById('speechDiagnosis')
    if (diagnosisBox) diagnosisBox.style.display = 'none'

    // 檢查瀏覽器是否支援
    if (window.SpeechEngine && !window.SpeechEngine.isSupported) {
      document.getElementById('noSpeechWarning').style.display = 'block'
    } else {
      document.getElementById('noSpeechWarning').style.display = 'none'
    }

    // 初始化 Waveform 畫布
    const canvas = document.getElementById('speechCanvas')
    if (window.SpeechEngine) {
      window.SpeechEngine.initWaveform(canvas)
    }
  }

  // 麥克風切換 (單字朗讀)
  window.SpeechEngine.toggleRecording = function () {
    const micBtn = document.getElementById('micBtn')
    const statusLabel = document.getElementById('micStatus')
    const expectedWord = currentChallenge[currentIndex].word

    if (!window.SpeechEngine) return

    if (window.SpeechEngine.isListening) {
      window.SpeechEngine.stopListening()
      window.SpeechEngine.stopWaveform()
      micBtn.classList.remove('listening')
      statusLabel.textContent = '按麥克風開始朗讀'
    } else {
      micBtn.classList.add('listening')
      statusLabel.textContent = '語音辨識中，請朗讀單字...'
      window.SpeechEngine.startWaveform()

      window.SpeechEngine.startListening(
        expectedWord,
        (interim, isFinal) => {
          statusLabel.textContent = isFinal ? `辨識結果: ${interim}` : `聽到了: ${interim}`
        },
        (err) => {
          statusLabel.textContent = `錯誤: ${err.message || err}`
          micBtn.classList.remove('listening')
          window.SpeechEngine.stopWaveform()
        }
      ).then(transcript => {
        micBtn.classList.remove('listening')
        window.SpeechEngine.stopWaveform()

        if (transcript) {
          handleSpeechScore(transcript, expectedWord)
        } else {
          statusLabel.textContent = '未偵測到聲音，請再試一次。'
        }
      }).catch(err => {
        console.error(err)
        micBtn.classList.remove('listening')
        window.SpeechEngine.stopWaveform()
      })
    }
  }

  function handleSpeechScore(transcript, expectedWord) {
    if (!window.SpeechEngine) return

    const res = window.SpeechEngine.scoreTranscript(expectedWord, transcript)
    sessionSpeechScores[currentIndex] = res.score

    // 顯示分數
    document.getElementById('scoreValue').textContent = res.score
    const ringFill = document.getElementById('scoreArc')
    const offset = 213.6 - (res.score / 100) * 213.6
    ringFill.style.strokeDashoffset = offset

    // 顯示詞彙匹配
    const chips = document.getElementById('speechWordChips')
    chips.innerHTML = ''
    res.wordResults.forEach(r => {
      const chip = document.createElement('span')
      chip.className = `speech-chip speech-chip--${r.status}`
      chip.textContent = r.word
      chips.appendChild(chip)
    })

    const diagnosisBox = document.getElementById('speechDiagnosis')
    const diagnosisBody = document.getElementById('speechDiagnosisBody')
    if (diagnosisBox && diagnosisBody && window.SpeechEngine.diagnosePronunciation) {
      const diagnosis = window.SpeechEngine.diagnosePronunciation(expectedWord, transcript)
      diagnosisBody.innerHTML = diagnosis.tips.map(tip => `<div>• ${tip}</div>`).join('')
      diagnosisBox.style.display = 'block'
      diagnosisBox.style.borderColor = diagnosis.level === 'good'
        ? 'rgba(105,240,174,0.25)'
        : 'rgba(79,195,247,0.18)'
    }

    document.getElementById('speechResult').style.display = 'block'

    if (res.score >= 80) {
      triggerConfetti()
      correctCount++
      sessionStars++
      // 顯示挑戰句子 prompt
      const prompt = document.getElementById('sentenceSpeechPrompt')
      document.getElementById('sentenceReadAloud').textContent = currentChallenge[currentIndex].exampleSentence
      prompt.style.display = 'block'

      updateMastery(expectedWord, true)
    } else {
      updateMastery(expectedWord, false)
    }

    // 解鎖下一題
    document.getElementById('nextBtn').removeAttribute('disabled')
    questionAnswered[currentIndex] = true

    updateMasteryItem(expectedWord, res.score >= 80, res.score)
  }

  // 口說題附帶：朗讀整句
  window.SpeechEngine.toggleSentenceRecording = function () {
    const btn = document.getElementById('sentenceMicBtn')
    const sentence = currentChallenge[currentIndex].exampleSentence

    if (!window.SpeechEngine) return

    if (window.SpeechEngine.isListening) {
      window.SpeechEngine.stopListening()
      btn.classList.remove('listening')
    } else {
      btn.classList.add('listening')
      window.SpeechEngine.startListening(
        sentence,
        null,
        (err) => {
          showToast(`錯誤: ${err.message || err}`, 'error')
          btn.classList.remove('listening')
        }
      ).then(transcript => {
        btn.classList.remove('listening')
        if (transcript) {
          const res = window.SpeechEngine.scoreTranscript(sentence, transcript)
          showToast(`句子分數: ${res.score}分!`, res.score >= 80 ? 'success' : 'info')
          if (res.score >= 80) {
            triggerConfetti()
            if (!hasBonusAwarded[currentIndex]) {
              hasBonusAwarded[currentIndex] = true
              speechBonusPoints += 2
              showToast('🎉 口說挑戰成功，獲得額外加 2 分！', 'success')
            }
          }
        }
      }).catch(err => {
        console.error(err)
        btn.classList.remove('listening')
      })
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * 6. SENTENCE PATTERN PRACTICE
   * ═══════════════════════════════════════════════════════════ */

  window.currentSentenceFull = ''

  function renderSentenceQuestion(q) {
    // 依主題顯示圖示
    const icons = {
      School: '🏫', Family: '🏠', Festival: '🎄', Travel: '✈️', Weather: '☀️', Daily: '📅'
    }
    document.getElementById('sceneIcon').textContent = icons[q.topic] || '📖'

    // blank 區塊
    const textZone = document.getElementById('sentenceText')
    textZone.innerHTML = q.fillBlank.replace('____', '<span class="sentence-blank" id="sentenceBlank">______</span>')

    document.getElementById('sentenceTranslate').textContent = q.sentenceZh

    window.currentSentenceFull = q.exampleSentence

    // 產生選項
    const optionsZone = document.getElementById('sentenceOptions')
    optionsZone.innerHTML = ''

    const correct = q.word
    const distractors = q.distractors || []
    const options = [correct, ...distractors].slice(0, 4)
    options.sort(() => Math.random() - 0.5)

    const labels = ['A', 'B', 'C', 'D']

    options.forEach((opt, idx) => {
      const btn = document.createElement('button')
      btn.className = 'sentence-option'
      btn.innerHTML = `<span class="sentence-option__label">${labels[idx]}</span> <span class="font-en">${opt}</span>`

      btn.addEventListener('click', () => {
        // 停用全部
        optionsZone.querySelectorAll('.sentence-option').forEach(b => b.setAttribute('disabled', 'true'))

        if (opt === correct) {
          btn.classList.add('correct')
          correctCount++
          triggerConfetti()
          document.getElementById('sentenceBlank').textContent = correct
          revealSentenceAnswer(q, true)
          updateMastery(correct, true)
        } else {
          btn.classList.add('wrong')
          optionsZone.querySelectorAll('.sentence-option').forEach(b => {
            if (b.querySelector('.font-en').textContent === correct) {
              b.classList.add('correct')
            }
          })
          document.getElementById('sentenceBlank').textContent = correct
          revealSentenceAnswer(q, false)
          updateMastery(correct, false)
        }
      })

      optionsZone.appendChild(btn)
    })
  }

  function revealSentenceAnswer(q, isCorrect) {
    document.getElementById('sentenceRevealFull').textContent = q.exampleSentence
    document.getElementById('sentenceRevealTranslation').textContent = q.sentenceZh
    document.getElementById('sentenceRevealWord').textContent = q.word
    document.getElementById('sentenceRevealDef').textContent = q.zh

    document.getElementById('sentenceReveal').style.display = 'block'

    // 顯示整句朗讀挑戰
    const speechPrompt = document.getElementById('sentenceFollowUpSpeech')
    document.getElementById('sentenceFollowUpText').textContent = q.exampleSentence
    speechPrompt.style.display = 'block'

    document.getElementById('nextBtn').removeAttribute('disabled')
    questionAnswered[currentIndex] = true

    updateMasteryItem(q.word, isCorrect, isCorrect ? 100 : 0)
  }

  // 句型練習附帶：朗讀整句
  window.SpeechEngine.toggleFollowUp = function () {
    const btn = document.getElementById('sentenceFollowMic')
    const statusLabel = document.getElementById('followMicStatus')
    const sentence = currentChallenge[currentIndex].exampleSentence

    if (!window.SpeechEngine) return

    if (window.SpeechEngine.isListening) {
      window.SpeechEngine.stopListening()
      btn.classList.remove('listening')
      statusLabel.textContent = '按麥克風開始'
    } else {
      btn.classList.add('listening')
      statusLabel.textContent = '語音辨識中，請朗讀句子...'

      window.SpeechEngine.startListening(
        sentence,
        (interim, isFinal) => {
          statusLabel.textContent = isFinal ? `辨識結果: ${interim}` : `聽到了: ${interim}`
        },
        (err) => {
          statusLabel.textContent = `錯誤: ${err.message || err}`
          btn.classList.remove('listening')
        }
      ).then(transcript => {
        btn.classList.remove('listening')
        if (transcript) {
          const res = window.SpeechEngine.scoreTranscript(sentence, transcript)
          statusLabel.textContent = `朗讀分數: ${res.score}分!`
          if (res.score >= 80) {
            triggerConfetti()
            if (!hasBonusAwarded[currentIndex]) {
              hasBonusAwarded[currentIndex] = true
              speechBonusPoints += 2
              showToast('🎉 口說挑戰成功，獲得額外加 2 分！', 'success')
            }
          }
        } else {
          statusLabel.textContent = '未偵測到聲音，請再試一次。'
        }
      }).catch(err => {
        console.error(err)
        btn.classList.remove('listening')
      })
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * 7. STATE CONTROLS (PREV / NEXT / TABS / LOGOUT)
   * ═══════════════════════════════════════════════════════════ */

  window.ChallengeApp = {
    currentIndex,
    sessionStars,
    sessionWrongWords,
    sessionSpeechScores,
    questionAnswered,
    openLevelModal,
    
    // 設定全域播放語速
    setSpeechSpeed: function (rate, el) {
      currentSpeechRate = rate
      document.querySelectorAll('.speech-speed-selector .speed-btn').forEach(btn => {
        btn.classList.remove('active')
      })
      if (el) el.classList.add('active')
      showToast(`語速已調整為: ${rate === 1.2 ? '快速' : rate === 0.85 ? '中速' : '慢速'}`, 'info')
    },

    // 切換模式（每日 / 練習 / 課堂）
    setMode: async function (mode) {
      if (mode === currentMode) return
      if (mode === 'daily' && isDoneToday) {
        showToast('您今天已完成計分挑戰！', 'warning')
        // 還原 UI 狀態
        document.querySelectorAll('.mode-tab').forEach(t => {
          if (t.dataset.mode === currentMode) t.classList.add('active')
          else t.classList.remove('active')
        })
        return
      }

      currentMode = mode
      currentSessionId = null // 重設場次

      if (mode === 'class') {
        // 顯示輸入場次碼卡片，隱藏挑戰內容
        document.getElementById('sessionJoinCard').style.display = 'block'
        document.getElementById('challengeCard').style.display = 'none'
        document.getElementById('sessionCodeInput').value = ''
        document.getElementById('sessionJoinError').style.display = 'none'
      } else {
        document.getElementById('sessionJoinCard').style.display = 'none'
        document.getElementById('challengeCard').style.display = 'block'
        await loadSessionChallenge()
      }
    },

    // 切換題型 (限 practice 模式)
    setType: function (type) {
      if (currentMode === 'daily') {
        showToast('每日計分挑戰不可手動切換題型。', 'warning')
        updateTypeTabsUI(currentType)
        return
      }
      if (type === currentType) return
      currentType = type
      renderQuestion(currentIndex)
    },

    // 上一題
    prev: function () {
      if (currentIndex > 0) {
        renderQuestion(currentIndex - 1)
      }
    },

    // 下一題
    next: function () {
      if (currentIndex < 11) {
        renderQuestion(currentIndex + 1)
      } else {
        // 完成挑戰！
        completeChallenge()
      }
    },

    // 跳過
    skip: function () {
      const q = currentChallenge[currentIndex]
      updateMastery(q.word, false)
      updateMasteryItem(q.word, false, 0)
      questionAnswered[currentIndex] = true
      document.getElementById('nextBtn').removeAttribute('disabled')
      this.next()
    },

    // 重播當前單字發音
    speakWord: function () {
      if (!window.SpeechEngine) return
      window.SpeechEngine.speak(currentChallenge[currentIndex].word, 'en-US', currentSpeechRate)
    },

    // 重播當前例句發音
    speakSentence: function () {
      if (!window.SpeechEngine) return
      window.SpeechEngine.speak(currentChallenge[currentIndex].exampleSentence, 'en-US', currentSpeechRate)
    },

    // 重設挑戰
    restart: async function () {
      document.getElementById('completionScreen').style.display = 'none'
      document.getElementById('challengeNav').style.display = 'flex'

      if (currentMode === 'class' && currentSessionId) {
        document.getElementById('challengeCard').style.display = 'block'
        await loadSessionChallenge()
      } else {
        await checkTodayAttempt()
        if (currentMode === 'class') {
          // 還原成需要加入場次狀態
          document.getElementById('sessionJoinCard').style.display = 'block'
          document.getElementById('challengeCard').style.display = 'none'
        } else {
          await loadSessionChallenge()
        }
      }
    },

    // 加入課堂場次
    joinClassSession: async function () {
      const codeInput = document.getElementById('sessionCodeInput')
      const errorDiv = document.getElementById('sessionJoinError')
      const code = codeInput.value.trim()

      if (!/^\d{6}$/.test(code)) {
        errorDiv.textContent = '請輸入 6 位數數字場次碼。'
        errorDiv.style.display = 'block'
        return
      }

      errorDiv.style.display = 'none'
      showLoading(true, '正在驗證場次碼...')

      try {
        const today = new Date().toISOString()
        const { data: sessionData, error } = await supabase
          .from('challenge_sessions')
          .select('*')
          .eq('session_code', code)
          .eq('status', 'active')
          .gt('expires_at', today)
          .single()

        if (error || !sessionData) {
          showLoading(false)
          errorDiv.textContent = '無效或已過期的場次碼，請向老師確認。'
          errorDiv.style.display = 'block'
          return
        }

        // 檢查學校/班級限制（若欄位有填寫）
        if (sessionData.school && sessionData.school !== studentProfile.school) {
          showLoading(false)
          alert(`此場次僅限 ${sessionData.school} 學生加入，即將退回大廳。`)
          window.location.href = 'index.html'
          return
        }

        currentSessionId = sessionData.id

        // 進入挑戰
        document.getElementById('sessionJoinCard').style.display = 'none'
        document.getElementById('challengeCard').style.display = 'block'

        await loadSessionChallenge()

      } catch (err) {
        console.error('[Challenge] Join session error:', err)
        showLoading(false)
        errorDiv.textContent = '連線失敗，請稍後重試。'
        errorDiv.style.display = 'block'
      }
    },

    updateMasteryItem,

    submitType: function () {
      window.submitTypeAnswer()
    },

    handleTileDrop: function (event) {
      event.preventDefault()
      event.currentTarget.classList.remove('drag-over')
      const tileId = event.dataTransfer.getData('text/plain')
      const tile = document.querySelector(`.letter-tile[data-id="${CSS.escape(tileId)}"]`)
      if (tile && tile.parentElement && tile.parentElement.id === 'tileBank') {
        moveTileToAnswer(tile)
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * 8. SPACED REPETITION (單字熟練度)
   * ═══════════════════════════════════════════════════════════ */

  function updateMastery(word, isCorrect) {
    if (!studentProfile) return
    if (!studentProfile.mastery) studentProfile.mastery = {}

    const cur = studentProfile.mastery[word] || 0
    if (isCorrect) {
      studentProfile.mastery[word] = Math.min(3, cur + 1)
    } else {
      studentProfile.mastery[word] = Math.max(0, cur - 1)
      if (!sessionWrongWords.includes(word)) {
        sessionWrongWords.push(word)
      }
    }
  }

  // 即時更新右側/底部抽屜單字卡
  function updateMasteryItem(word, isCorrect, score = 0) {
    const listDesktop = document.getElementById('masteryList')
    const listMobile = document.getElementById('masteryListMobile')

    // 移除 placeholder
    const phD = listDesktop.querySelector('.mastery-placeholder')
    if (phD) phD.remove()
    const phM = listMobile.querySelector('.mastery-placeholder')
    if (phM) phM.remove()

    // 檢查是否已存在
    let itemD = listDesktop.querySelector(`[data-word="${word}"]`)
    let itemM = listMobile.querySelector(`[data-word="${word}"]`)

    const itemHtml = `
      <div class="mastery-item__word font-en">${word}</div>
      <div class="mastery-item__stars">
        <span class="mastery-star lit">⭐</span>
        <span class="mastery-star ${score >= 60 ? 'lit' : ''}">⭐</span>
        <span class="mastery-star ${score >= 85 ? 'lit' : ''}">⭐</span>
      </div>
      <div class="mastery-item__result mastery-item__result--${isCorrect ? 'correct' : 'wrong'}">
        ${isCorrect ? '✓' : '✗'}
      </div>
    `

    if (!itemD) {
      itemD = document.createElement('div')
      itemD.className = 'mastery-item'
      itemD.setAttribute('data-word', word)
      listDesktop.appendChild(itemD)

      itemM = document.createElement('div')
      itemM.className = 'mastery-item'
      itemM.setAttribute('data-word', word)
      listMobile.appendChild(itemM)
    }

    itemD.innerHTML = itemHtml
    itemM.innerHTML = itemHtml
  }

  // 彈出寶石等級與礦物科普 Modal
  function openLevelModal() {
    if (!studentProfile) return

    // 1. 計算熟練字數 (熟練度 >= 2 的字數)
    let masteredCount = 0
    if (studentProfile.mastery) {
      for (const word in studentProfile.mastery) {
        if (studentProfile.mastery[word] >= 2) {
          masteredCount++
        }
      }
    }

    // 2. 找出目前等級與下一等級
    let currentTierIndex = 0
    for (let i = gemTiers.length - 1; i >= 0; i--) {
      if (masteredCount >= gemTiers[i].min) {
        currentTierIndex = i
        break
      }
    }
    const currentTier = gemTiers[currentTierIndex]
    const nextTier = gemTiers[currentTierIndex + 1]

    // 3. 填入 Modal 資料
    document.getElementById('modalGemEmoji').textContent = currentTier.emoji
    document.getElementById('modalGemName').textContent = currentTier.name
    document.getElementById('modalGemHardness').textContent = `莫氏硬度: ${currentTier.hardness}`
    document.getElementById('modalGemDesc').textContent = currentTier.desc
    document.getElementById('modalStudentScore').textContent = (studentProfile.total_score || 0).toLocaleString()
    document.getElementById('modalMasteredCount').textContent = `${masteredCount} 字`

    // 4. 計算距離下一級差幾顆字
    const nextTextEl = document.getElementById('modalNextLevelText')
    if (nextTier) {
      const diff = nextTier.min - masteredCount
      nextTextEl.textContent = `距離升級到【${nextTier.name}】還差 ${diff} 顆熟練字 🚀`
    } else {
      nextTextEl.textContent = `恭喜！您已達到了寶石硬度的終極殿堂！🎉`
    }

    // 5. 顯示 Modal
    document.getElementById('levelModal').style.display = 'block'
    document.getElementById('levelModalOverlay').style.display = 'block'
  }

  /* ═══════════════════════════════════════════════════════════
   * 9. COMPLETION & SUBMIT TO SUPABASE
   * ═══════════════════════════════════════════════════════════ */

  async function completeChallenge() {
    showLoading(true, '正在計算成績並儲存歷程...')

    // 計算最終分數 (滿分 100)
    // 答對題數佔 80% (80分)，平均口說分數佔 20% (20分)
    const validSpeechScores = sessionSpeechScores.filter(s => s > 0)
    const avgSpeech = validSpeechScores.length > 0
      ? validSpeechScores.reduce((a, b) => a + b, 0) / validSpeechScores.length
      : 0

    const standardScore = Math.round((correctCount / 12) * 80 + (avgSpeech / 100) * 20)
    const finalScoreVal = Math.min(100, standardScore + speechBonusPoints)
    const accuracyVal = Math.round((correctCount / 12) * 100)

    try {
      const isClassMode = currentMode === 'class'
      const isDailyMode = currentMode === 'daily'
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }) // yyyy-mm-dd

      // 1. 每日挑戰與課堂挑戰都寫入紀錄；自由練習只更新 mastery。
      if (isDailyMode || isClassMode) {
        const suffix = isClassMode ? currentSessionId : 'daily'
        const attemptId = `${currentUser.id}_${today}_${suffix}`
        const { error: attemptError } = await supabase
          .from('daily_attempts')
          .insert({
            id: attemptId,
            student_uid: currentUser.id,
            student_name: studentProfile.name,
            school: studentProfile.school,
            class: studentProfile.class,
            grade: studentProfile.grade,
            date: today,
            score: finalScoreVal,
            wrong: sessionWrongWords,
            speech_scores: sessionSpeechScores,
            practice: isClassMode,
            session_id: isClassMode ? currentSessionId : null
          })

        if (attemptError) throw attemptError

        // 課堂挑戰提供教師即時榜，不消耗每日計分額度，也不累加全站總分。
        if (isClassMode) {
          const { error: classMasteryError } = await supabase
            .from('students')
            .update({
              mastery: studentProfile.mastery,
              last_active: new Date().toISOString()
            })
            .eq('uid', currentUser.id)

          if (classMasteryError) throw classMasteryError

          showLoading(false)
          showCompletionScreen(finalScoreVal, accuracyVal)
          return
        }

        // 2. 每日計分：更新學生的累積成績、連續天數、熟練度 JSON
        let newStreak = studentProfile.streak || 0
        const lastChallengeDate = studentProfile.last_challenge_date

        // 連續天數邏輯
        if (lastChallengeDate) {
          const lastDate = new Date(lastChallengeDate)
          const currDate = new Date(today)
          const diffTime = Math.abs(currDate - lastDate)
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

          if (diffDays === 1) {
            newStreak += 1
          } else if (diffDays > 1) {
            newStreak = 1
          }
        } else {
          newStreak = 1
        }

        const { error: updateError } = await supabase
          .from('students')
          .update({
            total_score: (studentProfile.total_score || 0) + finalScoreVal,
            streak: newStreak,
            speech_stars: (studentProfile.speech_stars || 0) + sessionStars,
            last_challenge_date: today,
            mastery: studentProfile.mastery
          })
          .eq('uid', currentUser.id)

        if (updateError) throw updateError

      } else {
        // 自由練習模式：僅更新 Mastery 熟練度
        const { error: updateMasteryError } = await supabase
          .from('students')
          .update({
            mastery: studentProfile.mastery
          })
          .eq('uid', currentUser.id)

        if (updateMasteryError) throw updateMasteryError
      }

      // 4. 展示完成畫面
      showLoading(false)
      showCompletionScreen(finalScoreVal, accuracyVal)

    } catch (err) {
      console.error('[Challenge] Complete error:', err)
      showToast('儲存成績失敗，請確認網路連線。', 'error')
      showLoading(false)
    }
  }

  function showCompletionScreen(score, accuracy) {
    // 隱藏面版與導覽列
    document.querySelectorAll('.challenge-panel').forEach(p => p.classList.remove('active'))
    document.getElementById('challengeNav').style.display = 'none'

    const win = document.getElementById('completionScreen')
    win.style.display = 'block'

    // 填寫數據
    document.getElementById('finalAccuracy').textContent = accuracy + '%'
    if (speechBonusPoints > 0) {
      document.getElementById('finalScore').innerHTML = `${score} <span style="font-size:0.75rem;color:#52e5a4;display:block;margin-top:4px;">(口說加分 +${speechBonusPoints})</span>`
    } else {
      document.getElementById('finalScore').textContent = score
    }
    document.getElementById('finalStreak').textContent = studentProfile.streak || 1

    // 填充錯題複習晶片
    const reviewWordsSection = document.getElementById('reviewWordsSection')
    const chips = document.getElementById('reviewWordChips')
    chips.innerHTML = ''
    if (sessionWrongWords.length > 0) {
      reviewWordsSection.style.display = 'block'
      sessionWrongWords.forEach(w => {
        const chip = document.createElement('span')
        chip.className = 'review-chip'
        chip.textContent = w
        chips.appendChild(chip)
      })
    } else {
      reviewWordsSection.style.display = 'none'
    }

    // 動態星星等級
    const stars = document.getElementById('completionStars')
    stars.innerHTML = ''
    let starCount = 1
    if (score >= 60) starCount = 2
    if (score >= 90) starCount = 3

    for (let i = 0; i < starCount; i++) {
      const star = document.createElement('span')
      star.textContent = '⭐'
      stars.appendChild(star)
    }

    triggerConfetti()

    // 檢查是否升級並彈出酷炫 Modal (WOW Factor)
    let finalMasteredCount = 0
    if (studentProfile && studentProfile.mastery) {
      for (const word in studentProfile.mastery) {
        if (studentProfile.mastery[word] >= 2) {
          finalMasteredCount++
        }
      }
    }
    let finalGemTierIndex = 0
    for (let i = gemTiers.length - 1; i >= 0; i--) {
      if (finalMasteredCount >= gemTiers[i].min) {
        finalGemTierIndex = i
        break
      }
    }

    if (initialGemTierIndex !== -1 && finalGemTierIndex > initialGemTierIndex) {
      const newGem = gemTiers[finalGemTierIndex]
      document.getElementById('upgradeGemEmoji').textContent = newGem.emoji
      document.getElementById('upgradeGemName').textContent = newGem.name
      document.getElementById('upgradeGemHardness').textContent = `莫氏硬度: ${newGem.hardness}`
      document.getElementById('upgradeGemDesc').textContent = newGem.desc

      setTimeout(() => {
        document.getElementById('gemUpgradeModal').style.display = 'block'
        document.getElementById('gemUpgradeModalOverlay').style.display = 'block'
        playUnlockSound()
        createGemConfetti()
      }, 800)
    }
  }

  // 播放 Web Audio API 合成解鎖音效
  function playUnlockSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      
      const osc1 = audioCtx.createOscillator()
      const gain1 = audioCtx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime)
      osc1.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.18)
      gain1.gain.setValueAtTime(0.25, audioCtx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35)
      osc1.connect(gain1)
      gain1.connect(audioCtx.destination)
      osc1.start()
      osc1.stop(audioCtx.currentTime + 0.35)

      setTimeout(() => {
        const osc2 = audioCtx.createOscillator()
        const gain2 = audioCtx.createGain()
        osc2.type = 'triangle'
        osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime)
        osc2.frequency.exponentialRampToValueAtTime(1318.51, audioCtx.currentTime + 0.3)
        gain2.gain.setValueAtTime(0.2, audioCtx.currentTime)
        gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6)
        osc2.connect(gain2)
        gain2.connect(audioCtx.destination)
        osc2.start()
        osc2.stop(audioCtx.currentTime + 0.6)
      }, 160)
    } catch (e) {
      console.warn('Web Audio API 播放音效失敗:', e)
    }
  }

  // 創造 HTML Confetti 飄落粒子
  function createGemConfetti() {
    const container = document.getElementById('upgradeConfettiContainer')
    if (!container) return
    container.innerHTML = ''
    
    const colors = ['#f5c842', '#4fc3f7', '#69f0ae', '#ce93d8', '#ff6b6b', '#ffd700']
    const shapes = ['3px', '50%']
    
    for (let i = 0; i < 40; i++) {
      const piece = document.createElement('div')
      piece.className = 'confetti-piece'
      
      const left = Math.random() * 100
      const delay = Math.random() * 1.5
      const duration = 2 + Math.random() * 2
      const size = 8 + Math.random() * 10
      const bg = colors[Math.floor(Math.random() * colors.length)]
      const radius = shapes[Math.floor(Math.random() * shapes.length)]
      
      piece.style.left = `${left}%`
      piece.style.animationDelay = `${delay}s`
      piece.style.animationDuration = `${duration}s`
      piece.style.width = `${size}px`
      piece.style.height = `${size}px`
      piece.style.background = bg
      piece.style.borderRadius = radius
      
      container.appendChild(piece)
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * 10. HELPER FUNCTIONS
   * ═══════════════════════════════════════════════════════════ */

  function showLoading(show, message = '載入中...') {
    const scr = document.getElementById('loadingScreen')
    const msg = document.getElementById('loadingMsg')
    if (show) {
      msg.textContent = message
      scr.classList.remove('fade-out')
      scr.style.display = 'flex'
    } else {
      scr.classList.add('fade-out')
      setTimeout(() => scr.style.display = 'none', 500)
    }
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer')
    if (!container) return
    const el = document.createElement('div')
    el.className = `toast toast--${type}`
    el.textContent = message
    container.appendChild(el)
    setTimeout(() => el.remove(), 3200)
  }

  // Canvas 紙花效果
  function triggerConfetti() {
    const canvas = document.getElementById('confettiCanvas')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles = []
    const colors = ['#f5c842', '#4fc3f7', '#69f0ae', '#ce93d8', '#ff6b6b']

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16 - 6,
        r: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: Math.random() * 0.02 + 0.015
      })
    }

    function anim() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let active = false
      particles.forEach(p => {
        if (p.alpha > 0) {
          active = true
          p.x += p.vx
          p.y += p.vy
          p.vy += 0.35 // gravity
          p.alpha -= p.decay
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fillStyle = p.color
          ctx.globalAlpha = Math.max(0, p.alpha)
          ctx.fill()
        }
      })
      ctx.globalAlpha = 1
      if (active) requestAnimationFrame(anim)
    }
    anim()
  }

  // Bootstrap
  document.addEventListener('DOMContentLoaded', () => {
    init()
  })

})()
