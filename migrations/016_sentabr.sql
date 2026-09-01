-- Starting again on 1 September. August is to end with nobody having won it: with
-- no records left in that month, `oyGolibi` finds no activity and the month table
-- shows a dash rather than a name.
--
-- The date is taken per member from their own timezone rather than from the
-- server's. `CURRENT_DATE` is UTC, and between midnight and five in the morning in
-- Toshkent that is still yesterday — which is exactly the mistake 013 made, only
-- with a hard-coded date instead of a clock.
DELETE FROM day_records;
DELETE FROM tasks;
DELETE FROM bonuses;
DELETE FROM duels;
DELETE FROM jamoat_calls;

INSERT INTO day_records (member_id, day, entries)
SELECT m.id,
       ((now() AT TIME ZONE 'UTC') + make_interval(mins => (m.tz * 60)::int))::date,
       '{"bomdod":{"s":"ontime"}}'::jsonb
  FROM members m
ON CONFLICT (member_id, day)
DO UPDATE SET entries = EXCLUDED.entries, updated_at = now();

-- Books, their notes and reading logs stay, as do members.qazo_debt (33 970),
-- travel history and the family khatm — same call as last time.
