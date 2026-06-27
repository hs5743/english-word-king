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

  // 全域狀態變數
  let supabase = null
  let currentUser = null
  let studentProfile = null
  let currentMode = 'daily'        // daily (每日計分) | free (自由練習) | class (課堂挑戰)
  let currentType = 'spelling'     // spelling | speech | sentence
  let currentChallenge = []        // 12題題目資料
  let currentIndex = 0
  let isDoneToday = false          // 今天是否已挑戰過計分模式
  let currentSessionId = null      // 當前加入的課堂場次 UUID

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

      // 3. 填寫頂部資訊列
      updateTopbarInfo()

      // 4. 檢查今日是否已挑戰過
      await checkTodayAttempt()

      // 5. 載入挑戰題目
      await loadSessionChallenge()

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
    document.getElementById('micStatus').textContent = '按麥克風開始朗讀'
    document.getElementById('followMicStatus').textContent = '按麥克風開始'
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
    // 0 -> Tile, 1 -> Type, 2 -> MCQ, 3 -> Tile
    let spellingSubMode = 'tile'
    const subIdx = index % 4
    if (subIdx === 1) spellingSubMode = 'type'
    else if (subIdx === 2) spellingSubMode = 'mcq'

    // 顯示對應模式
    document.getElementById('tileMode').style.display = 'none'
    document.getElementById('typeMode').style.display = 'none'
    document.getElementById('mcqMode').style.display = 'none'

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
      window.SpeechEngine.speak(word)
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

    // 解鎖下一題
    document.getElementById('nextBtn').removeAttribute('disabled')
    questionAnswered[currentIndex] = true

    updateMasteryItem(word, isCorrect, isCorrect ? 100 : 0)
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
          if (res.score >= 80) triggerConfetti()
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
          if (res.score >= 80) triggerConfetti()
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
      window.SpeechEngine.speak(currentChallenge[currentIndex].word)
    },

    // 重播當前例句發音
    speakSentence: function () {
      if (!window.SpeechEngine) return
      window.SpeechEngine.speak(currentChallenge[currentIndex].exampleSentence)
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
          errorDiv.textContent = `此場次僅限 ${sessionData.school} 學生加入。`
          errorDiv.style.display = 'block'
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

    const finalScoreVal = Math.round((correctCount / 12) * 80 + (avgSpeech / 100) * 20)
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
    document.getElementById('finalScore').textContent = score
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
