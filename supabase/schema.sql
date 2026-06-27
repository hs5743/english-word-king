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
