-- 初始化新港國小英語單字王資料庫

-- ============================================================
-- 新港國小英語單字王 — 資料庫初始化腳本
-- 請在 Supabase Dashboard → SQL Editor 中執行此腳本
-- ============================================================

-- 1. 學生名冊表（由管理員從 admin.html 匯入）
CREATE TABLE IF NOT EXISTS student_roster (
  email     VARCHAR PRIMARY KEY,
  name      VARCHAR NOT NULL,
  school    VARCHAR NOT NULL,   -- 鳳岡國小 / 豐田國小 / 新港國小
  class     VARCHAR NOT NULL,   -- 例如：五年一班
  grade     INT     NOT NULL,   -- 3~6
  enabled   BOOLEAN DEFAULT TRUE NOT NULL
);

-- 2. 學生個人檔案表（學生首次登入後自動建立）
CREATE TABLE IF NOT EXISTS students (
  uid                VARCHAR PRIMARY KEY,
  email              VARCHAR UNIQUE NOT NULL,
  name               VARCHAR NOT NULL,
  school             VARCHAR NOT NULL,
  class              VARCHAR NOT NULL,
  grade              INT     NOT NULL,
  streak             INT     DEFAULT 0   NOT NULL,  -- 連續挑戰天數
  energy             INT     DEFAULT 100 NOT NULL,  -- 體力值（保留未來用）
  speech_stars       INT     DEFAULT 0   NOT NULL,  -- 口說星星累計
  total_score        INT     DEFAULT 0   NOT NULL,  -- 累計總積分
  last_challenge_date VARCHAR DEFAULT '' NOT NULL,  -- 最後計分挑戰日期 yyyy-mm-dd
  last_active        TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  enabled            BOOLEAN DEFAULT TRUE NOT NULL,
  mastery            JSONB   DEFAULT '{}'::jsonb NOT NULL  -- 單字熟練度 {"apple": 2, "banana": 0}
);

-- 3. 教職員角色授權表（super admin / admin 管理）
CREATE TABLE IF NOT EXISTS user_roles (
  email      VARCHAR PRIMARY KEY,
  role       VARCHAR NOT NULL CHECK (role IN ('admin', 'teacher')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 4. 課堂場次表（教師從 teacher.html 建立）
CREATE TABLE IF NOT EXISTS challenge_sessions (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_uid  VARCHAR NOT NULL,
  session_code VARCHAR UNIQUE NOT NULL,  -- 6位數字碼，學生輸入加入
  school       VARCHAR,
  classes      VARCHAR,  -- 允許班級，逗號分隔，空白表示全校開放
  status       VARCHAR DEFAULT 'active' NOT NULL,  -- active / closed
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at   TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 5. 挑戰歷史紀錄表（累計排行榜用）
CREATE TABLE IF NOT EXISTS daily_attempts (
  id           VARCHAR PRIMARY KEY,  -- 格式: {uid}_{date}_{sessionId or 'free'}
  student_uid  VARCHAR REFERENCES students(uid) ON DELETE CASCADE NOT NULL,
  student_name VARCHAR NOT NULL,
  school       VARCHAR NOT NULL,
  class        VARCHAR NOT NULL,
  grade        INT     NOT NULL,
  date         VARCHAR NOT NULL,     -- yyyy-mm-dd
  score        INT     NOT NULL,
  wrong        JSONB   NOT NULL,     -- 答錯的單字清單
  speech_scores JSONB  NOT NULL,     -- 各題口說評分
  practice     BOOLEAN DEFAULT FALSE NOT NULL,  -- true = 練習模式不計分
  session_id   UUID,                -- NULL 表示自由練習
  timestamp    TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 6. 系統設定表（AI 金鑰等敏感資訊，僅後端 service_role 可讀）
CREATE TABLE IF NOT EXISTS system_config (
  key   VARCHAR PRIMARY KEY,
  value TEXT    NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 7. 活躍跑馬燈紀錄（首頁顯示最新挑戰動態）
CREATE TABLE IF NOT EXISTS activity_feed (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name VARCHAR NOT NULL,
  school       VARCHAR NOT NULL,
  grade        INT     NOT NULL,
  score        INT     NOT NULL,
  message      VARCHAR NOT NULL,  -- 例如：完成了 12 題，得 95 分！
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ============================================================
-- 索引（加速查詢）
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_daily_attempts_uid      ON daily_attempts(student_uid);
CREATE INDEX IF NOT EXISTS idx_daily_attempts_date     ON daily_attempts(date);
CREATE INDEX IF NOT EXISTS idx_daily_attempts_school   ON daily_attempts(school);
CREATE INDEX IF NOT EXISTS idx_students_school         ON students(school);
CREATE INDEX IF NOT EXISTS idx_students_total_score    ON students(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_role         ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created   ON activity_feed(created_at DESC);

-- ============================================================
-- 活動跑馬燈：每日計分挑戰完成後自動產生首頁動態
-- ============================================================
CREATE OR REPLACE FUNCTION create_activity_feed_from_attempt()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.practice = false THEN
    INSERT INTO activity_feed (student_name, school, grade, score, message)
    VALUES (
      NEW.student_name,
      NEW.school,
      NEW.grade,
      NEW.score,
      '完成了 12 題挑戰，獲得了 ' || NEW.score || ' 分！'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_create_activity_feed_from_attempt ON daily_attempts;
CREATE TRIGGER trg_create_activity_feed_from_attempt
AFTER INSERT ON daily_attempts
FOR EACH ROW
EXECUTE FUNCTION create_activity_feed_from_attempt();

-- ============================================================
-- 初始系統設定（執行後到 admin.html 替換實際金鑰）
-- ============================================================
INSERT INTO system_config (key, value) VALUES
  ('gemini_api_key',        'REPLACE_WITH_YOUR_GEMINI_KEY'),
  ('gemini_api_key_backup', ''),
  ('groq_api_key',          ''),
  ('site_title',            '三校聯網・英語單字王'),
  ('max_daily_score_challenges', '1')
ON CONFLICT (key) DO NOTHING;


-- 安全性規則

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
