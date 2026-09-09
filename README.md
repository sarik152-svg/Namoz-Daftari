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

## Oila: points, not places — and a weekly KPI

A family circle has no podium, no comparison cards, no percentages and no Nth-place
labels. Sardor was plain about it: inside a family there is no ranking. In their place a
board of points listed in the family's own order — sorting by score would be a placing
with the number filed off — and above it the weekly KPI.

Each adult has three thresholds of their own (`members.kpi_easy/mid/hard`) and the
circle holds one set of amounts (`circles.bonus_easy/mid/hard`, $20/$50/$100 by default).
A mother at home and a father on a shift cannot be held to the same number, but the money
is one family budget, so it is agreed once. **Zero is not a target of nothing — it is the
off switch**, which is why it is the default.

The KPI score is the week's ranking ball **plus** what that adult did with the children
that week. One act counts once and lands in both places it belongs: the child moves
toward a wish, the adult toward their tier. Nothing about the result is stored — the tier
reached, the money owed and what is left to the next step are all recomputed, so the app
never disagrees with the records underneath it.

Friends keep the podium exactly as it was. `Ball qayerdan` stays for both: it explains a
number rather than ranking anybody.

## Va'da — the chip has one more state

Somebody who opens the app owing a penance is asked, by name, when they will do it:
today, tomorrow, this week, or never. The answer is a promise made to the circle, so it
is public and travels in `/state`.

**Owing and lying are different things and the chip says which.** A day named and let
pass with the task still owed turns ⚠ VAZIFA into **⚠ ALDOQCHI**, in red, everywhere
names appear — the podium, the comparison cards, the team lists.

**"Never" can never be broken.** It is an honest refusal: the debt still shows, but the
word does not, and the chip stays VAZIFA. Punishing somebody for saying plainly that they
will not do something would only teach them to promise a date they do not mean.

The promise is keyed to the month's task and the tier it was made for, so a debt growing
into a bigger tier is a new task and the question comes back. Doing the task clears both
marks at once, broken word or not — the mark is for what is owed, not a record kept
against somebody.

## Zikrlar va kunlik vazifalar — one person's, and nobody else's

Zikrs on the Sunnat page (name, meaning, how many times, ticked once a day) and a
personal task list at the foot of Bugun: repeating ones asked for every day, one-offs
carrying the day they are wanted by.

**Neither travels in `/state`.** That response carries a whole circle to every phone in
it, and what somebody chose to recite, or wrote on their own list, is not the family's
business. They are read from `GET /me/private`, which takes no id in the path — there is
then no id to get wrong and no way to ask for anybody else's. Every write is scoped the
same way, in the SQL rather than in a check that can be forgotten.

**Neither carries points.** This is a notebook, not a score, and a test pins the day
total at zero however many of them are ticked.

## Dorilar — a family's medicine schedule

On the Sunnat page, between the day's sunnah and the terms of the agreement, and only in
a family. Who takes what, at which hours, for how many days; and each dose ticked at the
hour it actually went down.

**The plan and what happened are separate tables.** `medicines` is a course — a name,
some hours, a first and a last day — and it does not change when somebody is late.
`medicine_doses` is one row per dose actually taken, carrying the hour it was due and the
hour it was swallowed. Whether that was on time is a **comparison made when it is read**
against `DORI_KECHIKISH` (30 minutes), not a verdict written down, so the grace period
can be argued about later without rewriting anybody's history.

A dose with no row is not simply "missed". Five states are told apart because they mean
different things to the person reading them: `kutilmoqda` (the hour has not come),
`kechikmoqda` (it has, the day is still open, there is time to take it and merely be
late), `vaqtida`, `kechikkan`, and `ichilmagan` — which only a closed day can produce.

Anybody in the family may tick a dose: giving a child their syrup is not something only
the child can record.

**A finished course stays listed** under its own heading with its final tally, and only
disappears when somebody deletes it. It used to drop off the list the day it ended, which
took the delete button with it and left no way to clear it away.

Underneath, a family tally: every course added up per person, with the share taken on
time. That share is out of the doses **already due** — counting hours that have not
arrived yet against somebody would mean nobody could ever be at a hundred per cent.

## Boshlang'ich ball — joining after everybody else

Somebody who starts on a Thursday is four days behind through no fault of theirs, and a
first screen that says so is a discouraging one. `members.start_ball` is an opening
balance the circle owner can give them, and `start_day` is the day it belongs to — so it
counts once in the week, month and year containing it and never again.

It is **not** prayer marks, and that is the whole point. Writing "Vaqtida: 25" for
prayers somebody did not make would put words in their mouth about their own worship, and
their breakdown would then lie to them for as long as they used the app. The balance gets
its own row in `Ball qayerdan` instead, and `ontime`, `qazo` and `bad` all stay at zero
until they actually pray something.

## Adding a small child

A four-year-old has no use for a login and a PIN, and asking a parent to invent both
before they can record that they read to their son is the wrong first step. **Farzand
qo'shish** takes a name and nothing else: the id and the PIN are generated and never
shown, the city is copied from the parent adding them, and children's mode is switched
on in the same breath. They are a member like anybody else underneath — it is only the
form that shrinks.

The children's panel also stays on screen when a family has no children yet, saying what
is missing. It used to return nothing at all, and a family with no children read that as
the feature not existing.

## Bolalar bo'limi — what a parent did with a child

Only in a family, and only when there are children in it. A parent picks the child and
the deed — played with them, read to them, taught them an Arabic letter — and taps once.
There are twenty-seven of them in four groups (play, learning, worship and manners,
house and work), because one a day for a week is not a list anybody keeps using, and an
ungrouped list of twenty-seven is a wall nobody reads.
**Both are credited from the same row**: the child moves toward a wish, the adult toward
their own tally. That was the deciding call: reading to your son should not be a duty
with no encouragement in it.

Two API routes and two tables, and neither stores a score. `child_deeds` records who did
what with whom on which day; what a deed is *worth* lives in the client's `BOLA_AMALLAR`,
so an hour of reading can be revalued later without rewriting anybody's history — the
same reasoning as the badges.

**Granting a wish is an event, not a reset.** `child_rewards` records that one was given;
the child's lifetime points keep accumulating and what is left toward the next wish is
the total minus `granted × goal`. A counter that went back to zero would erase how much
the child has actually done. The goal is per child (`members.reward_goal`), because a
four-year-old and a twelve-year-old should not be held to the same number.

Only whoever recorded a deed may take it back. Nobody else gets to erase what a parent
says they did with their child.

## Bilim — the alphabet, the suras, the duas

Three checklists under each child: twenty-eight Arabic letters shown as the letters
themselves, twelve short suras, ten everyday duas. Each is learned once — the unique key
on `child_skills` says so — and each is worth points that go to the same place a deed's
do, so learning brings the wish closer too.

A checklist rather than more deeds, because the horizon is the point: "12 / 28" says
something to a child that "taught a letter today" does not. Which items exist and what
they are worth lives in the client, as everywhere else; the row records only that this
child learned this item on this day with this adult.

Unticking is open to anyone in the family, unlike a deed, which only its author can take
back. A letter marked by mistake is a family's to correct; an account of your own
afternoon is not.

## Haftalik vazifa — one good deed a week

On Bugun, between the prayers and the make-up notebook: one deed for the week, one
tick. Washing a parent's feet, calling a brother, visiting somebody ill, giving sadaqa
where nobody knows who gave it. Doing it is worth `AMAL_BALL` (2); a week that closes
without it costs `AMAL_JARIMA` (1). Children are never fined for it.

Which deed comes up is counted off the same fixed Monday as the weekly team task, so it
is derived rather than stored and everybody's phone shows the same one. Being done is
stored — `amal` on the day it was ticked, an ordinary toggle like `quran` rather than a
write-once mark, since the member may still be in the middle of it. The **week** is what
counts, not the day: `amalBajarilgan` asks whether any day in the week carries the tick.

In the scoring loop the credit lands on the **first** ticked day of the week and the
penalty on the week's **last** day, and only once that day is behind us — so a week still
running owes nothing, and any range that contains the week picks it up naturally.

Crediting every ticked day was the first version and it was wrong: two taps in one week
paid twice for one deed. The rule is one deed a week, so the second tick is a thumb
slipping rather than more work, and the app now refuses to write it at all.

## Qazo daftari — prayers made up from years ago

Wholly separate from `PrayerStatus.qazo`, which is today's prayer said after its window
and costs a quarter point. These are prayers owed from long before the app existed, and
each one **earns** `QAZO_BALL` (0.25) — off the debt, and on the weekly and monthly
podium. The two are never shown under the same word in the app, and the ranging code
keeps them in differently named counters (`qazo` against `eski`) for the same reason.

A day carries `qazo: {bomdod: 3, peshin: 2, ...}` — five fard prayers only, since a nafl
prayer is never owed. The count hangs off the day they were **prayed**, because nobody
knows which day they were missed.

Counting up through the day cannot be write-once, so the rule bends exactly one way:
**a bigger number wins**. A smaller one is an erasure and is discarded, in `upsert_day`
and in `replace_member_data` alike. In the browser the counter is local until Saqlash is
pressed, the way the tasbih counter on the task page already works, so a mis-tap costs
nothing before it is committed and nothing after it can be taken back.

`qazo_debt` is the backlog they say they owe, **as it stood when they wrote it down**.
What is left is always that minus everything counted in `days`, so re-stating it never
subtracts the same made-up prayers twice.

It lives **on the member row, with a route of its own**, and the first cut of this
feature got that wrong in a way worth remembering: it was added as a field on
`MemberData`, which is not stored as a document. `replace_member_data` fans that payload
out into `day_records`, `bonuses`, `tasks`, `books` and `places`, so a field with no
table was accepted by the API, dropped on the floor, and handed back as zero by the next
`/state` — which on screen was indistinguishable from the save button not working. The
member row is also the safer home: the whole document is pushed on every book edit and
bonus claim, so a phone that had not caught up would have reset the backlog each time.

**The weekly team task** rotates: `haftaTopshiriq` picks from `HAFTALIK` by counting
weeks from a fixed Monday, so it is derived rather than stored and every phone shows the
same one. It sits *beside* the standing "hammamiz uchun" badge rather than replacing it —
that badge is the group's agreement about the five daily prayers and does not rotate.

Make-up prayers deliberately do **not** count toward the weekly team badge: that badge is
an agreement about praying the five daily prayers on time, and a backlog would dissolve it.

## One scale for "ball"

There used to be two. `STATUS.ball` was the **debt** scale — praying on time was worth
nothing, because it adds no debt, and congregation was only the half point on top. The
ranking used its own scale where on time is +1 and congregation +1.5. So one prayer said
with the congregation showed **+0,5** on Bugun and **+1,5** in the ranking, and Sardor
quite reasonably asked why his day added up to 0.75 when he had made it 1.75.

Both numbers were right about their own ledger and that is exactly the problem. The two
scales made sense while good deeds paid the debt down; once the debt became a punishment
nothing can lift, the debt scale had no pluses left to describe and the day total was
measuring against a ledger that no longer worked that way.

Now there is one scale — the ranking's — and the day total is `prayerRange` over that
single day rather than a second implementation of the same rules. `belgiBall` gives one
mark's worth for the card, and a test sums the rows against `prayerRange`. `STATUS` keeps
only the label and the colour.

## Ball qayerdan — the score, shown in its parts

Under the podium, folded away behind a **Batafsil** button: one table, every member as
a column, every kind of mark as a row, each cell showing how many and what they were
worth, with the total underneath. It is closed by default because it answers a question
that is only asked occasionally, and its columns are equal-width with short labels
(`Kechikkan`, not `Qazo (kun ichida)`) so five people fit on a phone without scrolling
sideways — having to swipe to see the last member defeats a comparison table. It
exists because "where did 23.75 come from" is not answerable from a single number, and
the parts are exactly where the surprises live — an unmarked prayer on a closed day
costs a full point, and the night prayer is worth 1.5.

`ballTarkib` must agree with `prayerRange` for every member, including the ones with a
concession: a caught-up prayer is a minus for most people, a plus under ayollar rejimi,
and on time under ish rejimi. A test sums the rows and asserts the total equals the
score, because a breakdown that disagrees with the number above it is worse than none.

## Debt is a punishment, and nothing pays it off

`o.debt` is the current calendar month's penalties and **nothing else**. Praying on
time books nothing; a prayer caught up the same day books `P_QAZO`; a prayer left until
tomorrow or never books `P_MISS`. Ish rejimi and ayollar rejimi cancel the penalty for
the cases they cover, which is the only way the number can be smaller.

Everything that used to take the debt down is gone: the night prayer, the congregation
bonus, made-up qazo, the streak reward, and completing the penalty task itself. Those
are rewards, and rewards live in the ranking. The reason is Sardor's and it is worth
keeping: a debt that can be paid off with good deeds stops being a record of what was
missed, and the penalty stops meaning anything. The streak reward went with it — its
only effect was halving the debt — so the strike panel is now streak information.

**Three steps of penance**, by how much is owed: 5 points → 12 rakats and 500 tasbih,
7 → 20 and 1000, 10 → 26 and 2000. `JAZO` holds them and `jazoDaraja` picks the step.

**The debt resets on the first of the month; an unfinished task does not.** `score`
keeps `oylar` — a penalty column per month — and `vazifaQarzi` walks it oldest first,
comparing each month's required step against the highest `lvl` recorded in `tasks` for
that month. That is why `Task` carries `lvl` and `oy`: without the month, a task done in
September could not be told from one owed for August.

**The mark is the point.** While a task is owed, `vazifaBelgi` puts a red ⚠ VAZIFA chip
beside that member's name on the podium, in the comparison cards and in the team list —
everywhere the circle looks. It is meant to be uncomfortable, and it clears only when
the member ticks Bajardim.

## The year page, and what a new month resets

The ranking is scoped by period — week, month, year — and **every figure in it is
computed at render time**. Nothing about a period is stored, so a new month does not
"close" anything: the window simply moves, and the podium starts from zero. Everything
else is cumulative and untouched by the calendar — the debt, the badges, the streaks,
the Qazo daftari, the book figures, the duel wins, and the Taqqoslash cards, which have
always been lifetime rather than period figures.

The year view exists because the monthly result used to vanish on the 1st with nothing
left of it. `oyQahramonlari` walks the twelve months and recomputes each finished
month's winner, so the history is derived rather than archived, like the weekly team
badge tally. Two rules matter there:

* A month is only judged once `periodDone` says it is over, and a tie has no winner.
* **Somebody who logged nothing that month cannot win it.** Scoring starts at a
  member's first record, so a month they sat out comes back as a flat zero — which
  would otherwise beat somebody who was there and missed a few prayers. The champion
  calculation filters to members with actual activity in the month; the ordinary podium
  does not, because over a week everyone present is logging.

`prayerRange` was capped at forty iterations, which was ample for a week or a month and
silently truncated a year in mid-February. It is four hundred now.

## Duel

Two people, or two pairs, over one week of prayer points — the same `ball` the ranking
uses, summed per side. A draw is a draw: equal points is a win for nobody.

**No result is ever stored.** `duels` and `duel_members` record who is on which side and
when the week ran; the score is worked out in the browser from the records the ranking
already reads. A stored result would be a second copy of an answer the records can always
give, and copies drift — the same reasoning that keeps badges derived.

`started IS NULL` is the whole state machine: no row means no challenge, a null start
means waiting on somebody, and a date means running or finished depending on `ends`. The
week runs `DUEL_DAYS` from the moment the **last** person accepts rather than aligning to
the calendar week, because a challenge sent on Wednesday would otherwise be four days long
or spend four days waiting. Sending a challenge counts as accepting it; any participant
may refuse a challenge that has not started, and nobody can walk away from one that has.

## Ayollar rejimi

A prayer caught up **the same day**, after its window, earns `AYOL_BALL` (0.25) instead
of costing 0.25. Praying on time scores as it does for anybody; letting the day close
with the prayer unsaid costs the same full point as it does for anybody.

It is deliberately weaker than ish rejimi, and works differently: ish rejimi changes the
prayer's **status** (those three count as on time, so they reach the weekly goal, perfect
days and streaks), while this one leaves the status alone and changes only its **value**.
A caught-up prayer stays a caught-up prayer — it just stops being a debt. That is why the
concession lives in the scoring rather than in `holat`.

## Ish rejimi — a shift that covers the middle of the day

For a member whose job holds them through Peshin, Asr and Shom, those three prayed
**the same day, after their windows**, count as prayed on time — in the debt ledger, in
the ranking, in the weekly team goal, on the badges, and on the day card, which labels
them so the screen and the arithmetic never disagree. Everything else is judged exactly
as it is for anybody: Bomdod and Xufton stay strict, tahajjud and the make-up notebook
are unchanged, and a prayer left until the next day still costs a full point. The
concession is for the shift, not for putting it off.

Without it the app books three quarter-point penalties every working day for prayers
that member could never reach, which makes the record a description of their job rather
than of their practice.

The rule lives in exactly one function — `holat(c, prayer, mark)` — and **every** place
that reads a status goes through it: scoring, ranking, streaks, perfect days, the chart,
the weekly task, the family analysis and the day card. A second copy of this rule is how
the two ledgers would drift apart.

**The three prayers stay open until the next day's Fajr**, exactly as Xufton does. A man
whose shift ends late prays them when he gets home; marking at 00:15 what he prayed at
23:30 is not lateness, and a concession that expires at midnight is no concession for
somebody who works late. `liveDay` returns yesterday for those three while the grace
lasts, so the mark lands on the right day, and the same window holds off the penalty for
one not yet marked — otherwise he is charged for a prayer he can still record.

Two things had to move for that. `winState` called a past day's window "early" when
compared against the clock alone, and the app refuses to mark a prayer whose time has not
come; a day already behind us is now always "past". And the penalty check, which
special-cased Xufton by name, asks `liveDay` per prayer instead — the same question,
asked once rather than written down twice.

The circle owner sets it, like `is_child`. Granting yourself lighter scoring is not
something anybody should be able to do quietly.

## Vazifa lives under Sunnat, and there is no 14-day chart

There is no penalty tab. The terms of the agreement and the penalty work sit at the
bottom of the Sunnat page, and a child is shown neither — the same rule the tab used to
enforce, now enforced by the section. A phone still holding `tab === "task"` is sent to
Sunnat rather than left on a blank screen.

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
| | on time +1, qazo −0.25, missed −1 | every `BET_NORMA` pages +1, note +0.5, book finished +5 |

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
