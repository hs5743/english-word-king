-- CP26：允許任何用戶讀取進行中的場次基本資訊
-- 用途：首頁大廳橫幅需要知道是否有對抗賽正在進行

-- 1. 新增場次類型欄位與約束 (預設為 class)
ALTER TABLE challenge_sessions ADD COLUMN IF NOT EXISTS session_type VARCHAR DEFAULT 'class' NOT NULL;
ALTER TABLE challenge_sessions DROP CONSTRAINT IF EXISTS chk_session_type;
ALTER TABLE challenge_sessions ADD CONSTRAINT chk_session_type CHECK (session_type IN ('class', 'contest'));

-- 2. 新增 RLS Policy 允許任何人 (含 anon) 讀取進行中的「校際對抗賽」基本資訊
DROP POLICY IF EXISTS "任何人可讀取進行中場次基本資訊" ON challenge_sessions;
CREATE POLICY "任何人可讀取進行中場次基本資訊"
  ON challenge_sessions FOR SELECT
  USING (status = 'active' AND expires_at > NOW() AND session_type = 'contest');
