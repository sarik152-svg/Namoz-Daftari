-- Boshlang'ich ball: a starting balance for somebody who joins after the others.
--
-- Munojat starts tomorrow and would be a week behind through no fault of hers, which
-- is a discouraging first screen. The honest fix is an opening balance that says what
-- it is, rather than prayer marks she did not make — a record of worship must not be
-- written on somebody's behalf, and "Vaqtida: 25" would be exactly that.
--
-- `start_day` is which day it belongs to, so the balance counts once in the week,
-- month and year that contain it, and never again. Without the date it would be
-- added to every period for ever.
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS start_ball INTEGER NOT NULL DEFAULT 0
        CHECK (start_ball BETWEEN 0 AND 1000),
    ADD COLUMN IF NOT EXISTS start_day DATE;
