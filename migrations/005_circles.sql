-- Circles: who can see whom.
--
-- Personal records stay attached to the member, exactly where they are. A circle
-- only answers "who is shown together", which is why a person can be in a friends
-- circle and a family at once while marking a prayer once.

CREATE TABLE IF NOT EXISTS circles (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL,
    kind       TEXT        NOT NULL CHECK (kind IN ('friends', 'family')),
    owner_id   TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    week_goal  INTEGER     NOT NULL DEFAULT 25 CHECK (week_goal BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS circle_members (
    circle_id BIGINT      NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    member_id TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (circle_id, member_id)
);

CREATE INDEX IF NOT EXISTS circle_members_member_idx ON circle_members (member_id);

-- Backfill: the people already using the app become one friends circle, owned by
-- whoever joined first. On a database with no members yet this inserts nothing and
-- seeding creates the circle instead (see repository.seed_members_if_empty).
INSERT INTO circles (name, kind, owner_id)
SELECT 'Do''stlar', 'friends', id FROM members ORDER BY created_at LIMIT 1;

INSERT INTO circle_members (circle_id, member_id)
SELECT c.id, m.id FROM circles c CROSS JOIN members m
WHERE c.kind = 'friends'
ON CONFLICT DO NOTHING;
