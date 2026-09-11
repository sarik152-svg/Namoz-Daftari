-- Sardor is in Egypt, and the app was judging him by Tashkent's clock.
--
-- Cairo is two hours behind Tashkent (three in summer), so a Shom prayed on time in
-- Cairo arrived after Tashkent's Shom window had closed and was written down as a
-- qazo. Egypt was not in the city list, so he could not tell the app where he was.
-- The list now has it; this fixes what the wrong clock wrote down.
--
-- Two things happen here:
--   1. Qohira is added to his dated places, from today. Prayer times from today on
--      are Cairo's. Past days keep the city they were logged in, which is the whole
--      point of that list — so the days below are corrected by hand instead.
--   2. Three marks he says he prayed on time are set to `ontime`. They are his own
--      prayers, in his own record, and he asked for them by name: kecha peshin va
--      shom, bugun bomdod. The old value of each is printed first, so the log says
--      exactly what was changed and from what.
--
-- `s` alone is replaced, not the whole mark: `t` (the hour it was marked) and `j`
-- (prayed in congregation) belong to what happened and are not mine to erase.
DO $$
DECLARE
    r RECORD;
    eski TEXT;
    yangi JSONB;
BEGIN
    -- 1. Qohira, bugundan boshlab
    IF NOT EXISTS (SELECT 1 FROM members WHERE id = 'sardor') THEN
        RAISE NOTICE 'misr: sardor topilmadi, hech narsa qilinmadi';
        RETURN;
    END IF;

    DELETE FROM places
     WHERE member_id = 'sardor' AND place->>'d' = '2026-09-11';
    INSERT INTO places (member_id, place)
    VALUES ('sardor', jsonb_build_object(
        'd', '2026-09-11', 'city', 'Qohira',
        'lat', 30.0444, 'lng', 31.2357, 'tz', 2, 'asr', 2,
        'fa', 19.5, 'ia', 17.5));
    RAISE NOTICE 'misr: Qohira 2026-09-11 dan boshlab qo''shildi';

    -- 2. Uchta belgi: kecha peshin va shom, bugun bomdod
    FOR r IN
        SELECT * FROM (VALUES
            (DATE '2026-09-10', 'peshin'),
            (DATE '2026-09-10', 'shom'),
            (DATE '2026-09-11', 'bomdod')) AS v(kun, namoz)
    LOOP
        SELECT d.entries->r.namoz->>'s' INTO eski
          FROM day_records d
         WHERE d.member_id = 'sardor' AND d.day = r.kun;
        RAISE NOTICE 'misr: % % oldin -> %',
                     r.kun, r.namoz, coalesce(eski, '(belgi yo''q edi)');

        yangi := jsonb_build_object(r.namoz, jsonb_build_object('s', 'ontime'));
        INSERT INTO day_records (member_id, day, entries)
        VALUES ('sardor', r.kun, yangi)
        ON CONFLICT (member_id, day) DO UPDATE
           SET entries = jsonb_set(
                 day_records.entries, ARRAY[r.namoz],
                 coalesce(day_records.entries->r.namoz, '{}'::jsonb)
                   || jsonb_build_object('s', 'ontime')),
               updated_at = now();
    END LOOP;
END $$;
