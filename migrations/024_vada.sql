-- Va'da: when a member says they will do their penance.
--
-- The chip beside somebody's name is the mechanism, and it needs one more state.
-- Owing a task is not the same as promising a day and letting it pass — the first is
-- a debt, the second is a broken word, and the app should say which.
--
-- `promised` NULL means "hech qachon": an honest refusal, which cannot be broken and
-- so never becomes a lie. Keyed by the month the task belongs to, with the tier it
-- was made for: if the debt grows into a bigger tier, that is a new task and the
-- question is asked again.
CREATE TABLE IF NOT EXISTS task_promises (
    member_id TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    oy        TEXT        NOT NULL,
    lvl       INTEGER     NOT NULL CHECK (lvl BETWEEN 1 AND 3),
    promised  DATE,
    made_at   DATE        NOT NULL,
    PRIMARY KEY (member_id, oy)
);
