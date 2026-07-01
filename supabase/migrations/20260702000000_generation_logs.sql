-- ---------- 2026-07-02 generation_logs table for tracking performance ----------
CREATE TABLE IF NOT EXISTS generation_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_uid        VARCHAR,
  session_id         UUID,
  session_code       VARCHAR(100),
  mode               VARCHAR NOT NULL, -- 'daily' | 'practice' | 'class' | 'custom'
  total_duration_ms  INT NOT NULL,
  api_calls_count    INT NOT NULL,
  success_source     VARCHAR NOT NULL, -- 'gemini_primary' | 'gemini_backup' | 'groq' | 'fallback' | 'error'
  questions_count    INT NOT NULL,
  steps              JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE generation_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own logs
DROP POLICY IF EXISTS "Authenticated users insert generation logs" ON generation_logs;
CREATE POLICY "Authenticated users insert generation logs" ON generation_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow admin/teacher to select logs
DROP POLICY IF EXISTS "Admin and teacher can query generation logs" ON generation_logs;
CREATE POLICY "Admin and teacher can query generation logs" ON generation_logs FOR SELECT TO authenticated
  USING (has_role(ARRAY['admin', 'teacher']));

-- Allow service role full access
DROP POLICY IF EXISTS "Service role full access on generation logs" ON generation_logs;
CREATE POLICY "Service role full access on generation logs" ON generation_logs FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
