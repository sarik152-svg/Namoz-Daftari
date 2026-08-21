-- Kitob daftari: what each member is reading, and the notes they take from it.

-- A book carries its own reading log and its own notes, both of which grow a few
-- entries at a time and are only ever read as a whole. That makes one JSONB
-- document per book the honest shape, the same call the day_records table makes.
-- The client owns the list outright, so it is replaced wholesale like the bonus
-- and task ledgers rather than merged row by row.
CREATE TABLE IF NOT EXISTS books (
    id         BIGSERIAL PRIMARY KEY,
    member_id  TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    book       JSONB       NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS books_member_idx ON books (member_id);
