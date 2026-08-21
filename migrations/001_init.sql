-- Namoz Daftari: shared group storage.
-- One row per member, one row per member-day, and append-only reward/task ledgers.

CREATE TABLE IF NOT EXISTS members (
    id         TEXT PRIMARY KEY,
    name       TEXT             NOT NULL,
    city       TEXT             NOT NULL,
    lat        DOUBLE PRECISION NOT NULL,
    lng        DOUBLE PRECISION NOT NULL,
    tz         DOUBLE PRECISION NOT NULL,
    asr        SMALLINT         NOT NULL CHECK (asr IN (1, 2)),
    fa         DOUBLE PRECISION NOT NULL,
    ia         DOUBLE PRECISION NOT NULL,
    pin_hash   TEXT             NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- The day is the unit of change: marking Asr rewrites one row, not the member's
-- whole history, so two phones editing different days cannot clobber each other.
CREATE TABLE IF NOT EXISTS day_records (
    member_id  TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    day        DATE        NOT NULL,
    entries    JSONB       NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (member_id, day)
);

CREATE INDEX IF NOT EXISTS day_records_day_idx ON day_records (day);

CREATE TABLE IF NOT EXISTS bonuses (
    id         BIGSERIAL PRIMARY KEY,
    member_id  TEXT          NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    prayer     TEXT          NOT NULL,
    lvl        INTEGER       NOT NULL,
    amt        NUMERIC(8, 2) NOT NULL,
    day        DATE          NOT NULL,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bonuses_member_idx ON bonuses (member_id);

CREATE TABLE IF NOT EXISTS tasks (
    id         BIGSERIAL PRIMARY KEY,
    member_id  TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    day        DATE        NOT NULL,
    rakats     INTEGER     NOT NULL,
    tasbih     INTEGER     NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_member_idx ON tasks (member_id);
