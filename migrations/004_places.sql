-- Where each member is, over time.

-- The members table already carries a city, but it holds only the current one. A
-- member who prays Asr in Tashkent and flies to Dubai the same week needs each day
-- judged against the city they were actually in, otherwise changing the profile
-- silently rewrites the prayer times of every past day.
--
-- So the city becomes a dated list: an entry says "from this day onward, here".
-- The newest entry is the current city; `members.city` stays as the fallback for
-- anyone who has never moved, and as what the admin roster displays.
CREATE TABLE IF NOT EXISTS places (
    id         BIGSERIAL PRIMARY KEY,
    member_id  TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    place      JSONB       NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS places_member_idx ON places (member_id);
