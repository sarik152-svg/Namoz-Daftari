-- Oilaviy dorilar: who takes what, at which hours, until when, and whether each
-- dose was actually swallowed on time.
--
-- The schedule and the doses are separate on purpose. A course is a plan — a name,
-- some hours of the day, a first and a last day — and it does not change when
-- somebody is late. A dose is what happened: the hour it was due and the hour it was
-- taken. On time or late is then a comparison rather than a stored verdict, so the
-- grace period can be argued about later without rewriting anybody's history.
CREATE TABLE IF NOT EXISTS medicines (
    id         BIGSERIAL   PRIMARY KEY,
    circle_id  BIGINT      NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    member_id  TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    times      TEXT[]      NOT NULL,
    starts     DATE        NOT NULL,
    ends       DATE        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT medicines_span CHECK (ends >= starts)
);

CREATE INDEX IF NOT EXISTS medicines_circle_idx ON medicines (circle_id);

-- One row per dose actually taken. A dose with no row is one still owed, or missed
-- once its day has closed — absence says that without a column for it.
CREATE TABLE IF NOT EXISTS medicine_doses (
    medicine_id BIGINT      NOT NULL REFERENCES medicines (id) ON DELETE CASCADE,
    day         DATE        NOT NULL,
    slot        TEXT        NOT NULL,
    taken       TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (medicine_id, day, slot)
);
