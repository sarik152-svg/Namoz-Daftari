-- Read-only. Sardor asked whether his Shom was actually corrected, and 026 could
-- not answer: asyncpg drops a NOTICE unless something is listening, so the counts
-- it raised went nowhere. The listener exists now (app/db.py), so this migration
-- asks the question again and says the answer out loud. It changes nothing.
--
-- Only Sardor's own last week is printed. The rest of the circle's prayers are not
-- mine to put in a deploy log to settle one man's question about his own record.
DO $$
DECLARE
    r RECORD;
    topildi BOOLEAN := FALSE;
    qoldi INT;
BEGIN
    FOR r IN
        SELECT d.day, e.k AS namoz, e.v->>'s' AS holat
          FROM day_records d
          JOIN members m ON m.id = d.member_id
          CROSS JOIN LATERAL jsonb_each(d.entries) AS e(k, v)
         WHERE (lower(m.id) LIKE 'sardor%' OR lower(m.name) LIKE 'sardor%')
           AND d.day >= CURRENT_DATE - 7
           AND e.k IN ('bomdod', 'peshin', 'asr', 'shom', 'xufton')
         ORDER BY d.day, e.k
    LOOP
        topildi := TRUE;
        RAISE NOTICE 'tekshiruv: % % -> %', r.day, r.namoz, r.holat;
    END LOOP;

    IF NOT topildi THEN
        RAISE NOTICE 'tekshiruv: oxirgi 7 kunda Sardorning namoz belgisi topilmadi';
    END IF;

    SELECT count(*) INTO qoldi
      FROM day_records d
     WHERE EXISTS (
           SELECT 1 FROM jsonb_each(d.entries) AS e(k, v)
            WHERE k IN ('bomdod', 'peshin', 'asr', 'shom', 'xufton')
              AND v->>'s' = 'late');
    RAISE NOTICE 'tekshiruv: butun doirada % ta kunda hali late belgisi bor', qoldi;
END $$;
