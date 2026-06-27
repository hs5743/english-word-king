/**
 * 新港國小英語單字王 — 首頁邏輯
 * 功能：載入排行榜、跑馬燈動態、學校積分
 */

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

document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.SupabaseConfig?.initSupabase()
  if (!sb) return

  // 檢查是否已登入
  const user = await window.SupabaseConfig.getCurrentUser()
  if (user) {
    const btnStart = document.getElementById('btn-start')
    const btnCta   = document.getElementById('btn-cta')
    if (btnStart) { btnStart.textContent = '🚀 繼續今日挑戰'; btnStart.href = 'app.html' }
    if (btnCta)   { btnCta.textContent   = '繼續挑戰'; btnCta.href = 'app.html' }

    // 獲取已登入學生的個人資料 (用於顯示首頁寶石)
    try {
      const { data: profile } = await sb
        .from('students')
        .select('mastery, total_score')
        .eq('uid', user.id)
        .single()
      
      if (profile) {
        let masteredCount = 0
        if (profile.mastery) {
          for (const word in profile.mastery) {
            if (profile.mastery[word] >= 2) {
              masteredCount++
            }
          }
        }
        
        let currentTierIndex = 0
        for (let i = gemTiers.length - 1; i >= 0; i--) {
          if (masteredCount >= gemTiers[i].min) {
            currentTierIndex = i
            break
          }
        }
        const currentTier = gemTiers[currentTierIndex]
        const nextTier = gemTiers[currentTierIndex + 1]

        const gemSec = document.getElementById('index-gem-section')
        const gemBadge = document.getElementById('index-gem-badge')
        if (gemSec && gemBadge) {
          gemBadge.textContent = `${currentTier.emoji} ${currentTier.name}`
          gemSec.style.display = 'block'
        }

        // 綁定大廳點擊 Modal 的資料
        window.showIndexLevelModal = () => {
          document.getElementById('modalGemEmoji').textContent = currentTier.emoji
          document.getElementById('modalGemName').textContent = currentTier.name
          document.getElementById('modalGemHardness').textContent = `莫氏硬度: ${currentTier.hardness}`
          document.getElementById('modalGemDesc').textContent = currentTier.desc
          document.getElementById('modalStudentScore').textContent = (profile.total_score || 0).toLocaleString()
          document.getElementById('modalMasteredCount').textContent = `${masteredCount} 字`

          const nextTextEl = document.getElementById('modalNextLevelText')
          if (nextTier) {
            const diff = nextTier.min - masteredCount
            nextTextEl.textContent = `距離升級到【${nextTier.name}】還差 ${diff} 顆熟練字 🚀`
          } else {
            nextTextEl.textContent = `恭喜！您已達到了寶石硬度的終極殿堂！🎉`
          }

          document.getElementById('levelModal').style.display = 'block'
          document.getElementById('levelModalOverlay').style.display = 'block'
        }
      }
    } catch (err) {
      console.warn("載入首頁學生寶石等級失敗:", err)
    }
  }

  // 載入學校積分
  loadSchoolScores(sb)

  // 載入個人排行榜
  loadLeaderboard(sb)

  // 載入跑馬燈動態
  loadActivityFeed(sb)

  // Realtime 訂閱：排行榜即時更新
  sb.channel('leaderboard-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_attempts' }, () => {
      loadSchoolScores(sb)
      loadLeaderboard(sb)
    })
    .subscribe()
})

/* ── 學校積分 ──────────────────────────────────────────── */
async function loadSchoolScores(sb) {
  const { data, error } = await sb.from('school_leaderboard').select('*')
  if (error || !data) return

  const schoolMap = {
    '鳳岡國小': { scoreEl: 'score-fenggong', studentsEl: 'students-fenggong' },
    '豐田國小': { scoreEl: 'score-fengtian', studentsEl: 'students-fengtian' },
    '新港國小': { scoreEl: 'score-xingang',  studentsEl: 'students-xingang'  },
  }

  data.forEach(row => {
    const els = schoolMap[row.school]
    if (!els) return
    const scoreEl    = document.getElementById(els.scoreEl)
    const studentsEl = document.getElementById(els.studentsEl)
    if (scoreEl)    scoreEl.textContent    = Number(row.total_school_score).toLocaleString()
    if (studentsEl) studentsEl.textContent = `${row.active_students} 人參與・平均 ${row.avg_score} 分`
  })
}

/* ── 個人排行榜 ────────────────────────────────────────── */
async function loadLeaderboard(sb) {
  const list = document.getElementById('leaderboardList')
  if (!list) return

  const { data, error } = await sb.from('student_leaderboard').select('*').limit(10)
  if (error || !data || data.length === 0) {
    list.innerHTML = '<li style="text-align:center;padding:var(--sp-xl);color:var(--clr-text-muted);">尚無紀錄，成為第一位挑戰者吧！</li>'
    return
  }

  const rankIcons = { 1: '🥇', 2: '🥈', 3: '🥉' }

  list.innerHTML = data.map(s => {
    let gemTag = ''
    if (s.mastered_words !== undefined) {
      let currentTier = gemTiers[0]
      for (let i = gemTiers.length - 1; i >= 0; i--) {
        if (s.mastered_words >= gemTiers[i].min) {
          currentTier = gemTiers[i]
          break
        }
      }
      gemTag = ` <span style="font-size:0.75rem; padding: 2px 6px; background: rgba(255,215,0,0.1); border: 1px solid rgba(255,215,0,0.2); border-radius: 10px; color: var(--clr-gold-1); margin-left: 6px; font-weight: bold; white-space: nowrap;">${currentTier.emoji} ${currentTier.name.split(' ')[0]}</span>`
    }

    return `
      <li class="leaderboard__item">
        <span class="leaderboard__rank leaderboard__rank--${s.rank}">
          ${rankIcons[s.rank] || `#${s.rank}`}
        </span>
        <div style="flex:1;">
          <div class="leaderboard__name">${escHtml(s.name)}${gemTag}</div>
          <div class="leaderboard__school">${escHtml(s.school)} · ${escHtml(s.class)} · ${s.streak > 0 ? `🔥 ${s.streak} 天連續` : ''}</div>
        </div>
        <span class="leaderboard__score">${Number(s.total_score).toLocaleString()}</span>
      </li>
    `
  }).join('')
}

/* ── 跑馬燈動態 ────────────────────────────────────────── */
async function loadActivityFeed(sb) {
  const track = document.getElementById('marqueeTrack')
  if (!track) return

  const { data, error } = await sb
    .from('activity_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error || !data || data.length === 0) return

  const items = [...data, ...data].map(row => `
    <div class="marquee-item">
      <span class="marquee-item__dot"></span>
      <span>${escHtml(row.school)} ${escHtml(row.student_name)} ${escHtml(row.message)}</span>
    </div>
  `).join('')

  track.innerHTML = items
}

/* ── 工具函數 ───────────────────────────────────────────── */
function escHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer')
  if (!container) return
  const toast = document.createElement('div')
  toast.className = `toast toast--${type}`
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 3200)
}
