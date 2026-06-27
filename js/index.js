/**
 * 新港國小英語單字王 — 首頁邏輯
 * 功能：載入排行榜、跑馬燈動態、學校積分
 */

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

  list.innerHTML = data.map(s => `
    <li class="leaderboard__item">
      <span class="leaderboard__rank leaderboard__rank--${s.rank}">
        ${rankIcons[s.rank] || `#${s.rank}`}
      </span>
      <div style="flex:1;">
        <div class="leaderboard__name">${escHtml(s.name)}</div>
        <div class="leaderboard__school">${escHtml(s.school)} · ${escHtml(s.class)} · ${s.streak > 0 ? `🔥 ${s.streak} 天連續` : ''}</div>
      </div>
      <span class="leaderboard__score">${Number(s.total_score).toLocaleString()}</span>
    </li>
  `).join('')
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
