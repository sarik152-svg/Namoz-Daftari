-- Kun yarim tunda emas, keyingi bomdodda yopiladi — applied backwards.
--
-- Sardor prayed his Shom late in the evening, marked it after midnight, and the app
-- wrote `late` — a whole point against him. From today the day runs to the next
-- Fajr for every prayer, so that mark would now land on the day it belongs to and
-- count as `qazo`, a quarter point. The rule changed; the record should say what
-- the rule now says.
--
-- What is NOT touched, and why:
--   * `missed` — the member said with his own thumb that he did not pray it.
--   * a prayer with no mark at all — there is nothing there to correct, and writing
--     one in would be recording a prayer nobody said they made.
--   * a `late` mark written down days afterwards. This is the careful part: `late`
--     carries no time of its own (`t` is null), so the only evidence of *when* it
--     was written is the row's `updated_at`. Only rows last written before 05:00
--     local on the following day are converted — that is the night the new rule
--     forgives. 05:00 is a deliberately early stand-in for Fajr: it converts fewer
--     marks than the real rule would, and leaving a penalty in place is the only
--     safe direction when the evidence is this thin.
--
-- The two notices bracket the update so the deploy log says how many marks were
-- found and how many were deliberately left alone.
DO $$
DECLARE bor INT;
BEGIN
    SELECT count(*) INTO bor FROM day_records d
     WHERE EXISTS (
           SELECT 1 FROM jsonb_each(d.entries) AS e(k, v)
            WHERE k IN ('bomdod', 'peshin', 'asr', 'shom', 'xufton')
              AND v->>'s' = 'late');
    RAISE NOTICE 'bomdodgacha: boshida % ta kunda late belgisi bor edi', bor;
END $$;

UPDATE day_records d
   SET entries = (
         SELECT jsonb_object_agg(k, CASE
                  WHEN k IN ('bomdod', 'peshin', 'asr', 'shom', 'xufton')
                       AND v->>'s' = 'late'
                  THEN jsonb_set(v, '{s}', '"qazo"')
                  ELSE v END)
           FROM jsonb_each(d.entries) AS e(k, v))
  FROM members m
 WHERE m.id = d.member_id
   AND d.updated_at < (((d.day + 1)::timestamp + interval '5 hours'
                        - make_interval(mins => (m.tz * 60)::int)) AT TIME ZONE 'UTC')
   AND EXISTS (
         SELECT 1 FROM jsonb_each(d.entries) AS e(k, v)
          WHERE k IN ('bomdod', 'peshin', 'asr', 'shom', 'xufton')
            AND v->>'s' = 'late');

DO $$
DECLARE qoldi INT;
BEGIN
    SELECT count(*) INTO qoldi FROM day_records d
     WHERE EXISTS (
           SELECT 1 FROM jsonb_each(d.entries) AS e(k, v)
            WHERE k IN ('bomdod', 'peshin', 'asr', 'shom', 'xufton')
              AND v->>'s' = 'late');
    RAISE NOTICE 'bomdodgacha: % ta kunda late qoldi (keyin belgilangani)', qoldi;
END $$;
