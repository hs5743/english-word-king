import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPER_ADMIN_EMAIL = 'hs5743@gapp.hcc.edu.tw'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ConfigRow = {
  key: string
  value: string
  updated_at: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError(401, 'unauthorized', '請先登入。')

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user?.email) return jsonError(401, 'unauthorized', '登入驗證失敗。')
    if (!user.email.endsWith('@gapp.hcc.edu.tw')) return jsonError(403, 'invalid_domain', '僅限校園帳號使用。')

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('email', user.email)
      .maybeSingle()

    const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL
    const role = isSuperAdmin ? 'super_admin' : roleRow?.role
    if (!isSuperAdmin && role !== 'admin') return jsonError(403, 'forbidden', '需要管理員權限。')

    const body = await req.json().catch(() => ({}))
    const action = body.action

    switch (action) {
      case 'get-config-status':
        return await getConfigStatus(supabase)
      case 'test-ai-config':
        return await testAiConfig(supabase)
      case 'save-config':
        return await saveConfig(supabase, body)
      case 'get-roster':
        return await getRoster(supabase)
      case 'upsert-roster':
        return await upsertRoster(supabase, body)
      case 'set-roster-enabled':
        return await setRosterEnabled(supabase, body)
      case 'delete-roster':
        return await deleteRoster(supabase, body)
      case 'get-roles':
        return await getRoles(supabase)
      case 'add-role':
        return await addRole(supabase, body, isSuperAdmin)
      case 'delete-role':
        return await deleteRole(supabase, body, isSuperAdmin)
      default:
        return jsonError(400, 'unknown_action', '未知的管理動作。')
    }
  } catch (err) {
    console.error('[admin-api] error:', err)
    return jsonError(500, 'server_error', getErrorMessage(err) || '伺服器發生錯誤。')
  }
})

async function getConfigStatus(supabase: any) {
  const { data, error } = await supabase
    .from('system_config')
    .select('key,value,updated_at')
    .in('key', ['gemini_api_key', 'gemini_api_key_backup', 'groq_api_key'])
  if (error) throw error

  const status = Object.fromEntries(
    (data || []).map((row: ConfigRow) => [
      row.key,
      {
        configured: isConfiguredSecret(row.value),
        updated_at: row.updated_at,
      },
    ]),
  )

  for (const key of ['gemini_api_key', 'gemini_api_key_backup', 'groq_api_key']) {
    if (!status[key]) status[key] = { configured: false, updated_at: null }
  }

  return jsonOk({ status })
}

async function testAiConfig(supabase: any) {
  const { data, error } = await supabase
    .from('system_config')
    .select('key,value,updated_at')
    .in('key', ['gemini_api_key', 'gemini_api_key_backup', 'groq_api_key'])
  if (error) throw error

  const keys = Object.fromEntries((data || []).map((row: ConfigRow) => [row.key, row.value])) as Record<string, string>
  const attempts: Array<{ provider: string; ok: boolean; message: string }> = []

  if (isConfiguredSecret(keys.gemini_api_key)) {
    const result = await testGemini(keys.gemini_api_key)
    attempts.push({ provider: 'Gemini primary', ...result })
    if (result.ok) return jsonOk({ ok: true, provider: 'Gemini primary', attempts })
  }

  if (isConfiguredSecret(keys.gemini_api_key_backup)) {
    const result = await testGemini(keys.gemini_api_key_backup)
    attempts.push({ provider: 'Gemini backup', ...result })
    if (result.ok) return jsonOk({ ok: true, provider: 'Gemini backup', attempts })
  }

  if (isConfiguredSecret(keys.groq_api_key)) {
    const result = await testGroq(keys.groq_api_key)
    attempts.push({ provider: 'Groq', ...result })
    if (result.ok) return jsonOk({ ok: true, provider: 'Groq', attempts })
  }

  return jsonOk({
    ok: false,
    provider: null,
    attempts,
    message: attempts.length ? 'No configured AI provider passed the live check.' : 'No AI API key is configured.',
  })
}

async function saveConfig(supabase: any, body: any) {
  const rows: ConfigRow[] = []
  const updated_at = new Date().toISOString()
  if (body.gemini_api_key) rows.push({ key: 'gemini_api_key', value: String(body.gemini_api_key), updated_at })
  if (body.gemini_api_key_backup) rows.push({ key: 'gemini_api_key_backup', value: String(body.gemini_api_key_backup), updated_at })
  if (body.groq_api_key) rows.push({ key: 'groq_api_key', value: String(body.groq_api_key), updated_at })
  if (rows.length === 0) return jsonError(400, 'no_changes', '沒有可儲存的設定。')

  const { error } = await supabase.from('system_config').upsert(rows)
  if (error) throw error
  return jsonOk({ saved: rows.map(row => row.key) })
}

async function getRoster(supabase: any) {
  const { data, error } = await supabase
    .from('student_roster')
    .select('*')
    .order('school', { ascending: true })
    .order('class', { ascending: true })
  if (error) throw error
  return jsonOk({ roster: data || [] })
}

async function upsertRoster(supabase: any, body: any) {
  const roster = Array.isArray(body.roster) ? body.roster : [body.student]
  const cleaned = roster.filter(Boolean).map(normalizeRosterRow)
  if (cleaned.length === 0) return jsonError(400, 'empty_roster', '沒有有效的學生資料。')

  const { error } = await supabase.from('student_roster').upsert(cleaned)
  if (error) throw error
  return jsonOk({ count: cleaned.length })
}

async function setRosterEnabled(supabase: any, body: any) {
  const email = normalizeEmail(body.email)
  const enabled = Boolean(body.enabled)
  const { error } = await supabase.from('student_roster').update({ enabled }).eq('email', email)
  if (error) throw error

  const { error: studentError } = await supabase.from('students').update({ enabled }).eq('email', email)
  if (studentError) console.warn('[admin-api] students enabled sync failed:', studentError.message)
  return jsonOk({ email, enabled })
}

async function deleteRoster(supabase: any, body: any) {
  const email = normalizeEmail(body.email)
  const { error } = await supabase.from('student_roster').delete().eq('email', email)
  if (error) throw error

  const { error: studentError } = await supabase.from('students').delete().eq('email', email)
  if (studentError) console.warn('[admin-api] students delete sync failed:', studentError.message)
  return jsonOk({ email })
}

async function getRoles(supabase: any) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('*')
    .order('role', { ascending: true })
  if (error) throw error
  return jsonOk({ roles: data || [] })
}

async function addRole(supabase: any, body: any, isSuperAdmin: boolean) {
  const email = normalizeEmail(body.email)
  const role = String(body.role || '')
  if (!['admin', 'teacher'].includes(role)) return jsonError(400, 'invalid_role', '角色必須是 admin 或 teacher。')
  if (role === 'admin' && !isSuperAdmin) return jsonError(403, 'forbidden', '只有系統管理者可新增管理者。')

  const { error } = await supabase.from('user_roles').upsert({ email, role })
  if (error) throw error
  return jsonOk({ email, role })
}

async function deleteRole(supabase: any, body: any, isSuperAdmin: boolean) {
  const email = normalizeEmail(body.email)
  if (email === SUPER_ADMIN_EMAIL) return jsonError(400, 'cannot_delete_super_admin', '不可刪除系統管理者。')

  const { data: targetRole, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('email', email)
    .maybeSingle()
  if (roleError) throw roleError
  if (targetRole?.role === 'admin' && !isSuperAdmin) return jsonError(403, 'forbidden', '只有系統管理者可刪除管理者。')

  const { error } = await supabase.from('user_roles').delete().eq('email', email)
  if (error) throw error
  return jsonOk({ email })
}

function normalizeRosterRow(row: any) {
  const email = normalizeEmail(row.email)
  const grade = Number(row.grade)
  if (!row.name || !row.school || !row.class || !Number.isInteger(grade) || grade < 3 || grade > 6) {
    throw new Error(`學生資料格式錯誤：${email}`)
  }
  return {
    email,
    name: String(row.name).trim(),
    school: String(row.school).trim(),
    class: String(row.class).trim(),
    grade,
    enabled: row.enabled !== false,
  }
}

function normalizeEmail(email: string) {
  const value = String(email || '').trim().toLowerCase()
  if (!value.endsWith('@gapp.hcc.edu.tw')) throw new Error('信箱必須為 @gapp.hcc.edu.tw。')
  return value
}

function isConfiguredSecret(value: unknown) {
  const text = String(value || '').trim()
  return Boolean(text) && text !== 'REPLACE_WITH_YOUR_GEMINI_KEY'
}

async function testGemini(key: string) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8 },
      }),
    })
    if (!res.ok) return { ok: false, message: await compactError(res) }
    return { ok: true, message: 'Live Gemini request succeeded.' }
  } catch (err) {
    return { ok: false, message: getErrorMessage(err) }
  }
}

async function testGroq(key: string) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        temperature: 0,
        max_tokens: 8,
      }),
    })
    if (!res.ok) return { ok: false, message: await compactError(res) }
    return { ok: true, message: 'Live Groq request succeeded.' }
  } catch (err) {
    return { ok: false, message: getErrorMessage(err) }
  }
}

async function compactError(res: Response) {
  const text = await res.text().catch(() => '')
  return `${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 240)}` : ''}`
}

function jsonOk(payload: Record<string, unknown>) {
  return new Response(JSON.stringify({ success: true, ...payload }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ success: false, error: code, message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err || '')
}
