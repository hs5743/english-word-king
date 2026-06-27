-- 升級學生排行榜 View，加入 mastered_words 欄位以便在大廳排行榜上展示學生適性化寶石等級
CREATE OR REPLACE VIEW student_leaderboard AS
SELECT
  s.name,
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

-- 重新賦予大廳公開 SELECT 權限
GRANT SELECT ON student_leaderboard TO authenticated, anon;
