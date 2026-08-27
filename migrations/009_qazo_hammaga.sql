-- One backlog for everybody: 33 970.
--
-- Sardor's call, and the arithmetic behind it is the usual one — five prayers a day
-- from the age of responsibility to now, about eighteen and a half years' worth. The
-- group agreed to start from the same number rather than each guess their own, so
-- this sets it for everyone already here.
--
-- It is a starting number, not a verdict: anybody can change their own from the Qazo
-- daftari, and what is left is always this minus everything they log.
UPDATE members SET qazo_debt = 33970;

-- New members join on the same footing rather than at zero, which would read as
-- "you owe nothing" to somebody who has not thought about it yet.
ALTER TABLE members ALTER COLUMN qazo_debt SET DEFAULT 33970;
