-- Four people leave the app, by name, at Sardor's request (2026-09-14):
-- Dilmurod Hudoyberganov, Behruz Rustamjonov, Maruf Mirjamolov, FARIDA VALIXANOVA.
--
-- Deleting a member cascades through every table they appear in, and this project
-- has no backup — so their records are copied into `ochirilgan_azolar` first. They
-- are gone from the app either way: nothing reads that table, no screen shows it,
-- no API returns it. It exists so that "delete the wrong Behruz" is a question I can
-- answer with the records rather than with an apology. There are two Behruzes here,
-- which is exactly the kind of mistake worth being able to undo.
--
-- Sardor can have the archive purged whenever he says so.
CREATE TABLE IF NOT EXISTS ochirilgan_azolar (
    id         TEXT        PRIMARY KEY,
    name       TEXT        NOT NULL,
    ochirilgan TIMESTAMPTZ NOT NULL DEFAULT now(),
    yozuv      JSONB       NOT NULL
);

DO $$
DECLARE
    kimlar TEXT[] := ARRAY['dilmurod', 'behruz2', 'maruf', 'farida'];
    r RECORD;
BEGIN
    FOR r IN SELECT id, name FROM members WHERE id = ANY(kimlar) LOOP
        RAISE NOTICE 'ochirish: % (%) arxivlanmoqda', r.id, r.name;
    END LOOP;

    INSERT INTO ochirilgan_azolar (id, name, yozuv)
    SELECT m.id, m.name, jsonb_build_object(
        'member', to_jsonb(m),
        'days', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'day', d.day, 'entries', d.entries)), '[]'::jsonb)
                   FROM day_records d WHERE d.member_id = m.id),
        'bonuses', (SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
                      FROM bonuses b WHERE b.member_id = m.id),
        'tasks', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                    FROM tasks t WHERE t.member_id = m.id),
        'books', (SELECT coalesce(jsonb_agg(bk.book), '[]'::jsonb)
                    FROM books bk WHERE bk.member_id = m.id),
        'places', (SELECT coalesce(jsonb_agg(p.place), '[]'::jsonb)
                     FROM places p WHERE p.member_id = m.id),
        'quran', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                    FROM quran_reads q WHERE q.member_id = m.id),
        'quran_done', (SELECT coalesce(jsonb_agg(to_jsonb(qd)), '[]'::jsonb)
                         FROM quran_done qd WHERE qd.member_id = m.id),
        'promises', (SELECT coalesce(jsonb_agg(to_jsonb(pr)), '[]'::jsonb)
                       FROM task_promises pr WHERE pr.member_id = m.id))
      FROM members m
     WHERE m.id = ANY(kimlar)
    ON CONFLICT (id) DO NOTHING;

    DELETE FROM members WHERE id = ANY(kimlar);

    FOR r IN SELECT id, name FROM ochirilgan_azolar LOOP
        RAISE NOTICE 'ochirilgan: % (%)', r.id, r.name;
    END LOOP;
    RAISE NOTICE 'ochirish: ilovada % ta a''zo qoldi', (SELECT count(*) FROM members);
END $$;
