-- Haftalik KPI va bonus.
--
-- The targets sit on the member and the money on the circle. A mother at home and a
-- father on a shift cannot be held to the same number, so each person has their own
-- three thresholds; the amounts are the family's one budget, so they are agreed once
-- for the whole circle rather than negotiated per person.
--
-- Zero means "no KPI for this person" rather than "a target of nothing", which is why
-- the default is zero and not one of the thresholds.
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS kpi_easy INTEGER NOT NULL DEFAULT 0 CHECK (kpi_easy >= 0),
    ADD COLUMN IF NOT EXISTS kpi_mid  INTEGER NOT NULL DEFAULT 0 CHECK (kpi_mid  >= 0),
    ADD COLUMN IF NOT EXISTS kpi_hard INTEGER NOT NULL DEFAULT 0 CHECK (kpi_hard >= 0);

ALTER TABLE circles
    ADD COLUMN IF NOT EXISTS bonus_easy INTEGER NOT NULL DEFAULT 20 CHECK (bonus_easy >= 0),
    ADD COLUMN IF NOT EXISTS bonus_mid  INTEGER NOT NULL DEFAULT 50 CHECK (bonus_mid  >= 0),
    ADD COLUMN IF NOT EXISTS bonus_hard INTEGER NOT NULL DEFAULT 100 CHECK (bonus_hard >= 0);
