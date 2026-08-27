-- Qazo daftari: the backlog of prayers a member says they owe from years past.
--
-- It sits on the member rather than in their document because the document is not
-- stored as a document: `replace_member_data` fans it out into day_records, bonuses,
-- tasks, books and places, and a field with no table of its own was accepted by the
-- API, dropped on the floor, and handed back as zero on the next read. On screen that
-- looked exactly like the save button not working.
--
-- Living here also keeps it out of reach of a stale phone pushing its whole document:
-- the backlog is set through one route of its own, the way is_child already is.
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS qazo_debt INTEGER NOT NULL DEFAULT 0
    CHECK (qazo_debt >= 0);
