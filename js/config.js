/**
 * 新港國小英語單字王 — Supabase 設定
 *
 * 部署前請替換以下兩個值：
 *   SUPABASE_URL  → 你的 Supabase Project URL
 *   SUPABASE_KEY  → 你的 Supabase anon public key
 *
 * 可在 Supabase Dashboard → Project Settings → API 找到
 */

const SUPABASE_URL = 'https://tzvnyluqommusppbzyiy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6dm55bHVxb21tdXNwcGJ6eWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0OTEyMTQsImV4cCI6MjA5ODA2NzIxNH0.fBJiVjLzRlIom2uwTmjwJrmHt6DP2xi98H2LhiDdVx0'

// 載入 Supabase SDK（從 CDN）
// 注意：此設定檔需在載入 Supabase SDK 之後才能使用
// 請確保 HTML 中 <script src="supabase cdn"> 在本檔案之前

let localSupabase = null

function getPageUrl(page) {
  return new URL(page, window.location.href).href
}

function initSupabase() {
  if (localSupabase) return localSupabase
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase SDK 尚未載入！')
    return null
  }
  localSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    }
  })
  return localSupabase
}

/**
 * 取得已初始化的 Supabase Client
 */
function getSupabase() {
  return localSupabase || initSupabase()
}

/**
 * 取得目前登入使用者（含 session）
 */
async function getCurrentUser() {
  const sb = getSupabase()
  if (!sb) return null
  const { data: { user } } = await sb.auth.getUser()
  return user
}

/**
 * 以 Google 登入（限定 @gapp.hcc.edu.tw）
 */
async function signInWithGoogle(redirectTo = getPageUrl('join.html')) {
  const sb = getSupabase()
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      queryParams: {
        hd: 'gapp.hcc.edu.tw',  // 限定新竹縣學校帳號
        prompt: 'select_account',
      },
      redirectTo,
    }
  })
  if (error) throw error
  return data
}

/**
 * 登出
 */
async function signOut() {
  const sb = getSupabase()
  await sb.auth.signOut()
  window.location.href = 'index.html'
}

/**
 * 學生首次登入後建立/取得個人檔案
 */
async function ensureStudentProfile(user) {
  const sb = getSupabase()

  // 查詢名冊
  const { data: roster, error: rosterError } = await sb
    .from('student_roster')
    .select('*')
    .eq('email', user.email)
    .single()

  if (rosterError || !roster) {
    throw new Error('查無此學生資料，請確認您的帳號是否已被老師加入名冊。')
  }
  if (!roster.enabled) {
    throw new Error('您的帳號目前已停用，請聯絡老師。')
  }

  // 查詢是否已有個人檔案
  const { data: existing } = await sb
    .from('students')
    .select('uid')
    .eq('uid', user.id)
    .single()

  if (!existing) {
    // 建立個人檔案
    const { error: insertError } = await sb
      .from('students')
      .insert({
        uid: user.id,
        email: user.email,
        name: roster.name,
        school: roster.school,
        class: roster.class,
        grade: roster.grade,
      })
    if (insertError) throw insertError
  }

  return roster
}

// 讓全域可存取
window.SupabaseConfig = {
  initSupabase,
  getSupabase,
  getCurrentUser,
  signInWithGoogle,
  signOut,
  ensureStudentProfile,
  SUPABASE_URL,
  getPageUrl,
}

// 頁面載入時自動初始化
document.addEventListener('DOMContentLoaded', () => {
  initSupabase()
})
