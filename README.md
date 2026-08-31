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
| Getting in | Your login + your own 4-digit PIN, checked by the server |
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

**The login screen used to list member names publicly.** That was accepted while the app
held one group of friends. It stopped being acceptable the moment circles arrived: the
list would have published the names of other people's wives and children to anyone who
opened the URL. The picker is gone and you type your login; the device remembers it after
the first success, so the typing happens once.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness + database round trip |
| POST | `/api/v1/auth/login` | none | Member id + PIN, returns a token |
| POST | `/api/v1/auth/admin` | none | Admin password, returns a token |
| GET | `/api/v1/auth/me` | session | Skip the login screen on a known phone |
| DELETE | `/api/v1/auth/session` | session | Log out |
| GET | `/api/v1/circles` | session | The circles you belong to |
| GET | `/api/v1/state?circle=` | member of it | One circle's records |
| PUT | `/api/v1/members/{id}/days/{date}` | own or admin | One day (the hot path) |
| PUT | `/api/v1/members/{id}/data` | own or admin | Whole document |
| POST | `/api/v1/members/{id}/pin` | own + current PIN, or admin, or a circle owner | Change a PIN |
| DELETE | `/api/v1/members/{id}` | own or admin | Remove a member |
| POST | `/api/v1/circles` | session | Start a family; the caller owns it |
| PATCH | `/api/v1/circles/{id}` | its owner | Name and weekly goal |
| DELETE | `/api/v1/circles/{id}` | its owner | Close a family; never the friends circle |
| POST | `/api/v1/members/{id}/qazo-debt` | own or admin | State your backlog of prayers owed |
| POST | `/api/v1/members/{id}/work-shift` | circle owner or admin | Ish rejimi on or off |
| POST | `/api/v1/members/{id}/woman-mode` | circle owner or admin | Ayollar rejimi on or off |
| POST | `/api/v1/circles/{id}/duels` | member of it | Challenge somebody, 1x1 or 2x2 |
| POST | `/api/v1/duels/{id}/confirm` | a participant | Accept; the last one starts the week |
| DELETE | `/api/v1/duels/{id}` | a participant | Refuse or withdraw, before it starts |
| GET | `/api/v1/circles/{id}/roster` | its owner | That circle's members with PINs |
| POST | `/api/v1/circles/{id}/members` | its owner | Add an existing login, or a new person |
| DELETE | `/api/v1/circles/{id}/members/{id}` | its owner, or yourself | Take somebody out |
| POST | `/api/v1/members/{id}/child` | a circle owner, or admin | Children's mode on or off |
| POST | `/api/v1/circles/{id}/jamoat` | inside that **family** | "We are praying this one together" |
| POST | `/api/v1/circles/{id}/khatm` | inside that **family** | Open a khatm |
| POST | `.../khatm/{kid}/juz/{n}` | inside that family | Take a free juz |
| POST | `.../khatm/{kid}/juz/{n}/done` | whoever took it | Mark it read |
| DELETE | `.../khatm/{kid}/juz/{n}` | whoever took it | Give it back, if unread |

Errors always come back as `{"error": {"code": "...", "message": "..."}}`.

**The tests never reach a database, so one of them reads the SQL instead.**
`tests/test_sql_matches_schema.py` parses the migrations into a schema and every query
in `app/repository.py` against it. It runs nothing; it catches the failure the fake pool
cannot see — a column renamed in a migration and missed in a query, which would ship
green and break every screen at once.

**There is no `POST /api/v1/members`.** Creating a person happens through a circle,
because an account made outside one belongs to no group: it can log in and then see
nothing, with no screen able to help it. Adding through the circle makes that state
unreachable rather than merely unlikely.

**The family features are refused for a friends circle, not merely hidden.** People in
different cities cannot pray in one room, and the analysis screen reports on a household.
`_require_family` is the single gate.

**Calling a family to prayer records the call and nothing else.** Who joined is not
stored: each person still marks their own prayer through the ordinary write. That keeps
both standing rules intact — nobody marks for anybody else, and a mark is write-once.

**A child accrues no debt and no penalty work,** and is left out of the weekly team
badge so they cannot cost the family a badge they cannot yet earn. They are still in
the ranking, with stars in place of arrears. `members.is_child` is set by a circle
owner, never by the member themselves, since that would just be switching off your own
arrears.

**A circle's owner can reset the PIN of anyone in it.** A forgotten PIN inside a family
has to be fixable inside that family. This grants nothing new — the roster already shows
the owner those PINs — it only removes the trip through the server password.

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

## Tahajjud was taken out

Removed from the app on 2026-08-31. Sardor's reasoning: the night prayer is better left
unseen — whoever prays it prays it for themselves, and putting it on a scoreboard makes
it something other than what it is. So there is no card for it, no points, no badges and
no weekly task built on it. The daily sunnah and the verse that mention it stay: the
point was to take it out of the accounting, not out of sight.

`PrayerKey` still accepts it server-side so a phone running the old page does not get a
422 for a tap that no longer exists, and `A.mark` refuses any prayer not in `PRAYERS`
rather than quietly writing it. Every prayer in the app is now fard.

## Marks are write-once

A mark is a claim about something that already happened, and the whole group can see
it, so it cannot be edited afterwards. Once a prayer is marked the row locks: the
buttons go inert, the time field is gone, and there is no clear button. Because the
action no longer has an undo, marking now asks for confirmation first, naming the
prayer and the status it is about to record.

This is enforced on the **server**, not just in the browser — locking it only in the
client would be decoration, since the API is what actually holds the record.
`upsert_day` reads the stored day first and lets any prayer already recorded win over
whatever the phone sends, including a phone that sends the key back missing, which is
what a clear looks like on the wire. `replace_member_data` does the same, so saving a
book cannot become a way to rewrite a prayer. `quran` stays a toggle.

The admin can still overwrite, via the same `allow_overwrite` path: a genuine mis-tap
has to be fixable by somebody, and admin is already the role that can do anything here.

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

## Jamoat

A fard prayer marked as prayed in congregation carries `j: true` on the mark and is
worth **1.5 instead of 1** in the ranking, plus 0.5 off the prayer debt. The choice is
made at the moment of marking — a third button on the row, mosque / alone / missed —
and is write-once like the rest of the mark. Nafl has no congregation button, since
tahajjud is prayed alone. Marking congregation on a prayer already outside its window
still records the fact but earns nothing: the bonus is for praying with the jamaat *on
time*.

## Nishonlar

A tab of 23 badges, derived rather than stored: each is a `{kerak, v(stat)}` pair read
straight off existing records, so a badge appears the moment its condition is met and
recalculates by itself if a rule changes later. Earned ones show as a grid; unearned
ones show underneath with a progress bar and their current count, so it is always clear
what is close. A member switcher lets anyone look at anyone else's.

### Haftalik jamoa nishoni

One badge is not personal. Every member must reach `HAFTA_MAQSAD` (25) on-time prayers
in the week; if all of them do, everyone gets it, and if a single person falls short,
nobody does — *hamma bir kishi uchun, bir kishi hamma uchun*. The panel shows each
member's progress toward the target, so it is visible who still needs carrying, and
keeps a count of how many weeks the group has earned.

## Hafta va oy qahramoni

The **Reyting** tab opens with an Olympic-style podium — second on the left, first
raised in the middle, third on the right — for **prayer only**, with a week/month
switch. The book ranking lives in Kitob → Umumiy daftar instead, next to the books it
is about. The per-prayer "which prayer is hardest" breakdown was removed: it was four
bars per person per prayer and nobody read it.

Scores, kept separate because they are separate ledgers:

| | Prayer | Book |
|---|---|---|
| | on time +1, qazo −0.25, missed −1, tahajjud +1.5 | every `BET_NORMA` pages +1, note +0.5, book finished +5 |

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

## Doiralar

A circle answers one question — who is shown together — and nothing else. Records stay
attached to the member, so one prayer marked once counts in every circle that person
belongs to, and a family can be invisible to a friends group without any data being
copied. `circles` and `circle_members` sit beside the personal tables; none of those
changed.

`GET /state` therefore takes a circle and refuses anyone outside it, and the roster
belongs to a circle's owner rather than to one global admin. An admin session has
`member_id = None` and so owns nothing: PINs are read by logging in as yourself and
opening **Sozlamalar**. The admin password still adds members and resets a forgotten PIN.

The switcher at the top of the app stays hidden while you are in only one circle.

## Testing

There was no suite at all until this stage — the original was lost with the container
image the source had to be recovered from. What exists now:

```bash
./.venv/bin/python -m pytest -q     # API and repository, against a fake pool
node tests/client/run.js            # the browser app, loaded into a sandbox
```

Neither needs a database. `tests/fakes.py` is a pool that records SQL instead of running
it, which is deliberate: the only Postgres this project has is the live one.
`tests/client/harness.js` extracts the inline `<script>` from `static/index.html` and
evaluates it in a `vm` context with the browser globals stubbed, so the client is tested
as shipped rather than as a copy.
