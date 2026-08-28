-- Ayollar rejimi: a prayer said the same day, after its window, is not a penalty.
--
-- Praying on time scores exactly as it does for anybody, and a day allowed to close
-- with the prayer unsaid costs the same full point as it does for anybody. The one
-- difference sits in between: catching up later the same day earns a quarter point
-- instead of costing one. It is a smaller concession than ish rejimi, which counts
-- those prayers as though they were on time — this one keeps them what they are and
-- only stops them being a debt.
--
-- Set by the circle owner, like is_child and work_shift.
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS woman_mode BOOLEAN NOT NULL DEFAULT false;
