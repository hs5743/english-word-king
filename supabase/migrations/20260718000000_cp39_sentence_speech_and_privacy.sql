-- CP39: remove single-word speech from new challenges without deleting legacy data.
-- Adds explicit full-sentence read-aloud metrics and privacy controls.

ALTER TABLE daily_attempts
  ADD COLUMN IF NOT EXISTS sentence_speech_success_count INT;

ALTER TABLE daily_attempts
  ADD COLUMN IF NOT EXISTS sentence_speech_bonus INT;

COMMENT ON COLUMN daily_attempts.sentence_speech_success_count IS
  'Number of optional approved example-sentence read-aloud bonuses completed in this attempt. NULL identifies legacy attempts.';

COMMENT ON COLUMN daily_attempts.sentence_speech_bonus IS
  'Optional example-sentence read-aloud bonus points awarded in this attempt. NULL identifies legacy attempts.';

ALTER TABLE challenge_sessions
  ADD COLUMN IF NOT EXISTS mask_scoreboard_names BOOLEAN DEFAULT TRUE NOT NULL;

COMMENT ON COLUMN challenge_sessions.mask_scoreboard_names IS
  'Whether the public live scoreboard masks student names. Administrators may change this during a contest.';

CREATE OR REPLACE FUNCTION mask_student_name(input_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  clean_name TEXT := btrim(input_name);
  name_length INT;
BEGIN
  name_length := char_length(clean_name);

  IF name_length <= 0 THEN
    RETURN '';
  ELSIF name_length = 1 THEN
    RETURN 'O';
  ELSIF name_length = 2 THEN
    RETURN left(clean_name, 1) || 'O';
  END IF;

  RETURN left(clean_name, 1)
    || repeat('O', name_length - 2)
    || right(clean_name, 1);
END;
$$;

COMMENT ON FUNCTION mask_student_name(TEXT) IS
  'Masks a student name for public display while preserving its first and last characters.';

CREATE OR REPLACE VIEW student_leaderboard AS
SELECT
  mask_student_name(s.name)::VARCHAR AS name,
  s.school,
  s.class,
  s.grade,
  s.total_score,
  s.streak,
  s.speech_stars,
  (
    SELECT COALESCE(COUNT(*), 0)
    FROM jsonb_each_text(s.mastery)
    WHERE value::int >= 2
  ) AS mastered_words,
  RANK() OVER (ORDER BY s.total_score DESC) AS rank
FROM students s
WHERE s.enabled = true
ORDER BY s.total_score DESC
LIMIT 50;

GRANT SELECT ON student_leaderboard TO authenticated, anon;

CREATE OR REPLACE FUNCTION create_activity_feed_from_attempt()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.practice = false THEN
    INSERT INTO activity_feed (student_name, school, grade, score, message)
    VALUES (
      mask_student_name(NEW.student_name),
      NEW.school,
      NEW.grade,
      NEW.score,
      '完成了 12 題挑戰，獲得了 ' || NEW.score || ' 分！'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Existing activity rows are public, so mask them once as part of this migration.
-- The masking function is idempotent for already-masked names.
UPDATE activity_feed
SET student_name = mask_student_name(student_name)
WHERE student_name IS NOT NULL;
