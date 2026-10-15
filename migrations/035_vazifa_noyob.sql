-- Preserve which month/tier a completed task settled, and make retries idempotent.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS lvl INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS oy TEXT NOT NULL DEFAULT '';

UPDATE tasks
   SET lvl = CASE
       WHEN rakats = 12 AND tasbih = 500 THEN 1
       WHEN rakats = 20 AND tasbih = 1000 THEN 2
       WHEN rakats = 26 AND tasbih = 2000 THEN 3
       ELSE lvl END,
       oy = CASE WHEN oy = '' THEN to_char(day, 'YYYY-MM') ELSE oy END;

-- Keep the earliest copy when an offline retry created the same task repeatedly.
DELETE FROM tasks a USING tasks b
 WHERE a.id > b.id
   AND a.member_id = b.member_id
   AND a.oy = b.oy
   AND a.lvl = b.lvl;

ALTER TABLE tasks ADD CONSTRAINT tasks_lvl_check CHECK (lvl BETWEEN 0 AND 3);
ALTER TABLE tasks ADD CONSTRAINT tasks_oy_check CHECK (oy = '' OR oy ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
CREATE UNIQUE INDEX IF NOT EXISTS tasks_member_oy_lvl_uq ON tasks (member_id, oy, lvl);

-- Old deployments could display ALDOQCHI from a promise whose task was later
-- duplicated or re-created without its tier. Those stale promises were not a
-- trustworthy answer to today's question. Ask again after the task identity is
-- repaired; a future promise remains intact.
DELETE FROM task_promises WHERE promised IS NOT NULL AND promised < CURRENT_DATE;
