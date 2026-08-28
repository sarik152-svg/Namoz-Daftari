-- Two one-off corrections Sardor asked for on 2026-08-28.
--
-- 1. Shahriddin's record starts again from today. Everything logged before this was
--    entered while the scoring was still being changed under him — ish rejimi did not
--    exist yet — so it describes rules that no longer apply. His books and his travel
--    history are left alone; only what feeds the prayer score is cleared.
--
--    He is matched by name or login rather than a hard-coded id, because he was added
--    from the phone and the spelling could be Shahriddin or Shaxriddin. If nothing
--    matches, this migration quietly does nothing rather than touching the wrong
--    person — check the Reyting page after deploying.
CREATE TEMP TABLE _shax ON COMMIT DROP AS
SELECT id FROM members
 WHERE lower(id) LIKE 'sha%riddin%' OR lower(name) LIKE 'sha%riddin%';

DELETE FROM day_records WHERE member_id IN (SELECT id FROM _shax);
DELETE FROM bonuses     WHERE member_id IN (SELECT id FROM _shax);
DELETE FROM tasks       WHERE member_id IN (SELECT id FROM _shax);

-- Today: Bomdod on time, Peshin at the mosque. Written straight in rather than
-- through the API because the write-once rule is the app's, and this is a correction
-- to the record rather than a claim made through it.
INSERT INTO day_records (member_id, day, entries)
SELECT id, DATE '2026-08-28',
       '{"bomdod":{"s":"ontime"},"peshin":{"s":"ontime","j":true}}'::jsonb
  FROM _shax
ON CONFLICT (member_id, day)
DO UPDATE SET entries = EXCLUDED.entries, updated_at = now();

-- 2. Every duel is cleared so the first one counted under the new scoring starts
--    today. duel_members goes with them by cascade.
DELETE FROM duels;
