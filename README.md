# Namoz Daftari — shared group tracker

Every member sees everyone's statistics on the **Statistika** screen, and only the
person themselves can change their own records.

## What this replaced

The original app was a static HTML page storing everything in the browser's
`localStorage`. Nobody could see anyone else's records, clearing the browser lost the
history, and the Postgres on Railway sat unused.

The first rewrite added a shared group code plus an optional per-member PIN. That had
a hole: both seeded members had no PIN, an empty PIN meant *anyone* could write, and
there was no way to set one. Whoever held the group code could edit either member.

This version replaces both with per-person login.

| | Now |
|---|---|
| Getting in | Your name + your own 4-digit PIN, checked by the server |
| Session | A random token, 90-day sliding expiry, stored on your phone |
| Reading | Any logged-in member sees the whole group. That is the point of the app. |
| Writing | Only your own records. Enforced by comparing the session identity. |
| Admin | A separate password. Full power, including reading every PIN. |

## Access model

Two kinds of session:

- **Member** — reads everything, writes only to itself, can change its own PIN by
  proving the current one.
- **Admin** — everything, plus the roster with PINs in the clear, adding and removing
  members, and setting any PIN without knowing the old one.

### Recorded trade-offs

**PINs are encrypted, not hashed**, because the admin panel displays them. A stolen
database dump alone is useless, but dump plus `PIN_ENCRYPTION_KEY` exposes every PIN,
and an admin can silently write as anyone. This was raised twice and accepted by the
owner; it is the cost of the admin panel being able to hand out PINs.

**PINs are 4 digits**, an owner decision over a recommendation of 6. With the shared
group code gone the PIN is the only wall in front of a member's data, so 10,000
combinations is thin. The compensation is that the brute-force throttle (8 failures
per 5 minutes per member) **lives in Postgres, not memory** — a restart or redeploy no
longer hands an attacker a fresh budget.

**The login screen lists member names publicly.** Anyone hitting the URL learns that
Sardor and Behruz use this app, and nothing else. Accepted for the sake of a name
picker instead of typing.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness + database round trip |
| GET | `/api/v1/auth/members` | none | Names for the login picker |
| POST | `/api/v1/auth/login` | none | Member id + PIN, returns a token |
| POST | `/api/v1/auth/admin` | none | Admin password, returns a token |
| GET | `/api/v1/auth/me` | session | Skip the login screen on a known phone |
| DELETE | `/api/v1/auth/session` | session | Log out |
| GET | `/api/v1/state` | session | Everyone's records |
| PUT | `/api/v1/members/{id}/days/{date}` | own or admin | One day (the hot path) |
| PUT | `/api/v1/members/{id}/data` | own or admin | Whole document |
| POST | `/api/v1/members/{id}/pin` | own + current PIN, or admin | Change a PIN |
| POST | `/api/v1/members` | admin | Add a member |
| DELETE | `/api/v1/members/{id}` | own or admin | Remove a member |
| GET | `/api/v1/admin/roster` | admin | Members with PINs in the clear |

Errors always come back as `{"error": {"code": "...", "message": "..."}}`.

Books add no endpoints. A member's books ride inside `MemberData`, so they are read
by `GET /api/v1/state` and written by `PUT /api/v1/members/{id}/data` alongside the
bonus and task ledgers.

## Layout

```
app/config.py      environment, validated once at startup
app/security.py    PIN encryption, admin password, token generation
app/models.py      Pydantic validation of every payload; Session ownership rule
app/db.py          asyncpg pool + migration runner
app/repository.py  all SQL
app/main.py        routes and the session dependencies
migrations/        applied automatically on boot, tracked in schema_migrations
static/index.html  the browser app. Source of truth, edited directly.
                   SUNNATS carries 45 daily sunnahs, each with its hadith source.
patch_login.py     the one-time group-code -> login migration of the client. Historical.
tests/             151 unit/API tests, 24 integration tests
legacy/            the pre-server localStorage client, kept for reference only
```

`tests/` and `patch_login.py` are listed in `.railwayignore`, so they were absent from
the deployed image the source was recovered from and are not in this repository. They
need rewriting before `pytest` means anything again.

`patch_client.py` is gone. The fork has diverged too far from Sardor's original for
regex patching to stay safe, so `static/index.html` is now edited directly and
`tests/test_client_bundle.py` asserts the invariants the patch script used to guard.

## Running locally

```bash
py -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
cp .env.example .env      # then fill DATABASE_URL, ADMIN_PASSWORD, PIN_ENCRYPTION_KEY
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8080
./.venv/Scripts/python.exe -m pytest
```

Integration tests need a throwaway Postgres and skip without one:

```bash
TEST_DATABASE_URL=postgresql://... ./.venv/Scripts/python.exe -m pytest tests/test_integration.py
```

They delete rows whose id starts with `ittest`, so never point them at production.

## Deploying

On Windows PowerShell use `railway.cmd`, not `railway` — the npm `.ps1` shim is
blocked by the execution policy.

```powershell
railway.cmd variables --service namoz-web --skip-deploys `
  --set "ADMIN_PASSWORD=..." --set "PIN_ENCRYPTION_KEY=..."
railway.cmd up --service namoz-web
```

`railway up` often ends with a `backboard.railway.com ... operation timed out` error
*after* printing `Uploaded`. That is the CLI losing the log stream, not a failed
deploy. Verify with `/health` rather than trusting the exit code.

`GROUP_CODE` is no longer read and can be deleted from the service variables.

## First run after deploying

Existing members have no usable PIN, because migration 002 drops the old `pin_hash`
column. Nobody can log in until the admin assigns PINs:

1. Open the app, tap **Admin sifatida kirish**, enter `ADMIN_PASSWORD`.
2. The roster lists every member with their PIN. Set one for each person.
3. Tell each person their PIN privately.
4. They log in with their name and PIN, then change it in **Sozlamalar**.

Once someone changes their PIN, the admin can still see the new value — that is what
"admin can do everything" means here.

## Offline behaviour

The app polls every 60 seconds and replaces its local copy with the server's. That
would destroy a mark made while offline, so failed day writes are queued in
`nd_outbox` and retried before each poll. If the queue cannot drain, the poll is
skipped and your marks stay on screen. Failures that retrying cannot fix — expired
session, someone else's record, rejected payload — are dropped rather than retried
forever.

## Xufton — the day-boundary fix

Xufton is the one prayer whose window crosses midnight: it opens at Isha and closes at
the **next morning's** Fajr. Three things were wrong, and they compounded:

1. `daySchedule` closed the window at *that same day's* Fajr, which falls hours
   *before* the window opens.
2. A mark was always filed under the phone's current calendar date, so a Xufton prayed
   at 00:30 was recorded against **tomorrow** — and the day it belonged to stayed empty
   and was later scored as missed (−1).
3. Every comparison used the phone's clock, while the schedule is computed for the
   member's configured city. A Dubai profile on a phone in Tashkent was judged an hour
   out.

Now:

- `endXufton` is tomorrow's Fajr.
- `liveDay(prayer, member)` decides which day a mark belongs to. Between midnight and
  Fajr, Xufton is filed against **yesterday**; every other prayer keeps the civil date.
- `nowFor(member)` / `todayFor(member)` evaluate everything in the member's own city
  time, not the device's.
- `winState` grades strictly by the window — `open` → on time, `past` → qazo,
  `early` → the prayer cannot be marked at all, because its time has not come.
- Scoring gives yesterday's Xufton a grace period: it is not counted as missed while
  its window is still open.

## Tahajjud

Tahajjud is nafl, so it never costs anything: it cannot be marked missed, its window is
advisory rather than enforced, and it can be logged at any hour — including a past day,
where it still counts as prayed rather than late. Each one instead takes `NAFL_BALL`
(0.25) off the prayer debt. The one thing the old code did wrong was letting the strict
window grading apply to it, which turned a night prayer logged in the morning into a
qazo with a minus beside it.

## Travel: which city a day is judged in

Members move between cities, and prayer times have to follow the city they are actually
in. Overwriting `members.city` would have silently rewritten the schedule of every past
day, so the city is a **dated list** instead — `places`, one entry per move, meaning
"from this day onward, here".

- `cfgNow(member)` — the city they are in now. Drives "today", the live windows and
  everything being graded right now.
- `cfgAt(member, day)` — the city they were in on that day. Drives the schedule shown
  for a past date and the delay statistics, so flying to Dubai does not re-judge the
  week spent in Tashkent.

Members set this themselves in **Sozlamalar**, from the city list or by entering
coordinates. The entry is stamped with today's date *in the new city*, since crossing
time zones can change what "today" is. `members.city` stays as the fallback for anyone
who has never moved, and as what the admin roster shows.

## Hafta va oy qahramoni

The **Statistika** tab opens with rankings, scored separately for prayer and for
reading, since they are separate ledgers:

| | Prayer | Book |
|---|---|---|
| | on time +1, qazo −0.25, missed −1, tahajjud +0.25 | every `BET_NORMA` pages +1, note +0.5, book finished +5 |

The week runs Monday to Sunday and is **final once Sunday's Xufton has come in** — the
week's last prayer time, which is what the owner asked for. Until then the block is
marked `HOZIRCHA` and last week's finished result is shown alongside it. The month works
the same way, ending with the last day's Xufton.

Ranking a member starts from their first recorded day, never from the start of the
period, so somebody who joins mid-week is not charged for days they were not there.

## Kitob daftari

A fifth tab. Each member records the books they are reading, logs pages per day, and
writes short notes; **Umumiy daftar** shows the whole group's open books and merges
everyone's notes into one feed, newest first.

Pace is `pages read ÷ days since the book was started` — every day counts, not only the
days someone opened the book, because that is what "pages per day" honestly means and it
is what the remaining-days estimate divides by.

Book points are kept **separate from prayer points**, so a week of not reading never
inflates a prayer debt:

| | |
|---|---|
| At least `BET_NORMA` (10) pages in a day | 0 |
| Some pages, under the norm | −0.5 |
| An open book and nothing read | −1 |
| Each note written | +0.5 |
| Each book finished | +5 |

Only closed days are scored; the current day is shown but never penalised. Every 4
points of book debt opens one make-up task: 30 pages plus a note.
