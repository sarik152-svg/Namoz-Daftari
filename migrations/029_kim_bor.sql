-- Read-only. 028 printed two different rows for the same day and prayer, one with
-- ayollar rejimi on and one with it off — which only happens if more than one member
-- row matches "munojat". If her marks are split across two accounts, one of them is
-- scoring her prayers without the mode, and no rule change would ever fix that.
--
-- So: who is actually in the members table, what modes they carry, and how many days
-- each has written down. The roster is Sardor's own; nothing here is changed.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT m.id, m.name, m.woman_mode, m.work_shift, m.is_child,
               (SELECT count(*) FROM day_records d WHERE d.member_id = m.id) AS kunlar,
               (SELECT max(d.day) FROM day_records d WHERE d.member_id = m.id) AS oxirgi
          FROM members m
         ORDER BY m.created_at
    LOOP
        RAISE NOTICE 'kim: % (%) ayol=% ish=% bola=% — % kun, oxirgisi %',
                     r.id, r.name, r.woman_mode, r.work_shift, r.is_child,
                     r.kunlar, r.oxirgi;
    END LOOP;
END $$;
