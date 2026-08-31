-- Fixing 013, which seeded Bomdod on a hard-coded 2026-08-28 when the day had in
-- fact turned to the 31st. The effect was the opposite of a clean start: the 28th
-- became each member's first recorded day, so the 29th and the 30th closed with
-- nothing marked and every one of them woke up owing fourteen points and carrying
-- the largest penance task.
--
-- The date is taken from the database this time rather than written down. A literal
-- date in a migration is only correct on the day it is written, and migrations are
-- applied whenever the next deploy happens.
DELETE FROM day_records;

INSERT INTO day_records (member_id, day, entries)
SELECT id, CURRENT_DATE, '{"bomdod":{"s":"ontime"}}'::jsonb
  FROM members
ON CONFLICT (member_id, day)
DO UPDATE SET entries = EXCLUDED.entries, updated_at = now();
