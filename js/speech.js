/**
 * 新港國小英語單字王 — 語音引擎 (speech.js)
 * ============================================================
 * 功能模組：
 *   1. Speech Recognition  — 語音辨識（Chrome Web Speech API）
 *   2. Canvas Waveform     — Siri 風格音波視覺化
 *   3. DP Scoring          — 逐詞 Levenshtein 對齊評分
 *   4. Text-to-Speech      — SpeechSynthesis 朗讀
 *   5. Phonetic Helper     — 常見單字音標輔助
 *
 * 匯出: window.SpeechEngine
 */

;(function () {
  'use strict'

  /* ═══════════════════════════════════════════════════════════
   * 0. BROWSER SUPPORT CHECK
   * ═══════════════════════════════════════════════════════════ */
  const SpeechRecognitionAPI =
    window.SpeechRecognition || window.webkitSpeechRecognition || null

  const isSupported = Boolean(SpeechRecognitionAPI)

  /** 顯示「不支援語音辨識」提示訊息 */
  function _showUnsupportedMessage(container) {
    const msg = document.createElement('div')
    msg.className = 'speech-unsupported'
    msg.innerHTML = `
      <div style="text-align:center;padding:var(--sp-xl,1.5rem);color:var(--clr-text-muted,#aaa);">
        <div style="font-size:2rem;margin-bottom:.5rem;">🎙️</div>
        <div>您的瀏覽器不支援語音辨識，請使用 <strong>Chrome</strong> 瀏覽器</div>
      </div>`
    if (container) container.appendChild(msg)
    console.warn('[SpeechEngine] 語音辨識 API 不支援')
  }

  /* ═══════════════════════════════════════════════════════════
   * 1. SPEECH RECOGNITION
   * ═══════════════════════════════════════════════════════════ */

  let _recognition = null      // active SpeechRecognition instance
  let _silenceTimer = null     // auto-stop timer
  let _isListening  = false

  /**
   * 啟動語音辨識
   * @param {string}   expectedText  — 預期的答案文字（用於即時顯示提示）
   * @param {Function} onResult      — 回呼：(transcript: string, isFinal: boolean) => void
   * @param {Function} onError       — 回呼：(errorMessage: string) => void
   * @returns {Promise<string>}      — resolves with final transcript
   */
  async function startListening(expectedText = '', onResult = null, onError = null) {
    if (!isSupported) {
      const msg = '此瀏覽器不支援語音辨識。請改用 Chrome 或 Edge，或先略過口說題。'
      if (onError) onError(msg)
      throw new Error(msg)
    }

    try {
      await requestMicrophoneAccess()
    } catch (err) {
      const msg = getMicrophoneHelpMessage(err)
      if (onError) onError(msg)
      throw new Error(msg)
    }

    return new Promise((resolve, reject) => {
      if (!isSupported) {
        const msg = '您的瀏覽器不支援語音辨識，請使用 Chrome 瀏覽器'
        if (onError) onError(msg)
        reject(new Error(msg))
        return
      }

      // 若已有辨識實例，先停止
      stopListening()

      _recognition = new SpeechRecognitionAPI()
      _recognition.lang            = 'en-US'
      _recognition.continuous      = false
      _recognition.interimResults  = true
      _recognition.maxAlternatives = 3

      _isListening = true

      /* ── 處理辨識結果 ── */
      _recognition.onresult = (event) => {
        // 重設靜音計時器
        _resetSilenceTimer(() => stopListening())

        let interimTranscript = ''
        let finalTranscript   = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text   = result[0].transcript
          if (result.isFinal) {
            finalTranscript += text
          } else {
            interimTranscript += text
          }
        }

        // 即時顯示interim結果
        if (interimTranscript && onResult) {
          onResult(interimTranscript, false)
        }

        // 最終結果
        if (finalTranscript) {
          if (onResult) onResult(finalTranscript, true)
          _clearSilenceTimer()
          _isListening = false
          resolve(finalTranscript.trim())
        }
      }

      /* ── 錯誤處理 ── */
      _recognition.onerror = (event) => {
        _isListening = false
        _clearSilenceTimer()

        const errorMessages = {
          'not-allowed'        : '麥克風存取被拒絕，請在瀏覽器設定中允許麥克風權限',
          'no-speech'          : '未偵測到語音，請再試一次',
          'audio-capture'      : '無法存取麥克風，請確認麥克風已連接',
          'network'            : '網路錯誤，語音辨識需要連線',
          'aborted'            : '語音辨識已中止',
          'service-not-allowed': '語音服務不可用',
        }
        const msg = errorMessages[event.error] || `語音辨識錯誤：${event.error}`
        console.error('[SpeechEngine] 辨識錯誤:', event.error)
        if (onError) onError(msg)
        reject(new Error(msg))
      }

      /* ── 辨識結束 ── */
      _recognition.onend = () => {
        _isListening = false
        _clearSilenceTimer()
        // 若已透過 onresult resolve，此處無需再 resolve
      }

      /* ── 啟動靜音計時器（3秒後自動停止）── */
      _resetSilenceTimer(() => {
        stopListening()
        resolve('') // 無結果時以空字串結束
      })

      try {
        _recognition.start()
      } catch (err) {
        _isListening = false
        const msg = '無法啟動語音辨識：' + err.message
        if (onError) onError(msg)
        reject(new Error(msg))
      }
    })
  }

  /** 停止語音辨識 */
  function stopListening() {
    _clearSilenceTimer()
    if (_recognition) {
      try { _recognition.stop() } catch (_) {}
      _recognition = null
    }
    _isListening = false
  }

  function _resetSilenceTimer(cb, ms = 3000) {
    _clearSilenceTimer()
    _silenceTimer = setTimeout(cb, ms)
  }

  function _clearSilenceTimer() {
    if (_silenceTimer) {
      clearTimeout(_silenceTimer)
      _silenceTimer = null
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * 2. CANVAS WAVEFORM VISUALIZER (Siri-style)
   * ═══════════════════════════════════════════════════════════ */

  async function requestMicrophoneAccess() {
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      throw new Error('insecure-context')
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('media-devices-unavailable')
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    stream.getTracks().forEach(track => track.stop())
    return true
  }

  function getMicrophoneHelpMessage(err) {
    const name = err && (err.name || err.message) || ''
    if (name === 'insecure-context') return '麥克風需要 HTTPS 網址才能使用。請用正式 GitHub Pages 網址開啟。'
    if (name === 'media-devices-unavailable') return '這個瀏覽器無法存取麥克風。請改用 Chrome 或 Edge。'
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return '瀏覽器封鎖了麥克風。請點網址列左側的鎖頭圖示，將麥克風改成允許，然後重新整理。'
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '找不到麥克風。請確認耳機或電腦麥克風已連接，並在系統設定選好輸入裝置。'
    if (name === 'NotReadableError' || name === 'TrackStartError') return '麥克風目前被其他程式占用。請關閉會議軟體或錄音程式後再試。'
    return '麥克風啟動失敗。請確認瀏覽器與系統都已允許麥克風，或先按「略過」繼續。'
  }

  let _audioCtx       = null
  let _analyser       = null
  let _micStream      = null
  let _animFrameId    = null
  let _waveCanvas     = null
  let _waveCtx2d      = null
  let _isWaveActive   = false
  let _idlePhase      = 0      // for idle pulsing

  const BAR_COUNT  = 40
  const BAR_GAP    = 3
  const MIN_HEIGHT = 4
  const MAX_HEIGHT = 0.8      // fraction of canvas height

  /**
   * 初始化音波視覺化器
   * @param {HTMLCanvasElement} canvasEl
   */
  async function initWaveform(canvasEl) {
    if (!canvasEl) return
    _waveCanvas = canvasEl
    _waveCtx2d  = canvasEl.getContext('2d')

    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      _analyser = _audioCtx.createAnalyser()
      _analyser.fftSize              = 256
      _analyser.smoothingTimeConstant = 0.8

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      _micStream   = stream
      const source = _audioCtx.createMediaStreamSource(stream)
      source.connect(_analyser)
    } catch (err) {
      console.warn('[SpeechEngine] 音波初始化失敗（無麥克風）:', err.message)
      // Fallback: idle 動畫仍可運作
    }

    // 開始 idle 動畫
    _drawIdle()
  }

  /** 開始錄音音波動畫 */
  function startWaveform() {
    _isWaveActive = true
    if (_animFrameId) cancelAnimationFrame(_animFrameId)
    _animFrame()
  }

  /** 停止錄音音波，回到 idle 動畫 */
  function stopWaveform() {
    _isWaveActive = false
    if (_animFrameId) cancelAnimationFrame(_animFrameId)
    _animFrameId = null
    _drawIdle()
  }

  function _animFrame() {
    if (!_waveCanvas || !_waveCtx2d) return
    _animFrameId = requestAnimationFrame(_animFrame)

    const W = _waveCanvas.width
    const H = _waveCanvas.height

    _waveCtx2d.clearRect(0, 0, W, H)

    const frequencies = new Uint8Array(BAR_COUNT)

    if (_analyser) {
      const fullData = new Uint8Array(_analyser.frequencyBinCount)
      _analyser.getByteFrequencyData(fullData)
      const step = Math.floor(fullData.length / BAR_COUNT)
      for (let i = 0; i < BAR_COUNT; i++) {
        frequencies[i] = fullData[i * step]
      }
    } else {
      // Fallback: animated sine wave
      for (let i = 0; i < BAR_COUNT; i++) {
        frequencies[i] = 80 + 60 * Math.sin(Date.now() / 300 + i * 0.4)
      }
    }

    _drawBars(_waveCtx2d, W, H, frequencies)
  }

  function _drawIdle() {
    if (!_waveCanvas || !_waveCtx2d) return
    _idlePhase += 0.04
    const W = _waveCanvas.width
    const H = _waveCanvas.height
    _waveCtx2d.clearRect(0, 0, W, H)

    const idleFreqs = new Uint8Array(BAR_COUNT)
    for (let i = 0; i < BAR_COUNT; i++) {
      idleFreqs[i] = 20 + 18 * Math.sin(_idlePhase + i * 0.35)
    }

    _drawBars(_waveCtx2d, W, H, idleFreqs)
    if (!_isWaveActive) {
      _animFrameId = requestAnimationFrame(_drawIdle)
    }
  }

  /**
   * 繪製長條圖（漸層：紫 → 藍 → 金）
   * 顏色由振幅強度決定：低振幅偏紫，高振幅混入金色
   */
  function _drawBars(ctx, W, H, frequencies) {
    const barWidth = Math.floor((W - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT)

    for (let i = 0; i < BAR_COUNT; i++) {
      const amplitude = frequencies[i] / 255               // 0~1
      const barH      = Math.max(MIN_HEIGHT, amplitude * H * MAX_HEIGHT)
      const x         = i * (barWidth + BAR_GAP)
      const y         = (H - barH) / 2

      // 基礎：紫 #ce93d8 → 藍 #4fc3f7
      const t  = amplitude
      const r0 = Math.round(206 + t * (79  - 206))
      const g0 = Math.round(147 + t * (195 - 147))
      const b0 = Math.round(216 + t * (247 - 216))

      // 高振幅時混入金 #f5c842
      const goldMix = Math.max(0, amplitude - 0.6) / 0.4
      const rFinal  = Math.round(r0 + goldMix * (245 - r0))
      const gFinal  = Math.round(g0 + goldMix * (200 - g0))
      const bFinal  = Math.round(b0 + goldMix * (66  - b0))

      const gradient = ctx.createLinearGradient(x, y, x, y + barH)
      gradient.addColorStop(0, `rgba(${rFinal},${gFinal},${bFinal},0.95)`)
      gradient.addColorStop(1, `rgba(${rFinal},${gFinal},${bFinal},0.35)`)

      ctx.fillStyle = gradient
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barWidth, barH, Math.min(barWidth / 2, 4))
      } else {
        ctx.rect(x, y, barWidth, barH)
      }
      ctx.fill()
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * 3. DP WORD ALIGNMENT SCORING (Levenshtein)
   * ═══════════════════════════════════════════════════════════ */

  /** 正規化字串：小寫、去標點、分詞 */
  function _normalizeText(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, '')   // 保留連字號和撇號
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
  }

  /** 計算兩字串的 Levenshtein 距離 */
  function _levenshtein(a, b) {
    const m  = a.length
    const n  = b.length
    // 使用滾動陣列節省記憶體
    let prev = Array.from({ length: n + 1 }, (_, j) => j)
    let curr = new Array(n + 1)

    for (let i = 1; i <= m; i++) {
      curr[0] = i
      for (let j = 1; j <= n; j++) {
        curr[j] = a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
      }
      ;[prev, curr] = [curr, prev]
    }
    return prev[n]
  }

  /**
   * 逐詞 DP 對齊評分
   * @param {string} expected   — 正確答案
   * @param {string} transcript — 辨識結果
   * @returns {{ score: number, wordResults: Array<{word:string, status:string}> }}
   *   status: 'correct' | 'close' | 'wrong'
   */
  function scoreTranscript(expected, transcript) {
    const expWords   = _normalizeText(expected)
    const transWords = _normalizeText(transcript)

    if (expWords.length === 0) {
      return { score: 0, wordResults: [] }
    }

    // Greedy alignment: 對每個 expected word 找最近的 transcript word
    const used        = new Array(transWords.length).fill(false)
    const wordResults = []
    let correctWords  = 0
    let closeWords    = 0

    for (const expWord of expWords) {
      let bestDist = Infinity
      let bestIdx  = -1

      for (let j = 0; j < transWords.length; j++) {
        if (used[j]) continue
        const dist = _levenshtein(expWord, transWords[j])
        if (dist < bestDist) {
          bestDist = dist
          bestIdx  = j
        }
      }

      let status = 'wrong'
      if (bestIdx !== -1) {
        if (bestDist === 0) {
          status = 'correct'
          correctWords++
          used[bestIdx] = true
        } else if (bestDist === 1) {
          status = 'close'
          closeWords++
          used[bestIdx] = true
        }
        // 距離 > 1：wrong，不標記 used（允許其他詞再匹配）
      }

      wordResults.push({ word: expWord, status })
    }

    const score = Math.min(
      100,
      Math.round(((correctWords + 0.5 * closeWords) / expWords.length) * 100)
    )

    return { score, wordResults }
  }

  /* ═══════════════════════════════════════════════════════════
   * 4. TEXT-TO-SPEECH
   * ═══════════════════════════════════════════════════════════ */

  let _preferredVoice = null

  /** 取得最佳英語語音（優先自然語音） */
  function _getEnglishVoice() {
    if (_preferredVoice) return _preferredVoice

    const voices = window.speechSynthesis?.getVoices() || []

    // 依偏好清單選取
    const preferred = [
      'Google US English',
      'Google UK English Female',
      'Samantha',
      'Alex',
      'Zira',
    ]
    for (const name of preferred) {
      const v = voices.find(v => v.name === name)
      if (v) { _preferredVoice = v; return v }
    }

    // Fallback: 任意英語語音
    const fallback = voices.find(v => v.lang.startsWith('en'))
    if (fallback) _preferredVoice = fallback
    return _preferredVoice || null
  }

  /**
   * 朗讀文字
   * @param {string} text
   * @param {string} lang  — 預設 'en-US'
   * @param {number} rate  — 語速（0.1-2），預設 0.85
   * @returns {Promise<void>}
   */
  function speak(text, lang = 'en-US', rate = 0.85) {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('SpeechSynthesis 不支援'))
        return
      }

      stopSpeaking()

      const utterance  = new SpeechSynthesisUtterance(text)
      utterance.lang   = lang
      utterance.rate   = rate
      utterance.pitch  = 1.05
      utterance.volume = 1.0

      // 語音列表可能非同步載入
      const applyVoice = () => {
        const voice = _getEnglishVoice()
        if (voice) utterance.voice = voice
      }

      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener('voiceschanged', applyVoice, { once: true })
      } else {
        applyVoice()
      }

      utterance.onend   = () => resolve()
      utterance.onerror = (e) => {
        if (e.error === 'interrupted') { resolve(); return }
        console.error('[SpeechEngine] TTS 錯誤:', e.error)
        reject(new Error('TTS 錯誤：' + e.error))
      }

      window.speechSynthesis.speak(utterance)
    })
  }

  /** 中止目前朗讀 */
  function stopSpeaking() {
    window.speechSynthesis?.cancel()
  }

  /* ═══════════════════════════════════════════════════════════
   * 5. PHONETIC HELPER
   * ═══════════════════════════════════════════════════════════ */

  /**
   * 常見小學英語單字音標表（KK 音標）
   * 涵蓋新竹縣英語課本高頻字
   */
  const PHONETIC_TABLE = {
    // 動物
    cat: '/kæt/', dog: '/dɔg/', bird: '/bɝd/', fish: '/fɪʃ/',
    bear: '/bɛr/', lion: '/ˈlaɪən/', tiger: '/ˈtaɪgər/', rabbit: '/ˈræbɪt/',
    elephant: '/ˈɛləfənt/', monkey: '/ˈmʌŋki/', horse: '/hɔrs/', pig: '/pɪg/',
    cow: '/kaʊ/', sheep: '/ʃip/', duck: '/dʌk/', frog: '/frɔg/',
    snake: '/sneɪk/', turtle: '/ˈtɝtəl/', parrot: '/ˈpærət/',
    // 食物
    apple: '/ˈæpəl/', banana: '/bəˈnænə/', orange: '/ˈɔrɪndʒ/', bread: '/brɛd/',
    milk: '/mɪlk/', water: '/ˈwɔtər/', rice: '/raɪs/', cake: '/keɪk/',
    egg: '/ɛg/', cookie: '/ˈkʊki/', pizza: '/ˈpitsə/', salad: '/ˈsæləd/',
    meat: '/mit/', soup: '/sup/', noodle: '/ˈnudəl/', sandwich: '/ˈsændwɪtʃ/',
    // 顏色
    red: '/rɛd/', blue: '/blu/', green: '/grin/', yellow: '/ˈjɛlo/',
    black: '/blæk/', white: '/waɪt/', pink: '/pɪŋk/', purple: '/ˈpɝpəl/',
    brown: '/braʊn/', gray: '/greɪ/', silver: '/ˈsɪlvər/', gold: '/goʊld/',
    // 數字
    one: '/wʌn/', two: '/tu/', three: '/θri/', four: '/fɔr/',
    five: '/faɪv/', six: '/sɪks/', seven: '/ˈsɛvən/', eight: '/eɪt/',
    nine: '/naɪn/', ten: '/tɛn/', eleven: '/ɪˈlɛvən/', twelve: '/twɛlv/',
    twenty: '/ˈtwɛnti/', hundred: '/ˈhʌndrəd/',
    // 家庭成員
    mother: '/ˈmʌðər/', father: '/ˈfɑðər/', sister: '/ˈsɪstər/', brother: '/ˈbrʌðər/',
    family: '/ˈfæməli/', baby: '/ˈbeɪbi/', grandma: '/ˈɡrænmɑ/', grandpa: '/ˈɡrænpɑ/',
    aunt: '/ænt/', uncle: '/ˈʌŋkəl/', cousin: '/ˈkʌzən/',
    // 學校用品
    book: '/bʊk/', pen: '/pɛn/', pencil: '/ˈpɛnsəl/', ruler: '/ˈrulər/',
    eraser: '/ɪˈreɪzər/', bag: '/bæg/', desk: '/dɛsk/', chair: '/tʃɛr/',
    notebook: '/ˈnoʊtbʊk/', scissors: '/ˈsɪzərz/', glue: '/glu/',
    // 身體部位
    head: '/hɛd/', eye: '/aɪ/', nose: '/noz/', mouth: '/maʊθ/',
    ear: '/ɪr/', hand: '/hænd/', foot: '/fʊt/', leg: '/lɛg/',
    arm: '/ɑrm/', shoulder: '/ˈʃoʊldər/', knee: '/ni/', toe: '/toʊ/',
    // 天氣
    sunny: '/ˈsʌni/', rainy: '/ˈreɪni/', cloudy: '/ˈklaʊdi/', windy: '/ˈwɪndi/',
    snowy: '/ˈsnoʊi/', hot: '/hɑt/', cold: '/koʊld/', warm: '/wɔrm/',
    cool: '/kul/', foggy: '/ˈfɔgi/', stormy: '/ˈstɔrmi/',
    // 常用動詞
    run: '/rʌn/', jump: '/dʒʌmp/', swim: '/swɪm/', fly: '/flaɪ/',
    eat: '/it/', drink: '/drɪŋk/', sleep: '/slip/', read: '/rid/',
    write: '/raɪt/', draw: '/drɔ/', sing: '/sɪŋ/', dance: '/dæns/',
    play: '/pleɪ/', study: '/ˈstʌdi/', watch: '/wɑtʃ/', listen: '/ˈlɪsən/',
    speak: '/spik/', walk: '/wɔk/', ride: '/raɪd/', cook: '/kʊk/',
    // 場所
    school: '/skul/', home: '/hoʊm/', park: '/pɑrk/', store: '/stɔr/',
    library: '/ˈlaɪbrɛri/', hospital: '/ˈhɑspɪtəl/', restaurant: '/ˈrɛstərənt/',
    classroom: '/ˈklæsrum/', playground: '/ˈpleɪgraʊnd/', gym: '/dʒɪm/',
    // 節慶
    birthday: '/ˈbɝθdeɪ/', christmas: '/ˈkrɪsməs/', halloween: '/ˌhæloʊˈin/',
    holiday: '/ˈhɑlədeɪ/', party: '/ˈpɑrti/', gift: '/gɪft/', festival: '/ˈfɛstɪvəl/',
    // 形容詞
    big: '/bɪg/', small: '/smɔl/', tall: '/tɔl/', short: '/ʃɔrt/',
    happy: '/ˈhæpi/', sad: '/sæd/', angry: '/ˈæŋgri/', tired: '/taɪrd/',
    beautiful: '/ˈbjutɪfəl/', funny: '/ˈfʌni/', cute: '/kjut/', smart: '/smɑrt/',
    fast: '/fæst/', slow: '/sloʊ/', strong: '/strɔŋ/', kind: '/kaɪnd/',
    // 交通
    bus: '/bʌs/', car: '/kɑr/', bike: '/baɪk/', train: '/treɪn/',
    plane: '/pleɪn/', ship: '/ʃɪp/', taxi: '/ˈtæksi/', truck: '/trʌk/',
    // 時間
    morning: '/ˈmɔrnɪŋ/', afternoon: '/ˌæftərˈnun/', evening: '/ˈivnɪŋ/',
    night: '/naɪt/', today: '/təˈdeɪ/', yesterday: '/ˈjɛstərdeɪ/', tomorrow: '/təˈmɑroʊ/',
    // 月份
    january: '/ˈdʒænjuɛri/', february: '/ˈfɛbruɛri/', march: '/mɑrtʃ/',
    april: '/ˈeɪprəl/', may: '/meɪ/', june: '/dʒun/',
    july: '/dʒuˈlaɪ/', august: '/ˈɔgəst/', september: '/sɛpˈtɛmbər/',
    october: '/ɑkˈtoʊbər/', november: '/noʊˈvɛmbər/', december: '/dɪˈsɛmbər/',
  }

  /**
   * 取得音標
   * @param {string} word
   * @returns {string}
   */
  function getPhonetic(word) {
    if (!word) return ''
    const key = word.toLowerCase().trim()
    return PHONETIC_TABLE[key] || ('/' + key + '/')
  }

  /* ═══════════════════════════════════════════════════════════
   * 6. EXPORT
   * ═══════════════════════════════════════════════════════════ */

  window.SpeechEngine = {
    /** 是否支援語音辨識 */
    isSupported,

    /** 語音辨識 */
    startListening,
    stopListening,
    get isListening() { return _isListening },
    requestMicrophoneAccess,
    getMicrophoneHelpMessage,

    /** 音波視覺化 */
    initWaveform,
    startWaveform,
    stopWaveform,

    /** DP 評分 */
    scoreTranscript,

    /** TTS */
    speak,
    stopSpeaking,

    /** 音標 */
    getPhonetic,

    /** 不支援時顯示提示 */
    showUnsupportedMessage: _showUnsupportedMessage,
  }

  console.log('[SpeechEngine] 載入完成 | 語音辨識支援:', isSupported)

  // 預載語音列表，避免第一次朗讀延遲
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices()
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      _preferredVoice = null
      _getEnglishVoice()
    }, { once: true })
  }

})()
