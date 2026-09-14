-- Read-only. Sardor says the chip read ALDOQCHI on a task he had not answered for
-- yet — "men hali bosmagan edim, endi vazifa berildiku".
--
-- The chip turns red when a promise exists for that month at a level at or above
-- the task's, and its day has passed. So the question is what promises are on his
-- row, for which month and level, and which penances he has already completed —
-- the answer is one of: an old promise this month being reused for a new, higher
-- task, or a promise he made and forgot. The record says which; I will not guess.
DO $$
DECLARE r RECORD; topildi BOOLEAN := FALSE;
BEGIN
    FOR r IN
        SELECT p.member_id, p.oy, p.lvl, p.promised, p.made_at
          FROM task_promises p
         ORDER BY p.member_id, p.oy, p.lvl
    LOOP
        topildi := TRUE;
        RAISE NOTICE 'vada: % : % oyi, %-pogona -> % (aytilgan vaqti %)',
                     r.member_id, r.oy, r.lvl,
                     coalesce(r.promised::text, 'hech qachon'), r.made_at;
    END LOOP;
    IF NOT topildi THEN
        RAISE NOTICE 'vada: birorta ham va''da yo''q';
    END IF;

    FOR r IN
        SELECT t.member_id, t.day, t.rakats, t.tasbih
          FROM tasks t
         ORDER BY t.member_id, t.day
    LOOP
        RAISE NOTICE 'bajarilgan vazifa: % : % kuni, % rakat / % tasbeh',
                     r.member_id, r.day, r.rakats, r.tasbih;
    END LOOP;
END $$;
