-- Ish rejimi: for somebody whose job takes the middle of the day.
--
-- Peshin, Asr and Shom fall inside a shift they cannot leave, and they pray all
-- three when they get home. Under the ordinary rule that is three quarter-point
-- penalties every working day, which turns a record of a life into a record of a
-- job. With this flag those three, made up **the same day**, count as prayed on
-- time. Bomdod, Xufton, tahajjud and the make-up notebook are judged exactly as
-- everybody else's, and letting a prayer roll into the next day still costs a full
-- point — the concession is for the shift, not for putting it off.
--
-- It is set by the circle owner, never by the member: granting yourself lighter
-- scoring is not a thing anyone should be able to do quietly.
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS work_shift BOOLEAN NOT NULL DEFAULT false;
