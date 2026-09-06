-- What a child has learned: Arabic letters, short suras, everyday duas.
--
-- A checklist rather than a deed, because the point is the horizon — twelve of
-- twenty-eight letters is a different thing to see than "taught a letter today".
-- Each item is learned once, which is what the unique key says.
--
-- Which letters exist, and what each is worth, lives in the client. The row records
-- only that this child learned this item, on this day, with this adult.
CREATE TABLE IF NOT EXISTS child_skills (
    id         BIGSERIAL   PRIMARY KEY,
    circle_id  BIGINT      NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    child_id   TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    adult_id   TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    kind       TEXT        NOT NULL CHECK (kind IN ('harf', 'sura', 'duo')),
    item       TEXT        NOT NULL,
    day        DATE        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (child_id, kind, item)
);

CREATE INDEX IF NOT EXISTS child_skills_circle_idx ON child_skills (circle_id);
