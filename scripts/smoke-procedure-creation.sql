-- Smoke test for the F2.5 schema extensions on procedures, quizzes,
-- and quiz_attempts. No service layer here — this confirms the DB
-- accepts what the new createProcedure API will write.
--
-- Usage (from repo root):
--   cd lms-backend
--   psql "$DATABASE_URL" -f scripts/smoke-procedure-creation.sql
--
-- Idempotent: re-running wipes the test rows it inserted by slug.

BEGIN;

-- 1. Insert a quiz row.
INSERT INTO quizzes (id, questions, attached, passing_score)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '[{"id":"q1","text":{"en":"Hot holding temp?","es":"Temp de mantenimiento?"},"choices":[{"id":"a","text":{"en":">=140F","es":">=60C"}},{"id":"b","text":{"en":">=135F","es":">=57C"}}],"correctChoiceId":"a"}]'::jsonb,
  true,
  80
)
ON CONFLICT (id) DO UPDATE SET attached = EXCLUDED.attached;

-- 2. Insert a procedure linked to the quiz (training mode, linked to a
--    stage-3 training course id that doesn't exist yet — fine, no FK).
INSERT INTO procedures (
  id, slug,
  title_en, title_es,
  purpose_en, purpose_es,
  category_id, status,
  blocks_en, blocks_es,
  created_by,
  quiz_id, linked_training_id, quiz_mode
)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  'smoke-f2-5-procedure',
  'Smoke SOP',          'SOP de prueba',
  'Test purpose.',      'Proposito de prueba.',
  NULL,                 -- categoryId: standalone
  'published',
  '{"blocks":[]}'::jsonb,
  '{"blocks":[]}'::jsonb,
  -- Any existing employee id — pick the first one so the FK holds.
  (SELECT id FROM employees ORDER BY created_at LIMIT 1),
  '00000000-0000-0000-0000-000000000001',  -- quizId
  'course-orientation-101',                -- linkedTrainingId (no FK yet)
  'training'
)
ON CONFLICT (id) DO UPDATE SET
  quiz_id = EXCLUDED.quiz_id,
  linked_training_id = EXCLUDED.linked_training_id,
  quiz_mode = EXCLUDED.quiz_mode;

-- 3. Insert a quiz attempt for that quiz by a real employee.
INSERT INTO quiz_attempts (
  id, quiz_id, employee_id, score, passed, answers
)
VALUES (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM employees ORDER BY created_at LIMIT 1),
  92,
  true,
  '{"q1":"a"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 4. Read-back the procedure to confirm the join lands and columns
--    populate. quiz_mode is text — verify the value came back as
--    'training' (not the default 'training' string applied at insert).
SELECT
  p.id,
  p.slug,
  p.status,
  p.quiz_id,
  p.linked_training_id,
  p.quiz_mode
FROM procedures p
WHERE p.id = '00000000-0000-0000-0000-000000000010';

-- 5. Read-back the quiz with its attempt count to confirm the 2-table
--    model joins cleanly.
SELECT
  q.id AS quiz_id,
  q.attached,
  q.passing_score,
  COUNT(qa.id) AS attempt_count,
  COUNT(qa.id) FILTER (WHERE qa.passed) AS pass_count
FROM quizzes q
LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
WHERE q.id = '00000000-0000-0000-0000-000000000001'
GROUP BY q.id, q.attached, q.passing_score;

-- 6. Negative test: a procedure pointing at an unknown quiz id should
--    NOT silently insert — the FK with ON DELETE SET NULL will accept
--    the insert, but the value will be... actually with our schema, the
--    FK is `references quizzes(id) ON DELETE SET NULL` — so an unknown
--    quiz_id WOULD be rejected by the FK at insert time. Confirm:
DO $$
DECLARE
  err_caught boolean := false;
BEGIN
  BEGIN
    INSERT INTO procedures (
      id, slug,
      title_en, title_es,
      purpose_en, purpose_es,
      category_id, status,
      blocks_en, blocks_es,
      created_by,
      quiz_id, linked_training_id, quiz_mode
    ) VALUES (
      '00000000-0000-0000-0000-000000000099',
      'smoke-f2-5-bad-quiz',
      'Bad',          'Malo',
      'x',            'x',
      NULL, 'draft',
      '{"blocks":[]}'::jsonb, '{"blocks":[]}'::jsonb,
      (SELECT id FROM employees ORDER BY created_at LIMIT 1),
      '11111111-1111-1111-1111-111111111111',  -- unknown quiz
      NULL, 'training'
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      err_caught := true;
      RAISE NOTICE 'OK: unknown quiz_id rejected by FK -> %', SQLERRM;
  END;

  IF NOT err_caught THEN
    RAISE EXCEPTION 'FAIL: insert with unknown quiz_id should have been rejected';
  END IF;
END $$;

-- 7. Negative test: a quiz attempt pointing at an unknown quiz should
--    also be rejected (the FK has ON DELETE CASCADE, so unknown = reject).
DO $$
DECLARE
  err_caught boolean := false;
BEGIN
  BEGIN
    INSERT INTO quiz_attempts (id, quiz_id, employee_id, score, passed, answers)
    VALUES (
      '00000000-0000-0000-0000-000000000098',
      '11111111-1111-1111-1111-111111111111',
      (SELECT id FROM employees ORDER BY created_at LIMIT 1),
      50, false, '{}'::jsonb
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      err_caught := true;
      RAISE NOTICE 'OK: unknown quiz_id on attempt rejected by FK -> %', SQLERRM;
  END;

  IF NOT err_caught THEN
    RAISE EXCEPTION 'FAIL: attempt with unknown quiz_id should have been rejected';
  END IF;
END $$;

ROLLBACK;

-- ROLLBACK so the smoke rows don't pollute the DB. Comment out and use
-- COMMIT once you're happy with the read-back output above.
