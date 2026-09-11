-- Read-only. The board says Behruz has finished two suras and Sardor wants to know
-- which. The sura is stored as a number, so the log prints the number and the day it
-- was finished; the names live in the page source and are put back when reporting.
--
-- His reading log goes with it: a sura marked finished with no reading behind it
-- would say the button was pressed without the ayahs being logged, which is worth
-- seeing while the feature is two days old.
DO $$
DECLARE r RECORD; topildi BOOLEAN := FALSE;
BEGIN
    FOR r IN
        SELECT d.member_id, d.sura, d.day
          FROM quran_done d
         ORDER BY d.member_id, d.sura
    LOOP
        topildi := TRUE;
        RAISE NOTICE 'tugatgan: % : %-sura, % kuni', r.member_id, r.sura, r.day;
    END LOOP;
    IF NOT topildi THEN
        RAISE NOTICE 'tugatgan: birorta ham tugatilgan sura yo''q';
    END IF;

    FOR r IN
        SELECT q.member_id, q.sura, max(q.ayah) AS eng, min(q.day) AS boshi,
               max(q.day) AS oxiri, count(*) AS yozuv
          FROM quran_reads q
         GROUP BY q.member_id, q.sura
         ORDER BY q.member_id, q.sura
    LOOP
        RAISE NOTICE 'oqigan: % : %-sura %-oyatgacha (% yozuv, % .. %)',
                     r.member_id, r.sura, r.eng, r.yozuv, r.boshi, r.oxiri;
    END LOOP;
END $$;
