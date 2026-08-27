-- Duel: two people, or two pairs, comparing a week of prayer points.
--
-- Nothing about the result is stored. Who is on which side and when the week ran is
-- all the app needs; the score is worked out from the same records the ranking
-- already reads, the way badges are. A stored result would be a second copy of an
-- answer the records can always give, and copies drift.
--
-- `started` is NULL until every participant has confirmed. That is the whole state
-- machine: no row means no challenge, a NULL start means waiting, and a date means it
-- is running or finished depending on `ends`.
CREATE TABLE IF NOT EXISTS duels (
    id         BIGSERIAL   PRIMARY KEY,
    circle_id  BIGINT      NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    size       SMALLINT    NOT NULL CHECK (size IN (1, 2)),
    created_by TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    started    DATE,
    ends       DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT duels_dates CHECK ((started IS NULL) = (ends IS NULL))
);

CREATE INDEX IF NOT EXISTS duels_circle_idx ON duels (circle_id);

CREATE TABLE IF NOT EXISTS duel_members (
    duel_id   BIGINT   NOT NULL REFERENCES duels (id) ON DELETE CASCADE,
    member_id TEXT     NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    side      SMALLINT NOT NULL CHECK (side IN (1, 2)),
    confirmed BOOLEAN  NOT NULL DEFAULT false,
    PRIMARY KEY (duel_id, member_id)
);

CREATE INDEX IF NOT EXISTS duel_members_member_idx ON duel_members (member_id);
