-- Sardor reports four points of debt after the restart, which the data as I can
-- reason about it should not produce: every member has exactly one record, today's
-- Bomdod, and today is still open so nothing unmarked is charged for.
--
-- The likeliest way a day comes back from the dead is a phone flushing a queued
-- write for a day the server no longer has: `sendDay` read the local copy, which
-- `pull` had already replaced, and posted an empty record. An empty day that has
-- closed is five missed prayers. The client no longer sends empty days; this clears
-- whatever such a write may have left behind.
--
-- Only days before today go. This morning's real marks are people's own and are not
-- mine to delete — Bomdod has already come and gone in Toshkent.
DELETE FROM day_records WHERE day < CURRENT_DATE;

-- Nothing should be left in these after the restart, but the penance ledger is what
-- the ⚠ VAZIFA mark is read from, so it is cleared rather than assumed empty.
DELETE FROM tasks;
DELETE FROM bonuses;
