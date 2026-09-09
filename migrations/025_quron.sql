-- Qur'on: qaysi surada, qaysi oyatgacha.
--
-- Two tables, and neither stores a score. `quran_reads` is a log — "on this day I
-- reached ayah N of sura S" — so where somebody is now is the highest ayah they have
-- logged, and how much they read on a day is the step between entries. Storing a
-- position instead would answer where they are and nothing about how they got there.
--
-- `quran_done` records a sura finished, on the day it was finished, so the five
-- points it is worth land in the week, month and year that actually contain it.
CREATE TABLE IF NOT EXISTS quran_reads (
    id         BIGSERIAL   PRIMARY KEY,
    member_id  TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    sura       SMALLINT    NOT NULL CHECK (sura BETWEEN 1 AND 114),
    ayah       SMALLINT    NOT NULL CHECK (ayah BETWEEN 1 AND 286),
    day        DATE        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quran_reads_member_idx ON quran_reads (member_id, sura);

CREATE TABLE IF NOT EXISTS quran_done (
    member_id TEXT     NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    sura      SMALLINT NOT NULL CHECK (sura BETWEEN 1 AND 114),
    day       DATE     NOT NULL,
    PRIMARY KEY (member_id, sura)
);
