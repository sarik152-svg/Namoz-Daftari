-- Taking back a word nobody could have kept.
--
-- The tasbih counter stopped at 500 while the second and third steps of the penance
-- ask for 1000 and 2000. So "Bajardim" never lit up, and those tasks could not be
-- closed at all. Three people had promised a day for such a task, the day passed
-- with the task still open, and the app put ALDOQCHI beside their names — for
-- failing to do something the app itself made impossible. Sardor found it on his own
-- record; the other two had it done to them without knowing why.
--
-- The counter is fixed in the same deploy. This clears the promise for the steps
-- that were impossible, so the question is simply asked again now that the answer
-- can be acted on.
--
-- What is NOT touched:
--   * the debt and the task itself — the penance is still owed, and still shows as
--     VAZIFA. Only the broken word goes.
--   * a promise at the first step (500 tasbih), which was always completable, so a
--     day that passed there is a real one.
--   * "hech qachon" (promised IS NULL) — an honest refusal, never a lie, and not
--     mine to erase.
DO $$
DECLARE r RECORD; n INT := 0;
BEGIN
    FOR r IN
        SELECT member_id, oy, lvl, promised FROM task_promises
         WHERE lvl >= 2 AND promised IS NOT NULL AND promised < CURRENT_DATE
    LOOP
        RAISE NOTICE 'aldoqchi emas: % (% oyi, %-pogona, % kuniga aytilgan) — va''da olib tashlandi',
                     r.member_id, r.oy, r.lvl, r.promised;
        n := n + 1;
    END LOOP;

    DELETE FROM task_promises
     WHERE lvl >= 2 AND promised IS NOT NULL AND promised < CURRENT_DATE;

    RAISE NOTICE 'aldoqchi emas: % ta va''da olib tashlandi', n;
END $$;
