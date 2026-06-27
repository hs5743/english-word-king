-- ============================================================
-- 新港國小英語單字王 — Row Level Security 政策
-- 請在執行 schema.sql 之後執行此腳本
-- ============================================================

-- 啟用所有資料表的 RLS
ALTER TABLE student_roster      ENABLE ROW LEVEL SECURITY;
ALTER TABLE students            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_attempts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed       ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 輔助函數：驗證信箱是否為 @gapp.hcc.edu.tw
-- ============================================================
CREATE OR REPLACE FUNCTION is_school_email()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.jwt() ->> 'email') LIKE '%@gapp.hcc.edu.tw';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 輔助函數：取得當前使用者 email
CREATE OR REPLACE FUNCTION current_user_email()
RETURNS TEXT AS $$
BEGIN
  RETURN auth.jwt() ->> 'email';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 輔助函數：判斷目前使用者是否為 super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.jwt() ->> 'email' = 'hs5743@gapp.hcc.edu.tw';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 輔助函數：判斷目前使用者是否具指定教職員角色
CREATE OR REPLACE FUNCTION has_role(roles TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM user_roles
      WHERE email = auth.jwt() ->> 'email'
        AND role = ANY(roles)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- student_roster — 學生名冊
-- 登入的校園帳號可查詢自己的名冊資料（用於登入驗證）
-- ============================================================
CREATE POLICY "校園帳號可查詢名冊"
  ON student_roster FOR SELECT
  TO authenticated
  USING (is_school_email() AND email = current_user_email());

CREATE POLICY "管理者可查詢名冊"
  ON student_roster FOR SELECT
  TO authenticated
  USING (has_role(ARRAY['admin']));

-- service_role（Edge Function / 管理員）可完全讀寫
CREATE POLICY "Service role 完全存取名冊"
  ON student_roster FOR ALL
  TO service_role
  USING (true);

-- ============================================================
-- user_roles — 教職員角色
-- ============================================================
CREATE POLICY "使用者可查詢自己的角色"
  ON user_roles FOR SELECT
  TO authenticated
  USING (email = current_user_email() OR is_super_admin());

CREATE POLICY "Service role 完全存取角色"
  ON user_roles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- students — 學生個人檔案
-- ============================================================
-- 學生只能查詢自己的資料
CREATE POLICY "學生查看自己的檔案"
  ON students FOR SELECT
  TO authenticated
  USING (auth.uid()::text = uid OR has_role(ARRAY['admin', 'teacher']));

-- 學生只能更新自己的資料
CREATE POLICY "學生更新自己的檔案"
  ON students FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = uid);

-- 任何校園帳號登入後可建立自己的檔案
CREATE POLICY "校園帳號可建立個人檔案"
  ON students FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = uid AND is_school_email());

-- service_role 完全存取
CREATE POLICY "Service role 完全存取學生資料"
  ON students FOR ALL
  TO service_role
  USING (true);

-- ============================================================
-- challenge_sessions — 課堂場次
-- ============================================================
-- 所有已登入的校園帳號可查詢進行中的場次（用於加入）
CREATE POLICY "校園帳號可查詢場次"
  ON challenge_sessions FOR SELECT
  TO authenticated
  USING (is_school_email() AND status = 'active');

-- service_role 完全存取（Edge Function 建立/關閉場次）
CREATE POLICY "Service role 完全存取場次"
  ON challenge_sessions FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "教職員可建立場次"
  ON challenge_sessions FOR INSERT
  TO authenticated
  WITH CHECK (is_school_email() AND has_role(ARRAY['admin', 'teacher']) AND teacher_uid = auth.uid()::text);

CREATE POLICY "建立者或管理者可更新場次"
  ON challenge_sessions FOR UPDATE
  TO authenticated
  USING (teacher_uid = auth.uid()::text OR has_role(ARRAY['admin']))
  WITH CHECK (teacher_uid = auth.uid()::text OR has_role(ARRAY['admin']));

-- ============================================================
-- daily_attempts — 挑戰紀錄
-- ============================================================
-- 學生與教職員可查詢挑戰紀錄
CREATE POLICY "教職員與學生可查看挑戰紀錄"
  ON daily_attempts FOR SELECT
  TO authenticated
  USING (
    student_uid = auth.uid()::text OR
    has_role(ARRAY['admin', 'teacher'])
  );


-- 學生可以新增自己的挑戰紀錄
CREATE POLICY "學生新增挑戰紀錄"
  ON daily_attempts FOR INSERT
  TO authenticated
  WITH CHECK (student_uid = auth.uid()::text AND is_school_email());

-- service_role 完全存取（排行榜查詢需讀取全部）
CREATE POLICY "Service role 完全存取挑戰紀錄"
  ON daily_attempts FOR ALL
  TO service_role
  USING (true);

-- ============================================================
-- system_config — 系統設定（AI 金鑰等敏感資訊）
-- 前端完全無法讀取，只有 service_role（Edge Function）可讀
-- ============================================================
CREATE POLICY "Service role 完全存取系統設定"
  ON system_config FOR ALL
  TO service_role
  USING (true);

-- ============================================================
-- activity_feed — 活躍跑馬燈
-- 所有人（含未登入）可查詢最新動態
-- ============================================================
CREATE POLICY "任何人可讀取活躍動態"
  ON activity_feed FOR SELECT
  TO anon, authenticated
  USING (true);

-- 只有 service_role 可寫入動態
CREATE POLICY "Service role 寫入活躍動態"
  ON activity_feed FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================
-- 排行榜用的安全 View（允許公開讀取彙整統計）
-- 不暴露個人敏感欄位
-- ============================================================
CREATE OR REPLACE VIEW school_leaderboard AS
SELECT
  school,
  COUNT(DISTINCT student_uid) AS active_students,
  SUM(score) AS total_school_score,
  AVG(score)::INT AS avg_score
FROM daily_attempts
WHERE practice = false
GROUP BY school
ORDER BY total_school_score DESC;

CREATE OR REPLACE VIEW student_leaderboard AS
SELECT
  s.name,
  s.school,
  s.class,
  s.grade,
  s.total_score,
  s.streak,
  s.speech_stars,
  RANK() OVER (ORDER BY s.total_score DESC) AS rank
FROM students s
WHERE s.enabled = true
ORDER BY s.total_score DESC
LIMIT 50;

-- 允許任何已登入用戶查看排行榜 View
GRANT SELECT ON school_leaderboard  TO authenticated, anon;
GRANT SELECT ON student_leaderboard TO authenticated, anon;
