-- Checkpoint A: fixed class challenge packages and per-question results.

CREATE TABLE IF NOT EXISTS challenge_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES challenge_sessions(id) ON DELETE CASCADE NOT NULL,
  session_code    VARCHAR NOT NULL,
  teacher_uid     VARCHAR NOT NULL,
  teacher_config  JSONB DEFAULT '{}'::jsonb NOT NULL,
  challenge_data  JSONB DEFAULT '[]'::jsonb NOT NULL,
  status          VARCHAR DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'closed', 'expired')),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at      TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_challenge_packages_session_id
  ON challenge_packages(session_id);
CREATE INDEX IF NOT EXISTS idx_challenge_packages_code_active
  ON challenge_packages(session_code, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS challenge_question_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    VARCHAR REFERENCES daily_attempts(id) ON DELETE CASCADE NOT NULL,
  session_id    UUID REFERENCES challenge_sessions(id) ON DELETE CASCADE NOT NULL,
  session_code  VARCHAR NOT NULL,
  student_uid   VARCHAR REFERENCES students(uid) ON DELETE CASCADE NOT NULL,
  question_id   VARCHAR NOT NULL,
  question_order INT NOT NULL,
  question_type VARCHAR NOT NULL,
  word          VARCHAR NOT NULL,
  topic         VARCHAR,
  is_correct    BOOLEAN NOT NULL,
  score         INT,
  answered_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_challenge_question_results_once
  ON challenge_question_results(attempt_id, question_id);
CREATE INDEX IF NOT EXISTS idx_challenge_question_results_session
  ON challenge_question_results(session_id, question_id);
CREATE INDEX IF NOT EXISTS idx_challenge_question_results_student
  ON challenge_question_results(student_uid, answered_at DESC);

ALTER TABLE challenge_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_question_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "校園帳號可查詢有效題目包" ON challenge_packages;
DROP POLICY IF EXISTS "教職員可管理自己的題目包" ON challenge_packages;
DROP POLICY IF EXISTS "Service role 完全存取題目包" ON challenge_packages;
CREATE POLICY "校園帳號可查詢有效題目包" ON challenge_packages FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND expires_at > NOW()
    AND EXISTS (
      SELECT 1 FROM challenge_sessions s
      WHERE s.id = challenge_packages.session_id
        AND s.status = 'active'
        AND s.expires_at > NOW()
    )
  );
CREATE POLICY "教職員可管理自己的題目包" ON challenge_packages FOR ALL TO authenticated
  USING (teacher_uid = auth.uid()::text OR has_role(ARRAY['admin']))
  WITH CHECK (teacher_uid = auth.uid()::text OR has_role(ARRAY['admin']));
CREATE POLICY "Service role 完全存取題目包" ON challenge_packages FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "教職員與學生可查看逐題結果" ON challenge_question_results;
DROP POLICY IF EXISTS "學生新增自己的逐題結果" ON challenge_question_results;
DROP POLICY IF EXISTS "Service role 完全存取逐題結果" ON challenge_question_results;
CREATE POLICY "教職員與學生可查看逐題結果" ON challenge_question_results FOR SELECT TO authenticated
  USING (
    student_uid = auth.uid()::text
    OR has_role(ARRAY['admin', 'teacher'])
  );
CREATE POLICY "學生新增自己的逐題結果" ON challenge_question_results FOR INSERT TO authenticated
  WITH CHECK (student_uid = auth.uid()::text AND is_school_email());
CREATE POLICY "Service role 完全存取逐題結果" ON challenge_question_results FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
