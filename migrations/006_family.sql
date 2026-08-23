-- Family features: children, praying together at home, and a shared khatm.

-- A child keeps a record like everyone else but is never in debt. The adult system
-- — penalty rakats, mounting arrears — frightens a seven-year-old off the app
-- entirely, which costs more than any accounting it buys. The flag lives on the
-- member, not on the membership: a child is a child in every circle they are in.
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_child BOOLEAN NOT NULL DEFAULT false;

-- "We are praying this one together." One call per prayer per day per circle, so a
-- second person tapping it joins the existing call instead of starting a rival one.
--
-- Joining is not recorded here. Each person marks their own prayer through the
-- ordinary write, which keeps both standing rules intact: nobody marks for anybody
-- else, and a mark cannot be changed once made.
CREATE TABLE IF NOT EXISTS jamoat_calls (
    id         BIGSERIAL   PRIMARY KEY,
    circle_id  BIGINT      NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    day        DATE        NOT NULL,
    prayer     TEXT        NOT NULL,
    caller_id  TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (circle_id, day, prayer)
);

CREATE INDEX IF NOT EXISTS jamoat_calls_circle_day_idx ON jamoat_calls (circle_id, day);

-- Thirty juz, read between a family. One khatm is open at a time per circle.
CREATE TABLE IF NOT EXISTS khatms (
    id         BIGSERIAL   PRIMARY KEY,
    circle_id  BIGINT      NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    started    DATE        NOT NULL,
    finished   DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS khatms_circle_idx ON khatms (circle_id);

-- A row exists only once somebody has taken that juz, so "free" needs no bookkeeping:
-- it is any number from 1 to 30 with no row. ON DELETE SET NULL rather than CASCADE
-- because a juz already read stays read even if the reader later leaves.
CREATE TABLE IF NOT EXISTS khatm_juz (
    khatm_id  BIGINT   NOT NULL REFERENCES khatms (id) ON DELETE CASCADE,
    juz       SMALLINT NOT NULL CHECK (juz BETWEEN 1 AND 30),
    member_id TEXT     REFERENCES members (id) ON DELETE SET NULL,
    done_at   TIMESTAMPTZ,
    taken_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (khatm_id, juz)
);
