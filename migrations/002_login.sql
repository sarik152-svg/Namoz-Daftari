-- Per-person login: encrypted PINs, sessions, and a throttle that survives restarts.

-- PINs move from one-way hashes to encrypted-at-rest, because the admin panel
-- displays them. pin_hash is dropped: keeping a stale credential column invites
-- someone later authenticating against the wrong one.
ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_encrypted TEXT NOT NULL DEFAULT '';
ALTER TABLE members DROP COLUMN IF EXISTS pin_hash;

CREATE TABLE IF NOT EXISTS sessions (
    token        TEXT PRIMARY KEY,
    member_id    TEXT        REFERENCES members (id) ON DELETE CASCADE,
    is_admin     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    -- A session belongs to a member or is an admin session, never neither.
    CONSTRAINT sessions_subject CHECK (member_id IS NOT NULL OR is_admin)
);

CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- A four-digit PIN is 10,000 guesses. An in-memory counter resets on every deploy,
-- which hands an attacker a fresh budget for free, so failures live in Postgres.
CREATE TABLE IF NOT EXISTS pin_attempts (
    subject           TEXT PRIMARY KEY,
    failures          INTEGER     NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
