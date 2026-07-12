-- CP37: separate the public contest title from grade/class metadata.
ALTER TABLE challenge_sessions
  ADD COLUMN IF NOT EXISTS session_title VARCHAR DEFAULT '' NOT NULL;

COMMENT ON COLUMN challenge_sessions.session_title IS
  'Public display title for class or contest sessions; does not restrict participation or difficulty.';
