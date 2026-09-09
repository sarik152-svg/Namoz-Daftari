-- Zikrlar va kunlik vazifalar. Both belong to one person and to nobody else.
--
-- They deliberately do not ride in `/state`, which carries a whole circle to every
-- phone in it: what somebody chose to recite, and what they wrote on their own list,
-- is not the family's business. They are read from a route that only ever answers
-- about the caller.
--
-- Neither carries points. Sardor was explicit — this is a notebook, not a score.
CREATE TABLE IF NOT EXISTS zikrs (
    id         BIGSERIAL   PRIMARY KEY,
    member_id  TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    meaning    TEXT        NOT NULL DEFAULT '',
    count      INTEGER     NOT NULL CHECK (count BETWEEN 1 AND 100000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zikrs_member_idx ON zikrs (member_id);

CREATE TABLE IF NOT EXISTS zikr_marks (
    zikr_id BIGINT NOT NULL REFERENCES zikrs (id) ON DELETE CASCADE,
    day     DATE   NOT NULL,
    PRIMARY KEY (zikr_id, day)
);

-- A repeating task is done or not done *today*; a one-off is done or not, once, and
-- carries the day it is wanted by. One table, because they are the same sentence with
-- a different rhythm — `repeating` says which.
CREATE TABLE IF NOT EXISTS todos (
    id         BIGSERIAL   PRIMARY KEY,
    member_id  TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    text       TEXT        NOT NULL,
    repeating  BOOLEAN     NOT NULL DEFAULT false,
    due        DATE,
    done_at    DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT todos_shape CHECK (NOT repeating OR (due IS NULL AND done_at IS NULL))
);

CREATE INDEX IF NOT EXISTS todos_member_idx ON todos (member_id);

CREATE TABLE IF NOT EXISTS todo_marks (
    todo_id BIGINT NOT NULL REFERENCES todos (id) ON DELETE CASCADE,
    day     DATE   NOT NULL,
    PRIMARY KEY (todo_id, day)
);
