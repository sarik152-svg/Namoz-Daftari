-- Starting over, 2026-08-28. Sardor's call: the scoring changed under everybody
-- several times this week — tahajjud went from a quarter point to one and a half, the
-- debt stopped being payable, two concessions appeared — so the numbers on the board
-- describe rules that no longer exist. Rather than explain a history nobody can read,
-- the group starts from today.
--
-- What goes: every prayer mark, the make-up counts and Qur'an ticks that live in the
-- same rows, the completed penance tasks, the old streak rewards (dead since the debt
-- stopped being payable), the duels and the calls to pray together.
DELETE FROM day_records;
DELETE FROM bonuses;
DELETE FROM tasks;
DELETE FROM duels;
DELETE FROM jamoat_calls;

-- What stays, deliberately:
--   * books, their reading logs and notes — a book that was read was read, and those
--     are not a score anybody is restarting;
--   * members.qazo_debt (33 970) — that is an estimate of a real backlog, not a
--     figure on a scoreboard, so only "how many are done" goes back to zero;
--   * places — where somebody was on a given day is history, not points;
--   * khatms — a family's shared Qur'an reading belongs to the family.

-- Today, for everybody: Bomdod prayed on time. The rest of today is theirs to mark,
-- and nothing is charged for an open day.
INSERT INTO day_records (member_id, day, entries)
SELECT id, DATE '2026-08-28', '{"bomdod":{"s":"ontime"}}'::jsonb
  FROM members
ON CONFLICT (member_id, day)
DO UPDATE SET entries = EXCLUDED.entries, updated_at = now();
