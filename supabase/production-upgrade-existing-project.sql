-- ============================================================
-- 新港國小英語單字王 — 既有 Supabase 專案升級腳本
-- 適用：已經有 english-word-king / tzvnyluqommusppbzyiy 專案，不想重建資料庫
-- 執行位置：Supabase Dashboard → SQL Editor
-- ============================================================

-- ---------- Tables / columns ----------
CREATE TABLE IF NOT EXISTS student_roster (
  email   VARCHAR PRIMARY KEY,
  name    VARCHAR NOT NULL,
  school  VARCHAR NOT NULL,
  class   VARCHAR NOT NULL,
  grade   INT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  uid                 VARCHAR PRIMARY KEY,
  email               VARCHAR UNIQUE NOT NULL,
  name                VARCHAR NOT NULL,
  school              VARCHAR NOT NULL,
  class               VARCHAR NOT NULL,
  grade               INT NOT NULL,
  streak              INT DEFAULT 0 NOT NULL,
  energy              INT DEFAULT 100 NOT NULL,
  speech_stars        INT DEFAULT 0 NOT NULL,
  total_score         INT DEFAULT 0 NOT NULL,
  last_challenge_date VARCHAR DEFAULT '' NOT NULL,
  last_active         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  enabled             BOOLEAN DEFAULT TRUE NOT NULL,
  mastery             JSONB DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS streak INT DEFAULT 0 NOT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS energy INT DEFAULT 100 NOT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS speech_stars INT DEFAULT 0 NOT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS total_score INT DEFAULT 0 NOT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_challenge_date VARCHAR DEFAULT '' NOT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE NOT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS mastery JSONB DEFAULT '{}'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS user_roles (
  email      VARCHAR PRIMARY KEY,
  role       VARCHAR NOT NULL CHECK (role IN ('admin', 'teacher')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS challenge_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_uid  VARCHAR NOT NULL,
  session_code VARCHAR UNIQUE NOT NULL,
  school       VARCHAR,
  classes      VARCHAR,
  status       VARCHAR DEFAULT 'active' NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at   TIMESTAMP WITH TIME ZONE NOT NULL
);

ALTER TABLE challenge_sessions ADD COLUMN IF NOT EXISTS teacher_uid VARCHAR;
ALTER TABLE challenge_sessions ADD COLUMN IF NOT EXISTS session_code VARCHAR;
ALTER TABLE challenge_sessions ADD COLUMN IF NOT EXISTS school VARCHAR;
ALTER TABLE challenge_sessions ADD COLUMN IF NOT EXISTS classes VARCHAR;
ALTER TABLE challenge_sessions ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active' NOT NULL;
ALTER TABLE challenge_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
ALTER TABLE challenge_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '3 hours') NOT NULL;

CREATE TABLE IF NOT EXISTS daily_attempts (
  id            VARCHAR PRIMARY KEY,
  student_uid   VARCHAR REFERENCES students(uid) ON DELETE CASCADE NOT NULL,
  student_name  VARCHAR NOT NULL,
  school        VARCHAR NOT NULL,
  class         VARCHAR NOT NULL,
  grade         INT NOT NULL,
  date          VARCHAR NOT NULL,
  score         INT NOT NULL,
  wrong         JSONB NOT NULL,
  speech_scores JSONB NOT NULL,
  practice      BOOLEAN DEFAULT FALSE NOT NULL,
  session_id    UUID,
  timestamp     TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE daily_attempts ADD COLUMN IF NOT EXISTS student_name VARCHAR;
ALTER TABLE daily_attempts ADD COLUMN IF NOT EXISTS school VARCHAR;
ALTER TABLE daily_attempts ADD COLUMN IF NOT EXISTS class VARCHAR;
ALTER TABLE daily_attempts ADD COLUMN IF NOT EXISTS grade INT;
ALTER TABLE daily_attempts ADD COLUMN IF NOT EXISTS date VARCHAR;
ALTER TABLE daily_attempts ADD COLUMN IF NOT EXISTS wrong JSONB DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE daily_attempts ADD COLUMN IF NOT EXISTS speech_scores JSONB DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE daily_attempts ADD COLUMN IF NOT EXISTS practice BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE daily_attempts ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE daily_attempts ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;

CREATE TABLE IF NOT EXISTS system_config (
  key        VARCHAR PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_feed (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name VARCHAR NOT NULL,
  school       VARCHAR NOT NULL,
  grade        INT NOT NULL,
  score        INT NOT NULL,
  message      VARCHAR NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

INSERT INTO system_config (key, value) VALUES
  ('gemini_api_key', 'REPLACE_WITH_YOUR_GEMINI_KEY'),
  ('gemini_api_key_backup', ''),
  ('groq_api_key', ''),
  ('site_title', '三校聯網・英語單字王'),
  ('max_daily_score_challenges', '1')
ON CONFLICT (key) DO NOTHING;

-- ---------- Indexes ----------
CREATE INDEX IF NOT EXISTS idx_daily_attempts_uid ON daily_attempts(student_uid);
CREATE INDEX IF NOT EXISTS idx_daily_attempts_date ON daily_attempts(date);
CREATE INDEX IF NOT EXISTS idx_daily_attempts_school ON daily_attempts(school);
CREATE INDEX IF NOT EXISTS idx_daily_attempts_session_id ON daily_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school);
CREATE INDEX IF NOT EXISTS idx_students_total_score ON students(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created ON activity_feed(created_at DESC);

-- ---------- Activity feed trigger ----------
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

-- ---------- RLS helpers ----------
CREATE OR REPLACE FUNCTION is_school_email()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.jwt() ->> 'email') LIKE '%@gapp.hcc.edu.tw';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_email()
RETURNS TEXT AS $$
BEGIN
  RETURN auth.jwt() ->> 'email';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.jwt() ->> 'email' = 'hs5743@gapp.hcc.edu.tw';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- ---------- RLS ----------
ALTER TABLE student_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "校園帳號可查詢名冊" ON student_roster;
DROP POLICY IF EXISTS "管理者可查詢名冊" ON student_roster;
DROP POLICY IF EXISTS "Service role 完全存取名冊" ON student_roster;
CREATE POLICY "校園帳號可查詢名冊" ON student_roster FOR SELECT TO authenticated
  USING (is_school_email() AND email = current_user_email());
CREATE POLICY "管理者可查詢名冊" ON student_roster FOR SELECT TO authenticated
  USING (has_role(ARRAY['admin']));
CREATE POLICY "Service role 完全存取名冊" ON student_roster FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "使用者可查詢自己的角色" ON user_roles;
DROP POLICY IF EXISTS "Service role 完全存取角色" ON user_roles;
CREATE POLICY "使用者可查詢自己的角色" ON user_roles FOR SELECT TO authenticated
  USING (email = current_user_email() OR is_super_admin());
CREATE POLICY "Service role 完全存取角色" ON user_roles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "學生查看自己的檔案" ON students;
DROP POLICY IF EXISTS "學生更新自己的檔案" ON students;
DROP POLICY IF EXISTS "校園帳號可建立個人檔案" ON students;
DROP POLICY IF EXISTS "Service role 完全存取學生資料" ON students;
CREATE POLICY "學生查看自己的檔案" ON students FOR SELECT TO authenticated
  USING (auth.uid()::text = uid OR has_role(ARRAY['admin', 'teacher']));
CREATE POLICY "學生更新自己的檔案" ON students FOR UPDATE TO authenticated
  USING (auth.uid()::text = uid) WITH CHECK (auth.uid()::text = uid);
CREATE POLICY "校園帳號可建立個人檔案" ON students FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = uid AND is_school_email());
CREATE POLICY "Service role 完全存取學生資料" ON students FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "校園帳號可查詢場次" ON challenge_sessions;
DROP POLICY IF EXISTS "Service role 完全存取場次" ON challenge_sessions;
DROP POLICY IF EXISTS "教職員可建立場次" ON challenge_sessions;
DROP POLICY IF EXISTS "建立者或管理者可更新場次" ON challenge_sessions;
CREATE POLICY "校園帳號可查詢場次" ON challenge_sessions FOR SELECT TO authenticated
  USING (is_school_email() AND status = 'active');
CREATE POLICY "教職員可建立場次" ON challenge_sessions FOR INSERT TO authenticated
  WITH CHECK (is_school_email() AND has_role(ARRAY['admin', 'teacher']) AND teacher_uid = auth.uid()::text);
CREATE POLICY "建立者或管理者可更新場次" ON challenge_sessions FOR UPDATE TO authenticated
  USING (teacher_uid = auth.uid()::text OR has_role(ARRAY['admin']))
  WITH CHECK (teacher_uid = auth.uid()::text OR has_role(ARRAY['admin']));
CREATE POLICY "Service role 完全存取場次" ON challenge_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "教職員與學生可查看挑戰紀錄" ON daily_attempts;
DROP POLICY IF EXISTS "學生新增挑戰紀錄" ON daily_attempts;
DROP POLICY IF EXISTS "Service role 完全存取挑戰紀錄" ON daily_attempts;
CREATE POLICY "教職員與學生可查看挑戰紀錄" ON daily_attempts FOR SELECT TO authenticated
  USING (student_uid = auth.uid()::text OR has_role(ARRAY['admin', 'teacher']));
CREATE POLICY "學生新增挑戰紀錄" ON daily_attempts FOR INSERT TO authenticated
  WITH CHECK (student_uid = auth.uid()::text AND is_school_email());
CREATE POLICY "Service role 完全存取挑戰紀錄" ON daily_attempts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role 完全存取系統設定" ON system_config;
CREATE POLICY "Service role 完全存取系統設定" ON system_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "任何人可讀取活躍動態" ON activity_feed;
DROP POLICY IF EXISTS "Service role 寫入活躍動態" ON activity_feed;
CREATE POLICY "任何人可讀取活躍動態" ON activity_feed FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "Service role 寫入活躍動態" ON activity_feed FOR INSERT TO service_role
  WITH CHECK (true);

-- ---------- Leaderboard views ----------
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

GRANT SELECT ON school_leaderboard TO authenticated, anon;
GRANT SELECT ON student_leaderboard TO authenticated, anon;
