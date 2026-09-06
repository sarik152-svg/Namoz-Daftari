-- Bolalar bo'limi: what a parent did with a child, and the wish it earns.
--
-- A deed is stored as who did what with whom, on which day — never as a score. What
-- it is worth lives in the client's catalogue, so the worth of an hour spent reading
-- can be changed later without rewriting anybody's history, the way badges work.
--
-- Both the child and the adult are credited from the same row: the child moves
-- toward a wish, the adult toward their own KPI. That was Sardor's call — one act
-- should reward both, or reading to your son is a duty with no encouragement in it.
CREATE TABLE IF NOT EXISTS child_deeds (
    id         BIGSERIAL   PRIMARY KEY,
    circle_id  BIGINT      NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    child_id   TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    adult_id   TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    deed       TEXT        NOT NULL,
    day        DATE        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS child_deeds_circle_idx ON child_deeds (circle_id, day);
CREATE INDEX IF NOT EXISTS child_deeds_child_idx ON child_deeds (child_id);

-- Granting a wish is an event, not a reset: the child's points keep accumulating and
-- what is left toward the next wish is the total minus what has already been given.
-- Zeroing a counter would lose how much the child has done in their life.
CREATE TABLE IF NOT EXISTS child_rewards (
    id         BIGSERIAL   PRIMARY KEY,
    circle_id  BIGINT      NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    child_id   TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    given_by   TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    wish       TEXT        NOT NULL DEFAULT '',
    day        DATE        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS child_rewards_child_idx ON child_rewards (child_id);

-- How many points this child needs for one wish. Per child rather than per family:
-- a four-year-old and a twelve-year-old should not be held to the same number.
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS reward_goal INTEGER NOT NULL DEFAULT 100
    CHECK (reward_goal BETWEEN 10 AND 10000);
