"""Database access. Every function takes a pool and returns validated models.

jsonb is encoded and decoded explicitly with `json` so the pool needs no custom
codecs and the round-trip is visible at the call site.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import date as Date, datetime, timedelta, timezone

import asyncpg

from app.config import (
    PIN_ATTEMPT_LIMIT,
    PIN_ATTEMPT_WINDOW_SECONDS,
    SESSION_TTL_DAYS,
)
from app.models import (
    Bonus,
    Book,
    DayRecord,
    GroupState,
    MemberCreate,
    MemberData,
    MemberProfile,
    PublicMember,
    RosterEntry,
    Session,
    Task,
)
from app.security import decrypt_pin, encrypt_pin, generate_pin, new_session_token

logger = logging.getLogger("namoz.repo")

_MEMBER_COLUMNS = "id, name, city, lat, lng, tz, asr, fa, ia"
_SEED_FIELD_COUNT = 9

# asyncpg binds parameters by their Postgres type, so a DATE column needs a real
# datetime.date. A ::date cast runs server-side after binding and does not rescue a
# string, which fails as "'str' object has no attribute 'toordinal'".
_UPSERT_DAY_SQL = """
    INSERT INTO day_records (member_id, day, entries)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (member_id, day)
    DO UPDATE SET entries = EXCLUDED.entries, updated_at = now()
"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- reads
async def fetch_group_state(pool: asyncpg.Pool) -> GroupState:
    """Load every member and everything they have logged."""
    async with pool.acquire() as connection:
        member_rows = await connection.fetch(
            f"SELECT {_MEMBER_COLUMNS} FROM members ORDER BY created_at"
        )
        day_rows = await connection.fetch(
            "SELECT member_id, day, entries FROM day_records ORDER BY day"
        )
        bonus_rows = await connection.fetch(
            "SELECT member_id, prayer, lvl, amt, day FROM bonuses ORDER BY id"
        )
        task_rows = await connection.fetch(
            "SELECT member_id, day, rakats, tasbih FROM tasks ORDER BY id"
        )
        book_rows = await connection.fetch(
            "SELECT member_id, book FROM books ORDER BY id"
        )

    days: dict[str, dict[str, DayRecord]] = defaultdict(dict)
    for row in day_rows:
        days[row["member_id"]][row["day"].isoformat()] = DayRecord(**json.loads(row["entries"]))

    bonuses: dict[str, list[Bonus]] = defaultdict(list)
    for row in bonus_rows:
        bonuses[row["member_id"]].append(
            Bonus(p=row["prayer"], lvl=row["lvl"], amt=float(row["amt"]), d=row["day"])
        )

    tasks: dict[str, list[Task]] = defaultdict(list)
    for row in task_rows:
        tasks[row["member_id"]].append(Task(d=row["day"], rak=row["rakats"], tas=row["tasbih"]))

    books: dict[str, list[Book]] = defaultdict(list)
    for row in book_rows:
        books[row["member_id"]].append(Book(**json.loads(row["book"])))

    members = [MemberProfile(**dict(row)) for row in member_rows]
    data = {
        member.id: MemberData(
            days=days.get(member.id, {}),
            bonuses=bonuses.get(member.id, []),
            tasks=tasks.get(member.id, []),
            books=books.get(member.id, []),
        )
        for member in members
    }
    return GroupState(members=members, data=data)


async def fetch_public_members(pool: asyncpg.Pool) -> list[PublicMember]:
    """Names for the login picker. The only thing readable without a session."""
    async with pool.acquire() as connection:
        rows = await connection.fetch("SELECT id, name FROM members ORDER BY created_at")
    return [PublicMember(id=row["id"], name=row["name"]) for row in rows]


async def fetch_roster(pool: asyncpg.Pool, key: str) -> list[RosterEntry]:
    """Admin view: every member with their PIN decrypted."""
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            "SELECT id, name, city, pin_encrypted FROM members ORDER BY created_at"
        )
    return [
        RosterEntry(
            id=row["id"], name=row["name"], city=row["city"],
            pin=decrypt_pin(row["pin_encrypted"], key),
        )
        for row in rows
    ]


async def fetch_encrypted_pin(pool: asyncpg.Pool, member_id: str) -> str | None:
    """The stored ciphertext, or None when the member does not exist."""
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            "SELECT pin_encrypted FROM members WHERE id = $1", member_id
        )
    return None if row is None else row["pin_encrypted"]


async def count_members(pool: asyncpg.Pool) -> int:
    async with pool.acquire() as connection:
        return await connection.fetchval("SELECT count(*) FROM members")


# ---------------------------------------------------------------- membership
async def create_member(pool: asyncpg.Pool, member: MemberCreate, key: str) -> MemberProfile:
    """Insert a member. Raises asyncpg.UniqueViolationError if the id is taken."""
    async with pool.acquire() as connection:
        await connection.execute(
            """
            INSERT INTO members (id, name, city, lat, lng, tz, asr, fa, ia, pin_encrypted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            member.id, member.name, member.city, member.lat, member.lng,
            member.tz, member.asr, member.fa, member.ia, encrypt_pin(member.pin, key),
        )
    return MemberProfile(**member.model_dump(exclude={"pin"}))


async def delete_member(pool: asyncpg.Pool, member_id: str) -> bool:
    """Remove a member and, by cascade, their records and sessions."""
    async with pool.acquire() as connection:
        result = await connection.execute("DELETE FROM members WHERE id = $1", member_id)
    return result.endswith(" 1")


async def set_pin(pool: asyncpg.Pool, member_id: str, pin: str, key: str) -> None:
    """Replace a member's PIN. Existing sessions stay valid on purpose: changing
    your own PIN should not log you out of the phone you are holding."""
    async with pool.acquire() as connection:
        await connection.execute(
            "UPDATE members SET pin_encrypted = $2, updated_at = now() WHERE id = $1",
            member_id, encrypt_pin(pin, key),
        )


# ---------------------------------------------------------------- sessions
async def create_session(
    pool: asyncpg.Pool, member_id: str | None, is_admin: bool = False
) -> str:
    token = new_session_token()
    expires_at = _now() + timedelta(days=SESSION_TTL_DAYS)
    async with pool.acquire() as connection:
        await connection.execute(
            """
            INSERT INTO sessions (token, member_id, is_admin, expires_at)
            VALUES ($1, $2, $3, $4)
            """,
            token, member_id, is_admin, expires_at,
        )
    return token


async def load_session(pool: asyncpg.Pool, token: str) -> Session | None:
    """Return the session and slide its expiry, or None if absent or expired."""
    if not token:
        return None
    expires_at = _now() + timedelta(days=SESSION_TTL_DAYS)
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            UPDATE sessions
               SET last_seen_at = now(), expires_at = $2
             WHERE token = $1 AND expires_at > now()
            RETURNING token, member_id, is_admin
            """,
            token, expires_at,
        )
    if row is None:
        return None
    return Session(
        token=row["token"], member_id=row["member_id"], is_admin=row["is_admin"]
    )


async def delete_session(pool: asyncpg.Pool, token: str) -> None:
    async with pool.acquire() as connection:
        await connection.execute("DELETE FROM sessions WHERE token = $1", token)


async def purge_expired_sessions(pool: asyncpg.Pool) -> int:
    async with pool.acquire() as connection:
        result = await connection.execute("DELETE FROM sessions WHERE expires_at <= now()")
    return int(result.rsplit(" ", 1)[-1] or 0)


# ---------------------------------------------------------------- throttle
async def is_locked_out(pool: asyncpg.Pool, subject: str) -> bool:
    """True while this subject has too many recent failures.

    Persisted rather than in-memory: a four-digit PIN is 10,000 guesses, and an
    in-process counter would hand an attacker a fresh budget on every redeploy.
    """
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            SELECT failures FROM pin_attempts
             WHERE subject = $1
               AND window_started_at > now() - ($2 || ' seconds')::interval
            """,
            subject, str(PIN_ATTEMPT_WINDOW_SECONDS),
        )
    return row is not None and row["failures"] >= PIN_ATTEMPT_LIMIT


async def record_failure(pool: asyncpg.Pool, subject: str) -> None:
    """Count one failed attempt, restarting the window if the old one lapsed."""
    async with pool.acquire() as connection:
        await connection.execute(
            """
            INSERT INTO pin_attempts (subject, failures, window_started_at)
            VALUES ($1, 1, now())
            ON CONFLICT (subject) DO UPDATE
               SET failures = CASE
                     WHEN pin_attempts.window_started_at
                          > now() - ($2 || ' seconds')::interval
                     THEN pin_attempts.failures + 1
                     ELSE 1 END,
                   window_started_at = CASE
                     WHEN pin_attempts.window_started_at
                          > now() - ($2 || ' seconds')::interval
                     THEN pin_attempts.window_started_at
                     ELSE now() END
            """,
            subject, str(PIN_ATTEMPT_WINDOW_SECONDS),
        )


async def clear_failures(pool: asyncpg.Pool, subject: str) -> None:
    async with pool.acquire() as connection:
        await connection.execute("DELETE FROM pin_attempts WHERE subject = $1", subject)


# ---------------------------------------------------------------- records
async def upsert_day(
    pool: asyncpg.Pool, member_id: str, day: Date, record: DayRecord
) -> None:
    """Write one day. This is the hot path: one tap in the app is one row."""
    async with pool.acquire() as connection:
        await connection.execute(
            _UPSERT_DAY_SQL, member_id, day, json.dumps(record.to_wire())
        )


async def replace_member_data(
    pool: asyncpg.Pool, member_id: str, data: MemberData
) -> None:
    """Replace a member's whole document in one transaction.

    Days are upserted rather than deleted-and-reinserted, so a client that pushes
    only a partial history never erases days it did not send. Bonuses, tasks and
    books are ledgers the client owns outright, so those are replaced wholesale.
    """
    async with pool.acquire() as connection, connection.transaction():
        for day, record in data.days.items():
            await connection.execute(
                _UPSERT_DAY_SQL,
                member_id, Date.fromisoformat(day), json.dumps(record.to_wire()),
            )
        await connection.execute("DELETE FROM bonuses WHERE member_id = $1", member_id)
        if data.bonuses:
            await connection.executemany(
                "INSERT INTO bonuses (member_id, prayer, lvl, amt, day) VALUES ($1,$2,$3,$4,$5)",
                [(member_id, b.p, b.lvl, b.amt, b.d) for b in data.bonuses],
            )
        await connection.execute("DELETE FROM tasks WHERE member_id = $1", member_id)
        if data.tasks:
            await connection.executemany(
                "INSERT INTO tasks (member_id, day, rakats, tasbih) VALUES ($1,$2,$3,$4)",
                [(member_id, t.d, t.rak, t.tas) for t in data.tasks],
            )
        await connection.execute("DELETE FROM books WHERE member_id = $1", member_id)
        if data.books:
            await connection.executemany(
                "INSERT INTO books (member_id, book) VALUES ($1,$2::jsonb)",
                [
                    (member_id, json.dumps(book.model_dump(mode="json")))
                    for book in data.books
                ],
            )


# ---------------------------------------------------------------- seeding
def parse_seed_members(spec: str) -> list[MemberCreate]:
    """Parse SEED_MEMBERS: 'id:Name:City:lat:lng:tz:asr:fa:ia' joined by '|'."""
    members: list[MemberCreate] = []
    for chunk in (part.strip() for part in spec.split("|") if part.strip()):
        fields = chunk.split(":")
        if len(fields) != _SEED_FIELD_COUNT:
            logger.warning("Skipping malformed SEED_MEMBERS entry: %s", chunk)
            continue
        member_id, name, city, lat, lng, tz, asr, fa, ia = fields
        members.append(
            MemberCreate(
                id=member_id, name=name, city=city, lat=float(lat), lng=float(lng),
                tz=float(tz), asr=int(asr), fa=float(fa), ia=float(ia),
                pin=generate_pin(),
            )
        )
    return members


async def seed_members_if_empty(pool: asyncpg.Pool, spec: str, key: str) -> int:
    """Populate the group on a fresh database. No-op once anyone exists.

    Each seeded member gets its own random PIN, which the admin reads off the
    roster and hands out. Nobody, including this process, needs to choose one.
    """
    if not spec or await count_members(pool) > 0:
        return 0
    seeded = parse_seed_members(spec)
    for member in seeded:
        await create_member(pool, member, key)
    if seeded:
        logger.info("Seeded %d members with generated PINs (see the admin roster)", len(seeded))
    return len(seeded)
