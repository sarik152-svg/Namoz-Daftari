-- Read-only. Sardor asked whether the new rule left an error on his wife's record.
--
-- 026 already ran for the whole circle, so hers was corrected on the same terms as
-- his: a `late` mark became `qazo` where the row was written before 05:00 local the
-- next day. What this asks is what is left, and — for anything still `late` — how
-- much later than the day itself it was written down, which is the one fact that
-- decides whether −1 is right under Sardor's own rule.
--
-- Her record matters more than most here: she is on ayollar rejimi, where a prayer
-- caught up in the day is +0.25 rather than −0.25. A `late` left on her record is
-- not a quarter point out, it is 1.25.
--
-- Nothing is changed. Names beyond hers are not printed: for the rest of the circle
-- only the fact that a mark is still `late` is reported, which is all that is needed
-- to say whether anybody else is waiting on the same question.
DO $$
DECLARE
    r RECORD;
    topildi BOOLEAN := FALSE;
BEGIN
    FOR r IN
        SELECT m.id, m.name, m.woman_mode, d.day, e.k AS namoz, e.v->>'s' AS holat
          FROM day_records d
          JOIN members m ON m.id = d.member_id
          CROSS JOIN LATERAL jsonb_each(d.entries) AS e(k, v)
         WHERE (lower(m.id) LIKE 'munojat%' OR lower(m.name) LIKE 'munojat%')
           AND d.day >= CURRENT_DATE - 14
           AND e.k IN ('bomdod', 'peshin', 'asr', 'shom', 'xufton')
         ORDER BY d.day, e.k
    LOOP
        topildi := TRUE;
        RAISE NOTICE 'munojat: % % -> % (ayol rejimi: %)',
                     r.day, r.namoz, r.holat, r.woman_mode;
    END LOOP;
    IF NOT topildi THEN
        RAISE NOTICE 'munojat: oxirgi 14 kunda namoz belgisi topilmadi';
    END IF;

    -- Anything still `late`, anywhere, with how long after the day it was written.
    FOR r IN
        SELECT d.member_id, d.day, e.k AS namoz,
               round(EXTRACT(EPOCH FROM (d.updated_at - (d.day + 1)::timestamptz)) / 3600)
                 AS soat
          FROM day_records d
          CROSS JOIN LATERAL jsonb_each(d.entries) AS e(k, v)
         WHERE e.k IN ('bomdod', 'peshin', 'asr', 'shom', 'xufton')
           AND e.v->>'s' = 'late'
         ORDER BY d.day
    LOOP
        RAISE NOTICE 'qolgan late: % % % — kundan % soat keyin yozilgan',
                     r.member_id, r.day, r.namoz, r.soat;
    END LOOP;
END $$;
