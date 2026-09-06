-- Applying the Fajr window backwards, for the people it belongs to.
--
-- Until today, a work-shift member who prayed Peshin, Asr and Shom when he got home
-- and marked them after midnight had them written down as `late` — a full point each
-- against him. Under the rule as it now stands those marks would have landed on the
-- day they belong to and counted as prayed on time. The rule changed; the record
-- should say what the rule now says.
--
-- Only `late` marks are touched, and only on the three prayers the shift covers.
-- A `missed` mark is the member saying, with his own thumb, that he did not pray it,
-- and no rule change makes that something else. A prayer with no mark at all is left
-- alone for the same reason: there is nothing there to correct, and writing one in
-- would be recording a prayer nobody said they made.
UPDATE day_records d
   SET entries = (
         SELECT jsonb_object_agg(k, CASE
                  WHEN k IN ('peshin', 'asr', 'shom') AND v->>'s' = 'late'
                  THEN jsonb_set(v, '{s}', '"qazo"')
                  ELSE v END)
           FROM jsonb_each(d.entries) AS e(k, v)),
       updated_at = now()
 WHERE d.member_id IN (SELECT id FROM members WHERE work_shift)
   AND EXISTS (
         SELECT 1 FROM jsonb_each(d.entries) AS e(k, v)
          WHERE k IN ('peshin', 'asr', 'shom') AND v->>'s' = 'late');
