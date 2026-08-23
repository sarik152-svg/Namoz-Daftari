# Doiralar poydevori (1-bosqich) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a circle (`doira`) layer over the existing members so a person's records can be shown to one group without being visible to another — with the three current members ending up in a "Do'stlar" circle and seeing exactly what they see today.

**Architecture:** Two new tables (`circles`, `circle_members`) sit beside the untouched personal tables. `GET /state` and the roster stop being global and take a circle id, refusing callers who are not members of it. The client gains a circle switcher and loses the public name list on the login screen. No family creation yet — that is stage 2.

**Tech Stack:** FastAPI, asyncpg, Pydantic v2, plain-JS single-file client, pytest + pytest-asyncio + httpx, Node's `vm` for client tests.

**Prerequisite that is not optional:** this stage rewrites `/state` and the login flow, which are the two things every user touches, and the project currently has no tests at all (`tests/` was lost — see README). Tasks 1–4 build the safety net first. Do not start Task 5 before Task 4 is committed and green.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `tests/fakes.py` | A pool/connection that records SQL instead of running it |
| `tests/conftest.py` | pytest fixtures: fake pool, settings, ASGI client |
| `tests/test_repository.py` | What SQL the repository issues and what rules it enforces |
| `tests/test_api.py` | Endpoint auth, scoping and status codes |
| `tests/client/harness.js` | Loads the browser app into a Node sandbox |
| `tests/client/run.js` | Runs every `*.test.js` beside it, reports pass/fail |
| `tests/client/scoring.test.js` | Prayer-time and scoring behaviour |
| `tests/client/login.test.js` | Login screen and circle switching |
| `migrations/005_circles.sql` | `circles`, `circle_members`, backfill of the existing group |

**Modified**

| File | Change |
|---|---|
| `app/models.py` | `Circle` model |
| `app/repository.py` | Circle queries; `fetch_group_state` takes a circle; seeding creates a circle |
| `app/main.py` | `/circles`, circle-scoped `/state` and roster; `/auth/members` removed |
| `static/index.html` | Login by id+PIN, circle switcher, circle-aware `pull()` |

---

## Task 1: A fake pool so tests never touch the real database

**Files:**
- Create: `tests/fakes.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Write the fake pool**

Create `tests/fakes.py`:

```python
"""A pool that records SQL instead of running it.

The deployed Postgres is the only one this project has, and a test must never be
able to reach it. These fakes let the repository and the API be tested for the SQL
they issue and the rules they enforce, on any machine, with nothing running.

Rows are keyed by a fragment of the query — `"FROM members"` — because the tests
care which table was read, not how the SELECT was spelled.
"""
from __future__ import annotations


def flatten(query: str) -> str:
    """Collapse a multi-line SQL string so tests can match on one line."""
    return " ".join(query.split())


class FakeConnection:
    def __init__(self, rows: dict | None = None, scalars: dict | None = None):
        self.rows = rows or {}
        self.scalars = scalars or {}
        self.executed: list[tuple[str, tuple]] = []
        self.executed_many: list[tuple[str, list]] = []

    def _match(self, table: dict, query: str):
        for fragment, value in table.items():
            if fragment in query:
                return value
        return None

    async def fetch(self, query: str, *args):
        self.executed.append((flatten(query), args))
        return self._match(self.rows, query) or []

    async def fetchrow(self, query: str, *args):
        self.executed.append((flatten(query), args))
        found = self._match(self.rows, query)
        return found[0] if found else None

    async def fetchval(self, query: str, *args):
        self.executed.append((flatten(query), args))
        return self._match(self.scalars, query)

    async def execute(self, query: str, *args):
        self.executed.append((flatten(query), args))
        return "OK 1"

    async def executemany(self, query: str, args):
        self.executed_many.append((flatten(query), list(args)))

    def transaction(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def sql(self) -> list[str]:
        """Every query issued, single-shot and executemany alike."""
        return [q for q, _ in self.executed] + [q for q, _ in self.executed_many]

    def issued(self, fragment: str) -> bool:
        return any(fragment in query for query in self.sql)

    def args_for(self, fragment: str) -> tuple:
        for query, args in self.executed:
            if fragment in query:
                return args
        raise AssertionError(f"no query contained {fragment!r}; saw {self.sql}")


class FakePool:
    def __init__(self, connection: FakeConnection):
        self.connection = connection

    def acquire(self):
        return self

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, *exc):
        return False
```

- [ ] **Step 2: Write the fixtures**

Create `tests/conftest.py`:

```python
"""Fixtures shared by every test.

The API fixture sets `app.state` directly rather than running the lifespan, because
the lifespan opens a real connection pool. ASGITransport does not emit lifespan
events, so the app is exercised exactly as deployed minus the database.
"""
from __future__ import annotations

import httpx
import pytest
from cryptography.fernet import Fernet

from app.config import Settings
from app.main import app
from tests.fakes import FakeConnection, FakePool

ADMIN_PASSWORD = "test-admin-password"


@pytest.fixture
def connection() -> FakeConnection:
    return FakeConnection()


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_url="postgresql://unused",
        admin_password=ADMIN_PASSWORD,
        pin_encryption_key=Fernet.generate_key().decode(),
        seed_members="",
        port=8080,
    )


@pytest.fixture
def api(connection: FakeConnection, settings: Settings) -> httpx.AsyncClient:
    app.state.pool = FakePool(connection)
    app.state.settings = settings
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )


def session_row(member_id: str | None = "sardor", is_admin: bool = False) -> dict:
    """What `load_session` expects back from the sessions UPDATE."""
    return {"token": "tok", "member_id": member_id, "is_admin": is_admin}
```

- [ ] **Step 3: Prove the harness runs**

Create `tests/test_repository.py` with one smoke test:

```python
import pytest

from tests.fakes import FakeConnection, FakePool


@pytest.mark.asyncio
async def test_fake_connection_records_sql():
    connection = FakeConnection(rows={"FROM members": [{"id": "sardor"}]})
    async with FakePool(connection).acquire() as held:
        rows = await held.fetch("SELECT id\n  FROM members")
    assert rows == [{"id": "sardor"}]
    assert connection.sql == ["SELECT id FROM members"]
```

Run: `./.venv/bin/python -m pytest tests/test_repository.py -v`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/fakes.py tests/conftest.py tests/test_repository.py
git commit -m "test: add a fake pool so the suite never reaches a real database"
```

---

## Task 2: Pin the behaviour circles will change

These tests describe today's behaviour. Tasks 8–10 will change them on purpose — that is how the diff shows what moved.

**Files:**
- Modify: `tests/test_repository.py`
- Create: `tests/test_api.py`

- [ ] **Step 1: Write the repository tests**

Append to `tests/test_repository.py`:

```python
import json

from app import repository
from app.models import DayRecord, MemberData

MEMBER_ROW = {
    "id": "sardor", "name": "Sardor", "city": "Toshkent",
    "lat": 41.3, "lng": 69.2, "tz": 5.0, "asr": 2, "fa": 18.0, "ia": 18.0,
}


def state_rows(**extra) -> dict:
    rows = {
        "FROM members ORDER BY created_at": [MEMBER_ROW],
        "FROM day_records": [], "FROM bonuses": [],
        "FROM tasks": [], "FROM books": [], "FROM places": [],
    }
    rows.update(extra)
    return rows


@pytest.mark.asyncio
async def test_fetch_group_state_returns_every_member():
    connection = FakeConnection(rows=state_rows())
    state = await repository.fetch_group_state(FakePool(connection))
    assert [m.id for m in state.members] == ["sardor"]


@pytest.mark.asyncio
async def test_marked_prayer_is_not_overwritten():
    stored = json.dumps({"bomdod": {"s": "qazo", "t": "07:30"}})
    connection = FakeConnection(scalars={"SELECT entries": stored})
    await repository.upsert_day(
        FakePool(connection), "sardor", __import__("datetime").date(2026, 8, 22),
        DayRecord(bomdod={"s": "ontime", "t": "04:05"}),
    )
    written = json.loads(connection.args_for("INSERT INTO day_records")[2])
    assert written["bomdod"] == {"s": "qazo", "t": "07:30"}


@pytest.mark.asyncio
async def test_admin_may_overwrite_a_marked_prayer():
    stored = json.dumps({"bomdod": {"s": "qazo", "t": "07:30"}})
    connection = FakeConnection(scalars={"SELECT entries": stored})
    await repository.upsert_day(
        FakePool(connection), "sardor", __import__("datetime").date(2026, 8, 22),
        DayRecord(bomdod={"s": "ontime", "t": "04:05"}), allow_overwrite=True,
    )
    written = json.loads(connection.args_for("INSERT INTO day_records")[2])
    assert written["bomdod"]["s"] == "ontime"


@pytest.mark.asyncio
async def test_saving_books_cannot_rewrite_a_prayer():
    stored = json.dumps({"bomdod": {"s": "qazo", "t": "07:30"}})
    connection = FakeConnection(scalars={"SELECT entries": stored})
    await repository.replace_member_data(
        FakePool(connection), "sardor",
        MemberData(days={"2026-08-22": {"bomdod": {"s": "ontime"}}}),
    )
    written = json.loads(connection.args_for("INSERT INTO day_records")[2])
    assert written["bomdod"]["s"] == "qazo"
```

- [ ] **Step 2: Write the API tests**

Create `tests/test_api.py`:

```python
"""Endpoint behaviour: who may call what, and what comes back."""
from __future__ import annotations

import pytest

from tests.conftest import ADMIN_PASSWORD
from tests.fakes import FakeConnection


def as_session(connection: FakeConnection, member_id="sardor", is_admin=False) -> dict:
    """Make `load_session` succeed for a Bearer token."""
    connection.rows["UPDATE sessions"] = [
        {"token": "tok", "member_id": member_id, "is_admin": is_admin}
    ]
    return {"Authorization": "Bearer tok"}


@pytest.mark.asyncio
async def test_state_requires_a_session(api, connection):
    async with api as client:
        response = await client.get("/api/v1/state")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "no_session"


@pytest.mark.asyncio
async def test_state_returns_the_whole_group(api, connection):
    headers = as_session(connection)
    connection.rows["FROM members ORDER BY created_at"] = [{
        "id": "sardor", "name": "Sardor", "city": "Toshkent", "lat": 41.3,
        "lng": 69.2, "tz": 5.0, "asr": 2, "fa": 18.0, "ia": 18.0,
    }]
    async with api as client:
        response = await client.get("/api/v1/state", headers=headers)
    assert response.status_code == 200
    assert [m["id"] for m in response.json()["members"]] == ["sardor"]


@pytest.mark.asyncio
async def test_login_names_are_public(api, connection):
    connection.rows["SELECT id, name FROM members"] = [
        {"id": "sardor", "name": "Sardor Valixanov"}
    ]
    async with api as client:
        response = await client.get("/api/v1/auth/members")
    assert response.status_code == 200
    assert response.json()["members"][0]["name"] == "Sardor Valixanov"


@pytest.mark.asyncio
async def test_roster_is_admin_only(api, connection):
    headers = as_session(connection, is_admin=False)
    async with api as client:
        response = await client.get("/api/v1/admin/roster", headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_writing_to_someone_else_is_refused(api, connection):
    headers = as_session(connection, member_id="behruz")
    async with api as client:
        response = await client.put(
            "/api/v1/members/sardor/days/2026-08-22",
            json={"bomdod": {"s": "ontime", "t": "04:05"}}, headers=headers,
        )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_your_record"


@pytest.mark.asyncio
async def test_admin_password_is_checked(api, connection):
    async with api as client:
        bad = await client.post("/api/v1/auth/admin", json={"password": "wrong"})
    assert bad.status_code == 401
```

- [ ] **Step 3: Run the suite**

Run: `./.venv/bin/python -m pytest -v`
Expected: all pass. If `test_state_returns_the_whole_group` fails on a missing row key, print `connection.sql` and align the fragment with the real query text.

- [ ] **Step 4: Commit**

```bash
git add tests/test_repository.py tests/test_api.py
git commit -m "test: pin the write-once rule and the endpoints circles will change"
```

---

## Task 3: A harness for the browser app

The client is one HTML file with a single inline `<script>` and no build step. The harness extracts that script and runs it in a `vm` context with the handful of browser globals it touches stubbed out.

**Files:**
- Create: `tests/client/harness.js`
- Create: `tests/client/run.js`

- [ ] **Step 1: Write the harness**

Create `tests/client/harness.js`:

```js
/* Loads static/index.html's inline script into a sandbox so its functions can be
   called from Node. There is no build step and no module system, so the script is
   evaluated whole; `expose` names the internals a test wants back, because `const`
   declarations do not become properties of the vm context by themselves. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const INDEX = path.join(__dirname, "..", "..", "static", "index.html");

function clientSource() {
  const html = fs.readFileSync(INDEX, "utf8");
  const open = html.indexOf("<script>");
  const start = open + "<script>".length;
  const end = html.indexOf("</script>", start);
  if (open < 0 || end < 0) throw new Error("no <script> block in static/index.html");
  return html.slice(start, end).replace(/\nA\.boot\(\);\s*$/, "\n");
}

/* `at` is the wall-clock instant the app should believe it is, as a UTC ISO string.
   Prayer times depend entirely on the clock, so every test states its own. */
function loadClient({ at = "2026-08-22T09:00:00Z", expose = [] } = {}) {
  const RealDate = Date;
  const frozen = new RealDate(at);
  const element = { value: "", textContent: "", className: "", innerHTML: "" };
  const confirms = [];
  const sandbox = {
    console,
    setInterval() {},
    alert() {},
    prompt: () => null,
    confirm(question) { confirms.push(question); return sandbox.__confirm; },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: () => element, addEventListener() {} },
    window: { scrollTo() {}, scrollY: 0 },
    fetch: () => Promise.reject(new Error("offline")),
    __confirm: true,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const names = ["A", ...expose].join(",");
  vm.runInContext(
    `${clientSource()}
     globalThis.__exports = {${names}};
     globalThis.__setState = (patch) => {
       if ("members" in patch) members = patch.members;
       if ("data" in patch) data = patch.data;
       if ("me" in patch) me = patch.me;
       if ("date" in patch) date = patch.date;
       if ("token" in patch) token = patch.token;
       if ("isAdmin" in patch) isAdmin = patch.isAdmin;
     };`,
    sandbox
  );

  sandbox.Date = class extends RealDate {
    constructor(...args) {
      if (!args.length) super(frozen.getTime());
      else super(...args);
    }
    static now() { return frozen.getTime(); }
    static UTC(...args) { return RealDate.UTC(...args); }
    static parse(value) { return RealDate.parse(value); }
  };

  return {
    ...sandbox.__exports,
    element,
    confirms,
    setConfirm(answer) { sandbox.__confirm = answer; },
    setState: sandbox.__setState,
  };
}

module.exports = { loadClient, clientSource };
```

- [ ] **Step 2: Write the runner**

Create `tests/client/run.js`:

```js
/* Runs every *.test.js in this directory. Each file exports an object of
   name -> function; a throw is a failure. No framework, because the whole suite
   is a few dozen assertions and a dependency would outweigh them. */
const fs = require("fs");
const path = require("path");

const assert = require("assert");
let passed = 0;
const failures = [];

for (const file of fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort()) {
  const suite = require(path.join(__dirname, file));
  for (const [name, run] of Object.entries(suite)) {
    try {
      run(assert);
      passed += 1;
      console.log(`  ok  ${file} · ${name}`);
    } catch (error) {
      failures.push({ file, name, error });
      console.log(`FAIL  ${file} · ${name}`);
      console.log(`      ${error.message}`);
    }
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
```

- [ ] **Step 3: Prove it loads the real client**

Create `tests/client/scoring.test.js`:

```js
const { loadClient } = require("./harness");

module.exports = {
  "loads the browser app"(assert) {
    const client = loadClient({ expose: ["PRAYERS"] });
    assert.strictEqual(client.PRAYERS.length, 6);
  },
};
```

Run: `node tests/client/run.js`
Expected: `1 passed, 0 failed`.

- [ ] **Step 4: Commit**

```bash
git add tests/client/harness.js tests/client/run.js tests/client/scoring.test.js
git commit -m "test: add a Node harness for the single-file browser app"
```

---

## Task 4: Pin the client behaviour circles will change

**Files:**
- Modify: `tests/client/scoring.test.js`
- Create: `tests/client/login.test.js`

- [ ] **Step 1: Write the scoring tests**

Replace `tests/client/scoring.test.js` with:

```js
const { loadClient } = require("./harness");

const TOSHKENT = {
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });

/* Toshkent is UTC+5, so 09:00Z is 14:00 local — after Peshin, before Asr. */
function client(at = "2026-08-22T09:00:00Z") {
  const loaded = loadClient({
    at,
    expose: ["daySchedule", "calcTimes", "hm", "liveDay", "winState", "score", "todayFor", "JAMOAT_BALL"],
  });
  loaded.setState({
    members: [TOSHKENT], data: { sardor: blank() },
    me: "sardor", date: "2026-08-22", token: "tok", isAdmin: false,
  });
  return loaded;
}

module.exports = {
  "xufton closes at tomorrow's fajr, not today's"(assert) {
    const c = client();
    const schedule = c.daySchedule(new Date("2026-08-22T12:00:00"), TOSHKENT);
    const today = c.calcTimes(new Date("2026-08-22T12:00:00"), TOSHKENT);
    const tomorrow = c.calcTimes(new Date("2026-08-23T12:00:00"), TOSHKENT);
    assert.ok(schedule.endXufton < schedule.xufton, "window must wrap past midnight");
    /* The two fajrs are about a minute apart, so asserting the wrap alone passes
       even with the old bug in place. Pin the actual value. */
    assert.strictEqual(schedule.endXufton, tomorrow.fajr, "must be tomorrow's fajr");
    assert.notStrictEqual(schedule.endXufton, today.fajr, "must not be today's fajr");
  },

  "a xufton prayed after midnight belongs to yesterday"(assert) {
    const c = client("2026-08-21T20:00:00Z"); // 01:00 Toshkent on the 22nd
    assert.strictEqual(c.liveDay("xufton", TOSHKENT), "2026-08-21");
    assert.strictEqual(c.liveDay("shom", TOSHKENT), "2026-08-22");
  },

  "a fard prayer cannot be marked before its time"(assert) {
    const c = client("2026-08-22T05:00:00Z"); // 10:00 Toshkent, before Peshin
    c.A.mark("peshin", "pray", "2026-08-22");
    assert.strictEqual(c.__day(), undefined);
  },

  "tahajjud may be marked at any hour"(assert) {
    const c = client(); // 14:00 Toshkent
    c.A.mark("tahajjud", "pray", "2026-08-22");
    assert.strictEqual(c.__day("tahajjud").s, "ontime");
  },

  "a mark cannot be changed once made"(assert) {
    const c = client();
    c.A.mark("peshin", "pray", "2026-08-22");
    const first = JSON.stringify(c.__day("peshin"));
    c.A.mark("peshin", "miss", "2026-08-22");
    assert.strictEqual(JSON.stringify(c.__day("peshin")), first);
  },

  "congregation is worth half a point more"(assert) {
    const c = client();
    c.A.mark("peshin", "jamoat", "2026-08-22");
    assert.strictEqual(c.__day("peshin").j, true);
    assert.strictEqual(c.JAMOAT_BALL, 0.5);
  },
};
```

The tests call `c.__day(...)`, which does not exist yet. Add it to `tests/client/harness.js` in the returned object, after `setState`:

```js
    /* The prayer written for `me` on `date`; with no argument, the whole day, or
       undefined when nothing has been marked. */
    __day(prayer) {
      const day = sandbox.__state_day();
      if (prayer) return day[prayer];
      return Object.keys(day).length ? day : undefined;
    },
```

and add this to the injected source in `vm.runInContext`, beside `__setState`:

```js
     globalThis.__state_day = () => ((data[me]||{}).days||{})[date] || {};
```

- [ ] **Step 2: Write the login tests**

Create `tests/client/login.test.js`:

```js
const { loadClient } = require("./harness");

module.exports = {
  "login screen lists names fetched from the server"(assert) {
    const client = loadClient({ expose: ["loginScreen"] });
    client.setState({ members: [], data: {}, me: null, token: "" });
    const html = client.loginScreen();
    assert.ok(html.includes("Kim ekanligingizni tanlang"), "expected the name picker");
  },

  "the app still calls the public name list"(assert) {
    const { clientSource } = require("./harness");
    assert.ok(clientSource().includes('api("/auth/members")'));
  },
};
```

- [ ] **Step 3: Run both suites**

Run: `node tests/client/run.js && ./.venv/bin/python -m pytest -q`
Expected: all client tests pass, all Python tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/client
git commit -m "test: pin prayer marking and the login screen before circles change them"
```

---

## Task 5: The circles tables

**Files:**
- Create: `migrations/005_circles.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/005_circles.sql`:

```sql
-- Circles: who can see whom.
--
-- Personal records stay attached to the member, exactly where they are. A circle
-- only answers "who is shown together", which is why a person can be in a friends
-- circle and a family at once while marking a prayer once.

CREATE TABLE IF NOT EXISTS circles (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL,
    kind       TEXT        NOT NULL CHECK (kind IN ('friends', 'family')),
    owner_id   TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    week_goal  INTEGER     NOT NULL DEFAULT 25 CHECK (week_goal BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS circle_members (
    circle_id BIGINT      NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    member_id TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (circle_id, member_id)
);

CREATE INDEX IF NOT EXISTS circle_members_member_idx ON circle_members (member_id);

-- Backfill: the people already using the app become one friends circle, owned by
-- whoever joined first. On a database with no members yet this inserts nothing and
-- seeding creates the circle instead (see repository.seed_members_if_empty).
INSERT INTO circles (name, kind, owner_id)
SELECT 'Do''stlar', 'friends', id FROM members ORDER BY created_at LIMIT 1;

INSERT INTO circle_members (circle_id, member_id)
SELECT c.id, m.id FROM circles c CROSS JOIN members m
WHERE c.kind = 'friends'
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/005_circles.sql
git commit -m "feat: add circles and circle_members, backfilling the current group"
```

---

## Task 6: The Circle model

**Files:**
- Modify: `app/models.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_repository.py`:

```python
from app.models import Circle


def test_circle_rejects_an_unknown_kind():
    with pytest.raises(Exception):
        Circle(id=1, name="Oila", kind="mosque", owner_id="sardor", week_goal=25)


def test_circle_rejects_an_impossible_week_goal():
    with pytest.raises(Exception):
        Circle(id=1, name="Oila", kind="family", owner_id="sardor", week_goal=0)
```

- [ ] **Step 2: Run to verify it fails**

Run: `./.venv/bin/python -m pytest tests/test_repository.py -k circle -v`
Expected: FAIL, `ImportError: cannot import name 'Circle'`.

- [ ] **Step 3: Add the model**

In `app/models.py`, immediately after the `Place` class, add:

```python
class Circle(BaseModel):
    """A group of people who see each other.

    Records belong to members, never to a circle: this only answers "who is shown
    together", which is what lets one person be in a friends circle and a family at
    the same time while marking a prayer once.
    """

    model_config = ConfigDict(extra="forbid")

    id: int
    name: str = Field(min_length=1, max_length=64)
    kind: Literal["friends", "family"]
    owner_id: str
    week_goal: int = Field(default=25, ge=1, le=100)

    _check_owner = field_validator("owner_id")(_validate_member_id)
```

- [ ] **Step 4: Run to verify it passes**

Run: `./.venv/bin/python -m pytest tests/test_repository.py -k circle -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_repository.py
git commit -m "feat: add the Circle model"
```

---

## Task 7: Circle queries

**Files:**
- Modify: `app/repository.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_repository.py`:

```python
CIRCLE_ROW = {
    "id": 1, "name": "Do'stlar", "kind": "friends",
    "owner_id": "sardor", "week_goal": 25,
}


@pytest.mark.asyncio
async def test_circles_for_member_reads_only_their_circles():
    connection = FakeConnection(rows={"FROM circles": [CIRCLE_ROW]})
    circles = await repository.fetch_circles_for(FakePool(connection), "sardor")
    assert [c.name for c in circles] == ["Do'stlar"]
    assert connection.args_for("FROM circles") == ("sardor",)


@pytest.mark.asyncio
async def test_membership_is_checked_against_the_join_table():
    connection = FakeConnection(scalars={"FROM circle_members": True})
    assert await repository.is_circle_member(FakePool(connection), 1, "sardor") is True


@pytest.mark.asyncio
async def test_state_is_limited_to_one_circle():
    connection = FakeConnection(rows=state_rows())
    await repository.fetch_group_state(FakePool(connection), circle_id=7)
    assert connection.issued("JOIN circle_members")
    assert 7 in connection.args_for("FROM members")
```

- [ ] **Step 2: Run to verify they fail**

Run: `./.venv/bin/python -m pytest tests/test_repository.py -k "circle" -v`
Expected: FAIL, `module 'app.repository' has no attribute 'fetch_circles_for'`.

- [ ] **Step 3: Add the queries**

In `app/repository.py`, add `Circle` to the `from app.models import (...)` block, then add above `fetch_group_state`:

```python
_CIRCLE_COLUMNS = "id, name, kind, owner_id, week_goal"


async def fetch_circles_for(pool: asyncpg.Pool, member_id: str) -> list[Circle]:
    """Every circle this member belongs to, oldest first."""
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            f"""
            SELECT {_CIRCLE_COLUMNS} FROM circles
             WHERE id IN (SELECT circle_id FROM circle_members WHERE member_id = $1)
             ORDER BY created_at
            """,
            member_id,
        )
    return [Circle(**dict(row)) for row in rows]


async def is_circle_member(pool: asyncpg.Pool, circle_id: int, member_id: str) -> bool:
    """The single gate in front of every circle-scoped read."""
    async with pool.acquire() as connection:
        return bool(
            await connection.fetchval(
                "SELECT true FROM circle_members WHERE circle_id = $1 AND member_id = $2",
                circle_id, member_id,
            )
        )
```

Then change `fetch_group_state`'s signature and its member query. Replace:

```python
async def fetch_group_state(pool: asyncpg.Pool) -> GroupState:
    """Load every member and everything they have logged."""
    async with pool.acquire() as connection:
        member_rows = await connection.fetch(
            f"SELECT {_MEMBER_COLUMNS} FROM members ORDER BY created_at"
        )
```

with:

```python
async def fetch_group_state(pool: asyncpg.Pool, circle_id: int) -> GroupState:
    """Load one circle's members and everything they have logged.

    The record tables are read whole and filtered in Python rather than joined per
    table: there are five of them, the group is small, and one join condition in one
    place is easier to keep correct than five.
    """
    async with pool.acquire() as connection:
        member_rows = await connection.fetch(
            """
            SELECT m.id, m.name, m.city, m.lat, m.lng, m.tz, m.asr, m.fa, m.ia
              FROM members m
              JOIN circle_members cm ON cm.member_id = m.id
             WHERE cm.circle_id = $1
             ORDER BY m.created_at
            """,
            circle_id,
        )
```

At the end of the same function, before building `data`, drop records belonging to
anyone outside the circle. Replace:

```python
    members = [MemberProfile(**dict(row)) for row in member_rows]
```

with:

```python
    members = [MemberProfile(**dict(row)) for row in member_rows]
    inside = {member.id for member in members}
    for bucket in (days, bonuses, tasks, books, places):
        for member_id in list(bucket):
            if member_id not in inside:
                del bucket[member_id]
```

- [ ] **Step 4: Run to verify they pass**

Run: `./.venv/bin/python -m pytest tests/test_repository.py -v`
Expected: all pass except `test_fetch_group_state_returns_every_member`, which now fails on the missing argument.

- [ ] **Step 5: Update the pinned test to the new shape**

The members query no longer reads `FROM members ORDER BY created_at`, so the fake's row
key stops matching and the helper hands back nothing. In `tests/test_repository.py` change
the first key of `state_rows` from `"FROM members ORDER BY created_at"` to `"FROM members m"`,
then replace `test_fetch_group_state_returns_every_member` with:

```python
@pytest.mark.asyncio
async def test_fetch_group_state_returns_the_circle_members():
    connection = FakeConnection(rows=state_rows())
    state = await repository.fetch_group_state(FakePool(connection), circle_id=1)
    assert [m.id for m in state.members] == ["sardor"]
```

Run: `./.venv/bin/python -m pytest -q`
Expected: every test passes except `tests/test_api.py::test_state_returns_the_whole_group`, which Task 8 fixes.

- [ ] **Step 6: Commit**

```bash
git add app/repository.py tests/test_repository.py
git commit -m "feat: scope group state to a circle"
```

---

## Task 8: Circle-scoped `/state` and a `/circles` endpoint

**Files:**
- Modify: `app/main.py`

- [ ] **Step 1: Write the failing tests**

Replace `test_state_returns_the_whole_group` in `tests/test_api.py` with:

```python
MEMBER_JSON = {
    "id": "sardor", "name": "Sardor", "city": "Toshkent", "lat": 41.3,
    "lng": 69.2, "tz": 5.0, "asr": 2, "fa": 18.0, "ia": 18.0,
}


@pytest.mark.asyncio
async def test_circles_lists_only_mine(api, connection):
    headers = as_session(connection)
    connection.rows["FROM circles"] = [{
        "id": 1, "name": "Do'stlar", "kind": "friends",
        "owner_id": "sardor", "week_goal": 25,
    }]
    async with api as client:
        response = await client.get("/api/v1/circles", headers=headers)
    assert response.status_code == 200
    assert response.json()["circles"][0]["name"] == "Do'stlar"


@pytest.mark.asyncio
async def test_state_refuses_a_circle_you_are_not_in(api, connection):
    headers = as_session(connection)
    connection.scalars["FROM circle_members"] = None
    async with api as client:
        response = await client.get("/api/v1/state?circle=9", headers=headers)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_your_circle"


@pytest.mark.asyncio
async def test_state_returns_the_circle(api, connection):
    headers = as_session(connection)
    connection.scalars["FROM circle_members"] = True
    connection.rows["FROM members m"] = [MEMBER_JSON]
    async with api as client:
        response = await client.get("/api/v1/state?circle=1", headers=headers)
    assert response.status_code == 200
    assert [m["id"] for m in response.json()["members"]] == ["sardor"]
```

- [ ] **Step 2: Run to verify they fail**

Run: `./.venv/bin/python -m pytest tests/test_api.py -v`
Expected: FAIL — 404 on `/circles`, and `/state` still ignores `circle`.

- [ ] **Step 3: Add the endpoint and the guard**

In `app/main.py`, replace the whole `get_state` function with:

```python
async def _require_circle(request: Request, session: Session, circle: int | None) -> int:
    """Resolve which circle a read is about, and prove the caller belongs to it.

    Omitting `circle` means "my first one", so a client that has not caught up still
    gets a sensible answer instead of an error.
    """
    pool: asyncpg.Pool = request.app.state.pool
    if circle is None:
        mine = await repository.fetch_circles_for(pool, session.member_id or "")
        if not mine:
            raise _error("no_circle", "Siz hech qaysi doirada emassiz", status.HTTP_404_NOT_FOUND)
        return mine[0].id
    if not await repository.is_circle_member(pool, circle, session.member_id or ""):
        raise _error("not_your_circle", "Bu doira sizniki emas", status.HTTP_403_FORBIDDEN)
    return circle


@app.get(f"{API_PREFIX}/circles")
async def list_circles(request: Request, session: Session = Depends(require_session)) -> dict:
    """The circles this member belongs to. Drives the switcher in the client."""
    circles = await repository.fetch_circles_for(
        request.app.state.pool, session.member_id or ""
    )
    return {"circles": [c.model_dump() for c in circles]}


@app.get(f"{API_PREFIX}/state")
async def get_state(
    request: Request, circle: int | None = None,
    session: Session = Depends(require_session),
) -> dict:
    """One circle's profiles and records. A circle is only readable from inside it."""
    circle_id = await _require_circle(request, session, circle)
    state = await repository.fetch_group_state(request.app.state.pool, circle_id)
    return state.to_wire()
```

- [ ] **Step 4: Run to verify they pass**

Run: `./.venv/bin/python -m pytest tests/test_api.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/main.py tests/test_api.py
git commit -m "feat: serve state per circle and list a member's circles"
```

---

## Task 9: The roster follows the circle

**Files:**
- Modify: `app/repository.py`
- Modify: `app/main.py`

- [ ] **Step 1: Write the failing test**

Replace `test_roster_is_admin_only` in `tests/test_api.py` with:

```python
@pytest.mark.asyncio
async def test_roster_refuses_a_circle_you_do_not_own(api, connection):
    headers = as_session(connection)
    connection.rows["FROM circles WHERE id"] = [{
        "id": 1, "name": "Oila", "kind": "family",
        "owner_id": "behruz", "week_goal": 25,
    }]
    async with api as client:
        response = await client.get("/api/v1/circles/1/roster", headers=headers)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_circle_owner"


@pytest.mark.asyncio
async def test_owner_sees_the_roster_with_pins(api, connection, settings):
    from app.security import encrypt_pin

    headers = as_session(connection)
    connection.rows["FROM circles WHERE id"] = [{
        "id": 1, "name": "Do'stlar", "kind": "friends",
        "owner_id": "sardor", "week_goal": 25,
    }]
    connection.rows["pin_encrypted"] = [{
        "id": "behruz", "name": "Behruz", "city": "Dubay",
        "pin_encrypted": encrypt_pin("1234", settings.pin_encryption_key),
    }]
    async with api as client:
        response = await client.get("/api/v1/circles/1/roster", headers=headers)
    assert response.status_code == 200
    assert response.json()["members"][0]["pin"] == "1234"
```

- [ ] **Step 2: Run to verify it fails**

Run: `./.venv/bin/python -m pytest tests/test_api.py -k roster -v`
Expected: FAIL with 404.

- [ ] **Step 3: Add the queries**

In `app/repository.py`, add beside `is_circle_member`:

```python
async def fetch_circle(pool: asyncpg.Pool, circle_id: int) -> Circle | None:
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            f"SELECT {_CIRCLE_COLUMNS} FROM circles WHERE id = $1", circle_id
        )
    return None if row is None else Circle(**dict(row))
```

and change `fetch_roster` to take a circle:

```python
async def fetch_roster(pool: asyncpg.Pool, circle_id: int, key: str) -> list[RosterEntry]:
    """One circle's members with their PINs decrypted. Owner only, by design."""
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT m.id, m.name, m.city, m.pin_encrypted FROM members m
              JOIN circle_members cm ON cm.member_id = m.id
             WHERE cm.circle_id = $1
             ORDER BY m.created_at
            """,
            circle_id,
        )
    return [
        RosterEntry(
            id=row["id"], name=row["name"], city=row["city"],
            pin=decrypt_pin(row["pin_encrypted"], key),
        )
        for row in rows
    ]
```

- [ ] **Step 4: Replace the endpoint**

In `app/main.py`, replace the whole `admin_roster` function with:

```python
@app.get(f"{API_PREFIX}/circles/{{circle_id}}/roster")
async def circle_roster(
    circle_id: int, request: Request, session: Session = Depends(require_session)
) -> dict:
    """A circle's members with PINs in the clear, for its owner only.

    This replaces the single global admin roster: with families in the picture,
    "everyone" is no longer a group anybody should be able to enumerate.
    """
    pool: asyncpg.Pool = request.app.state.pool
    circle = await repository.fetch_circle(pool, circle_id)
    if circle is None or circle.owner_id != session.member_id:
        raise _error("not_circle_owner", "Bu doira sizniki emas", status.HTTP_403_FORBIDDEN)
    entries = await repository.fetch_roster(
        pool, circle_id, request.app.state.settings.pin_encryption_key
    )
    return {"members": [e.model_dump() for e in entries]}
```

- [ ] **Step 5: Run to verify they pass**

Run: `./.venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/repository.py app/main.py tests/test_api.py
git commit -m "feat: replace the global roster with a per-circle one"
```

---

## Task 10: Stop publishing everyone's name

**Files:**
- Modify: `app/main.py`
- Modify: `app/repository.py`
- Modify: `app/models.py`

- [ ] **Step 1: Write the failing test**

Replace `test_login_names_are_public` in `tests/test_api.py` with:

```python
@pytest.mark.asyncio
async def test_the_name_list_is_gone(api, connection):
    """Publishing every name would leak the names of other people's families."""
    async with api as client:
        response = await client.get("/api/v1/auth/members")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_login_still_works_by_id_and_pin(api, connection, settings):
    from app.security import encrypt_pin

    # fetch_encrypted_pin uses fetchrow, which reads `rows` — not `scalars`.
    connection.rows["SELECT pin_encrypted"] = [
        {"pin_encrypted": encrypt_pin("1234", settings.pin_encryption_key)}
    ]
    async with api as client:
        response = await client.post(
            "/api/v1/auth/login", json={"member_id": "sardor", "pin": "1234"}
        )
    assert response.status_code == 200
    assert response.json()["member_id"] == "sardor"
```

- [ ] **Step 2: Run to verify it fails**

Run: `./.venv/bin/python -m pytest tests/test_api.py -k "name_list or login_still" -v`
Expected: FAIL — the endpoint still answers 200.

- [ ] **Step 3: Delete the endpoint and its query**

In `app/main.py`, delete the whole `list_login_names` function and its decorator, and remove `fetch_public_members` from any import.

In `app/repository.py`, delete `fetch_public_members` and remove `PublicMember` from the `from app.models import (...)` block.

In `app/models.py`, delete the `PublicMember` class.

- [ ] **Step 4: Run to verify they pass**

Run: `./.venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/main.py app/repository.py app/models.py tests/test_api.py
git commit -m "feat: drop the public name list so families are not enumerable"
```

---

## Task 11: A fresh database gets a circle too

**Files:**
- Modify: `app/repository.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_repository.py`:

```python
@pytest.mark.asyncio
async def test_seeding_an_empty_database_creates_the_friends_circle():
    connection = FakeConnection(scalars={"count(*)": 0})
    spec = "sardor:Sardor:Toshkent:41.3:69.2:5:2:18:18"
    await repository.seed_members_if_empty(FakePool(connection), spec, Fernet.generate_key().decode())
    assert connection.issued("INSERT INTO circles")
    assert connection.issued("INSERT INTO circle_members")
```

Add `from cryptography.fernet import Fernet` to the imports at the top of the file.

- [ ] **Step 2: Run to verify it fails**

Run: `./.venv/bin/python -m pytest tests/test_repository.py -k seeding -v`
Expected: FAIL, no `INSERT INTO circles`.

- [ ] **Step 3: Create the circle while seeding**

In `app/repository.py`, replace the body of `seed_members_if_empty` after the members loop with:

```python
    if seeded:
        async with pool.acquire() as connection:
            circle_id = await connection.fetchval(
                """
                INSERT INTO circles (name, kind, owner_id)
                VALUES ('Do''stlar', 'friends', $1) RETURNING id
                """,
                seeded[0].id,
            )
            await connection.executemany(
                "INSERT INTO circle_members (circle_id, member_id) VALUES ($1,$2)",
                [(circle_id, member.id) for member in seeded],
            )
        logger.info("Seeded %d members with generated PINs (see the roster)", len(seeded))
    return len(seeded)
```

- [ ] **Step 4: Run to verify it passes**

Run: `./.venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/repository.py tests/test_repository.py
git commit -m "feat: give a freshly seeded database its friends circle"
```

---

## Task 12: Login by id and PIN

**Files:**
- Modify: `static/index.html`
- Modify: `tests/client/login.test.js`

- [ ] **Step 1: Write the failing tests**

Replace `tests/client/login.test.js` with:

```js
const { loadClient, clientSource } = require("./harness");

module.exports = {
  "the public name list is no longer requested"(assert) {
    assert.ok(!clientSource().includes('api("/auth/members")'));
  },

  "the login screen asks for a login and a PIN"(assert) {
    const client = loadClient({ expose: ["loginScreen"] });
    client.setState({ members: [], data: {}, me: null, token: "" });
    const html = client.loginScreen();
    assert.ok(html.includes('id="lg_id"'), "expected a login field");
    assert.ok(html.includes('id="lg_pin"'), "expected a PIN field");
    assert.ok(!html.includes("A.pickLogin"), "the name picker should be gone");
  },
};
```

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/client/run.js`
Expected: both fail.

- [ ] **Step 3: Replace the login screen**

In `static/index.html`, inside `loginScreen()`, replace everything from the line
`if(!adminMode){` through the line `}else{` **inclusive**. The replacement below opens and
closes that same branch, so the admin branch after it stays untouched:

```js
 if(!adminMode){
  /* Ismlar ro'yxati olib tashlandi: u sahifani ochgan har kimga boshqalarning
     oilasidagi ayol va bolalar ismini ko'rsatib qo'yardi. Login birinchi
     muvaffaqiyatli kirishdan keyin telefonda saqlanadi, ya'ni yozish bir marta. */
  h+=`<div class="panel p14 mb10">
   <div class="label" style="margin-top:0">Login</div>
   <input id="lg_id" class="input" autocapitalize="none" autocorrect="off"
     placeholder="masalan: sardor" value="${esc(LS.get("nd_login",""))}">
   <div class="label">PIN kod</div>
   <input id="lg_pin" class="input" type="password" inputmode="numeric" maxlength="4"
     placeholder="4 raqam" onkeydown="if(event.key==='Enter')A.doLogin()">
   <button class="btn btn-gold btn-wide" style="margin-top:12px" onclick="A.doLogin()">Kirish</button>
   ${loginErr?`<div class="clay small" style="margin-top:9px">${esc(loginErr)}</div>`:""}
  </div>`;
 }else{
```

- [ ] **Step 4: Rewrite `doLogin` and drop the name loading**

In `static/index.html`, replace `A.doLogin` with:

```js
 async doLogin(){
  const id=((document.getElementById("lg_id")||{}).value||"").trim().toLowerCase();
  const v=(document.getElementById("lg_pin")||{}).value||"";
  if(!id){loginErr="Loginni yozing";render();return}
  try{
   const j=await api("/auth/login",{method:"POST",
     body:JSON.stringify({member_id:id,pin:v})});
   token=j.token;isAdmin=false;LS.set("nd_token",token);LS.set("nd_admin",false);
   me=id;LS.set("nd_me",id);LS.set("nd_login",id);data={};LS.set("nd_data",data);
   screen="app";loginErr="";
   await pull();if(M(me))date=todayFor(myCfg());render();
  }catch(e){
   loginErr=e.status===429?"Juda ko'p urinish - biroz kuting":"Login yoki PIN noto'g'ri";render()}},
```

Delete `A.loadNames` entirely. Remove the `await A.loadNames();` line from `A.boot`, and remove `await A.loadNames();` from `A.logout` (leave `render()`). Delete `A.pickLogin`. In the state declarations, delete `loginNames=[],loginPick=null,` from the `let` line.

Finally, in `loginScreen()`, delete the line that reads:

```js
  if(!loginNames.length)h+=`<p class="clay small">Serverga ulanib bo'lmadi. Internetni tekshiring.</p>`;
```

- [ ] **Step 5: Run to verify they pass**

Run: `node tests/client/run.js`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add static/index.html tests/client/login.test.js
git commit -m "feat: log in with a login and PIN instead of picking from a public list"
```

---

## Task 13: The circle switcher

**Files:**
- Modify: `static/index.html`
- Modify: `tests/client/login.test.js`

- [ ] **Step 1: Write the failing test**

Append to the object in `tests/client/login.test.js`:

```js
  "state is fetched for the selected circle"(assert) {
    const source = clientSource();
    assert.ok(source.includes('api("/circles")'), "expected the circle list to be loaded");
    assert.ok(/\/state\?circle=/.test(source), "expected state to be circle-scoped");
  },

  "the switcher is hidden until there is more than one circle"(assert) {
    const client = loadClient({ expose: ["circleSwitcher"] });
    client.setState({ members: [], data: {}, me: "sardor", token: "tok" });
    assert.strictEqual(client.circleSwitcher([]), "");
    assert.strictEqual(client.circleSwitcher([{ id: 1, name: "Do'stlar" }]), "");
    assert.ok(client.circleSwitcher([
      { id: 1, name: "Do'stlar" }, { id: 2, name: "Oila" },
    ]).includes("Oila"));
  },
```

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/client/run.js`
Expected: both fail.

- [ ] **Step 3: Add circle state and loading**

In `static/index.html`, beside the other `let` declarations (the line holding `screen`, `tab`, `date`), add:

```js
let circles=LS.get("nd_circles",[]),circleId=LS.get("nd_circle",null);
```

Add to the `A` object, next to `loadRoster`:

```js
 async loadCircles(){
  try{
   const j=await api("/circles");circles=j.circles;LS.set("nd_circles",circles);
   if(!circles.some(c=>c.id===circleId))circleId=circles.length?circles[0].id:null;
   LS.set("nd_circle",circleId);
  }catch(e){circles=LS.get("nd_circles",[])}},
 async setCircle(id){
  circleId=id;LS.set("nd_circle",id);
  data={};LS.set("nd_data",data);
  window.scrollTo(0,0);render();await pull();render()},
```

- [ ] **Step 4: Make `pull` circle-aware**

In `static/index.html`, in `pull()`, replace:

```js
   const j=await api("/state");
```

with:

```js
   const j=await api("/state"+(circleId?"?circle="+encodeURIComponent(circleId):""));
```

In `A.boot`, replace `else{screen="app";await pull();if(M(me))date=todayFor(myCfg())}` with:

```js
     else{screen="app";await A.loadCircles();await pull();if(M(me))date=todayFor(myCfg())}
```

In `A.doLogin`, replace `await pull();if(M(me))date=todayFor(myCfg());render();` with:

```js
   await A.loadCircles();await pull();if(M(me))date=todayFor(myCfg());render();
```

- [ ] **Step 5: Render the switcher**

In `static/index.html`, add above `function render(){`:

```js
/* Doira almashtirgichi. Bitta doira bo'lsa ko'rsatilmaydi — tanlanadigan narsa
   yo'q joyda tugma qatori shovqindan boshqa narsa emas. */
function circleSwitcher(list){
 if(!list||list.length<2)return "";
 const on="background:var(--brass);color:#0D1220;border-color:transparent;font-weight:600";
 return `<div class="flex gap2 mb14" style="flex-wrap:wrap">`+list.map(c=>
   `<button class="btn" style="${c.id===circleId?on:""}"
     onclick="A.setCircle(${c.id})">${esc(c.name)}</button>`).join("")+`</div>`}
```

In `render()`, insert the switcher immediately after the ayat line. Replace:

```js
 h+= tab==="today"?todayTab()
```

with:

```js
 h+=circleSwitcher(circles);
 h+= tab==="today"?todayTab()
```

- [ ] **Step 6: Run to verify they pass**

Run: `node tests/client/run.js && ./.venv/bin/python -m pytest -q`
Expected: everything passes.

- [ ] **Step 7: Commit**

```bash
git add static/index.html tests/client/login.test.js
git commit -m "feat: add the circle switcher and fetch state per circle"
```

---

## Task 13b: The roster follows the circle owner in the client

Task 9 removed `GET /api/v1/admin/roster`, but the client still calls it from five
places. Left alone, the admin screen shows "Ro'yxatni olib bo'lmadi" and Sardor can no
longer read out PINs. The roster now belongs to a circle's owner, so the client has to
ask as the owner rather than as the admin — an admin session has `member_id = None` and
therefore owns nothing.

This task comes after Task 13 because it needs `circleId`, which Task 13 introduces.

**Files:**
- Modify: `static/index.html`
- Modify: `tests/client/login.test.js`

- [ ] **Step 1: Write the failing tests**

Append to the object in `tests/client/login.test.js`:

```js
  "the roster is asked for per circle, not per admin"(assert) {
    const source = clientSource();
    assert.ok(!source.includes('api("/admin/roster")'), "the old endpoint is gone");
    assert.ok(/\/circles\/"\s*\+/.test(source) || source.includes("/roster"),
      "expected a circle roster call");
  },

  "settings show the roster only to the circle's owner"(assert) {
    const client = loadClient({ expose: ["ownsCircle"] });
    client.setState({
      members: [{ id: "sardor", name: "Sardor", city: "Toshkent",
                  lat: 41.3, lng: 69.2, tz: 5, asr: 2, fa: 18, ia: 18 }],
      data: { sardor: { days: {}, bonuses: [], tasks: [], books: [], places: [] } },
      me: "sardor", date: "2026-08-22", token: "tok",
    });
    assert.strictEqual(client.ownsCircle([{ id: 1, owner_id: "sardor" }], 1), true);
    assert.strictEqual(client.ownsCircle([{ id: 1, owner_id: "behruz" }], 1), false);
    assert.strictEqual(client.ownsCircle([], 1), false);
  },
```

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/client/run.js`
Expected: both fail.

- [ ] **Step 3: Ask the server as the owner**

In `static/index.html`, replace `A.loadRoster` with:

```js
 async loadRoster(){
  /* The roster belongs to a circle's owner now. An admin session owns nothing, so
     this is reached by logging in as yourself, not with the admin password. */
  if(!circleId){roster=[];adminErr="Doira tanlanmagan";return}
  try{const j=await api("/circles/"+encodeURIComponent(circleId)+"/roster");
   roster=j.members;adminErr=""}
  catch(e){roster=[];adminErr=e.message||"Ro'yxatni olib bo'lmadi"}},
```

- [ ] **Step 4: Add the ownership test and load the roster on demand**

In `static/index.html`, add above `function syncScreen(){`:

```js
/* Whether `me` owns the circle currently being viewed. Only the owner is shown the
   PINs, because those are what gets read out to a new member. */
function ownsCircle(list,id){
 const found=(list||[]).find(c=>c.id===id);
 return !!found&&found.owner_id===me}
```

Replace `A.go` with:

```js
 async go(s){
  screen=s;pinErr="";loginErr="";adminErr="";
  if(s==="sync"&&ownsCircle(circles,circleId))await A.loadRoster();
  render()},
```

- [ ] **Step 5: Show the roster in Sozlamalar**

In `syncScreen()`, immediately before the line `<div class="label">PIN kodni o'zgartirish</div>`, insert:

```js
 ${ownsCircle(circles,circleId)?`<div class="label">Doira a'zolari</div>
  <p class="muted small" style="margin:0 0 9px;line-height:1.6">Siz shu doiraning egasisiz.
   Yangi a'zoga o'z PIN kodini shu yerdan aytasiz.</p>
  ${adminErr?`<div class="clay small mb10">${esc(adminErr)}</div>`:""}
  ${roster.map(m=>`<div class="panel p14 mb10 flex between center">
    <div><div style="font-family:var(--serif);font-size:17px">${esc(m.name)}</div>
     <div class="muted small" style="margin-top:3px">${esc(m.city)} · ${esc(m.id)}</div></div>
    <div style="text-align:right">
     <div class="brass" style="font-family:var(--serif);font-size:24px;letter-spacing:3px">${esc(m.pin)||"—"}</div>
     <div class="muted tiny">PIN</div></div></div>`).join("")}`:""}
```

- [ ] **Step 6: Trim the admin screen**

In `adminScreen()`, replace the `roster.forEach(...)` block — everything from `roster.forEach(m=>{` through the line ending `</div>`;});` — with:

```js
 h+=`<div class="panel p14 mb10"><p class="muted small" style="margin:0;line-height:1.7">
   PIN kodlarni ko'rish endi doira egasiga tegishli: o'z loginingiz bilan kiring va
   <b>Sozlamalar</b> bo'limidan ko'ring. Bu yerdan faqat yangi odam qo'shiladi.</p></div>`;
```

Also, in `A.boot` and `A.doAdminLogin`, delete the `await A.loadRoster();` calls — the admin screen no longer shows a roster. Delete `A.adminSetPin` and the `A.delMember`/roster buttons that referenced it if they are now unreachable; if `A.delMember` is still called from elsewhere, leave it.

- [ ] **Step 7: Run both suites**

Run: `node tests/client/run.js && ./.venv/bin/python -m pytest -q`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add static/index.html tests/client/login.test.js
git commit -m "feat: show a circle's PINs to its owner instead of to the admin"
```

**Known limitation to carry into stage 2:** the owner can now *read* PINs but not *reset*
them — `POST /members/{id}/pin` still requires being that member or the admin. Resetting
someone else's PIN therefore still needs the admin password. Stage 2 gives circle owners
that power when they gain the ability to add members.

---

## Task 14: Documentation and deploy

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the API table**

In `README.md`, in the API table, delete the `GET /api/v1/auth/members` row and the `GET /api/v1/admin/roster` row, then add:

```markdown
| GET | `/api/v1/circles` | session | The circles you belong to |
| GET | `/api/v1/state?circle=` | member of it | One circle's records |
| GET | `/api/v1/circles/{id}/roster` | its owner | That circle's members with PINs |
```

- [ ] **Step 2: Describe the layer**

Append to `README.md`:

```markdown
## Doiralar

A circle answers one question — who is shown together — and nothing else. Records stay
attached to the member, so one prayer marked once counts in every circle that person
belongs to, and a family can be invisible to a friends group without any data being
copied.

`GET /state` therefore takes a circle and refuses anyone outside it, the roster belongs
to a circle's owner rather than to one global admin, and the public name list is gone:
publishing every name would have meant publishing the names of other people's wives and
children.

`tests/` covers this: `pytest` for the API and repository against a fake pool (no
database required), and `node tests/client/run.js` for the browser app, loaded into a
sandbox by `tests/client/harness.js`.
```

- [ ] **Step 3: Run everything one last time**

Run: `./.venv/bin/python -m pytest -q && node tests/client/run.js`
Expected: all green.

- [ ] **Step 4: Commit and push**

```bash
git add README.md
git commit -m "docs: describe circles and how to run the test suite"
git push origin main
```

- [ ] **Step 5: Deploy and verify**

Auto-deploy is off. Trigger a build of the existing `namoz-web` service from the tip of
`main` using the Railway MCP `railway-agent`'s `deployServiceTool` on service
`761a22d2-6991-4151-b20d-8ea547916e96`. Then check:

```bash
B=https://namoz-web-production.up.railway.app
curl -s $B/health
curl -s -o /dev/null -w "%{http_code}\n" $B/api/v1/auth/members   # expect 404
```

Confirm in the deploy logs that `005_circles.sql` was applied, then log in on a phone
and check that Bugun, Reyting and Nishon show the same numbers as before.

---

## Verification

Stage 1 is done when all of the following hold:

- `./.venv/bin/python -m pytest -q` and `node tests/client/run.js` are green
- `005_circles.sql` applied, and the three existing members are in one "Do'stlar" circle
- `/api/v1/auth/members` returns 404
- `/api/v1/state` without a circle still answers, using the caller's first circle
- `/api/v1/state?circle=<one you are not in>` returns 403 `not_your_circle`
- Logging in with a login and PIN works, and the login is remembered on the device
- The switcher is invisible while there is only one circle
- Bugun, Reyting, Kitob and Nishon show the same values they showed before this stage
