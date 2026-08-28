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
    DUEL_DAYS,
    PIN_ATTEMPT_LIMIT,
    PIN_ATTEMPT_WINDOW_SECONDS,
    SESSION_TTL_DAYS,
)
from app.models import (
    ALL_PRAYERS,
    Duel,
    DuelMember,
    Bonus,
    Book,
    Circle,
    DayRecord,
    JamoatCall,
    Khatm,
    KhatmJuz,
    Place,
    GroupState,
    MemberCreate,
    MemberData,
    MemberProfile,
    RosterEntry,
    Session,
    Task,
)
from app.security import decrypt_pin, encrypt_pin, generate_pin, new_session_token

logger = logging.getLogger("namoz.repo")

_MEMBER_COLUMNS = "id, name, city, lat, lng, tz, asr, fa, ia, is_child, work_shift, woman_mode, qazo_debt"
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


async def fetch_circle(pool: asyncpg.Pool, circle_id: int) -> Circle | None:
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            f"SELECT {_CIRCLE_COLUMNS} FROM circles WHERE id = $1", circle_id
        )
    return None if row is None else Circle(**dict(row))


async def count_circles_owned(pool: asyncpg.Pool, owner_id: str) -> int:
    async with pool.acquire() as connection:
        return int(await connection.fetchval(
            "SELECT count(*) AS owned FROM circles WHERE owner_id = $1", owner_id
        ) or 0)


async def count_circle_members(pool: asyncpg.Pool, circle_id: int) -> int:
    async with pool.acquire() as connection:
        return int(await connection.fetchval(
            "SELECT count(*) AS people FROM circle_members WHERE circle_id = $1",
            circle_id,
        ) or 0)


async def owns_circle_containing(
    pool: asyncpg.Pool, owner_id: str, member_id: str
) -> bool:
    """Whether `owner_id` owns some circle that `member_id` belongs to.

    This is what lets a family reset its own forgotten PIN. Without it the only way
    back in runs through the server password, which one person holds.
    """
    async with pool.acquire() as connection:
        return bool(await connection.fetchval(
            """
            SELECT true AS owns FROM circles c
              JOIN circle_members cm ON cm.circle_id = c.id
             WHERE c.owner_id = $1 AND cm.member_id = $2
            """,
            owner_id, member_id,
        ))


async def create_circle(
    pool: asyncpg.Pool, name: str, owner_id: str, week_goal: int
) -> Circle:
    """A new family, with its owner already inside it.

    Both rows go in one transaction on purpose: a circle whose owner is not a member
    of it would be invisible to the person who had just made it.
    """
    async with pool.acquire() as connection:
        async with connection.transaction():
            row = await connection.fetchrow(
                f"""
                INSERT INTO circles (name, kind, owner_id, week_goal)
                VALUES ($1, 'family', $2, $3)
                RETURNING {_CIRCLE_COLUMNS}
                """,
                name, owner_id, week_goal,
            )
            await connection.execute(
                "INSERT INTO circle_members (circle_id, member_id) VALUES ($1, $2)",
                row["id"], owner_id,
            )
    return Circle(**dict(row))


async def update_circle(
    pool: asyncpg.Pool, circle_id: int, name: str, week_goal: int
) -> Circle | None:
    """Rename a circle and move its weekly goal. None when it no longer exists."""
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            f"""
            UPDATE circles SET name = $2, week_goal = $3
             WHERE id = $1
             RETURNING {_CIRCLE_COLUMNS}
            """,
            circle_id, name, week_goal,
        )
    return None if row is None else Circle(**dict(row))


async def delete_circle(pool: asyncpg.Pool, circle_id: int) -> list[str]:
    """Delete a circle and report who is left in no circle at all.

    Nobody's records are touched: prayers, books, PINs and travel all hang off the
    member, not off the circle, so a person survives their family being closed. What
    does go with it is what belonged to the circle itself — its membership rows, its
    call to pray together and its khatm — and those cascade in the schema.

    The stranded names are read inside the same transaction and *before* the delete,
    because once the circle is gone there is nothing left to ask.
    """
    async with pool.acquire() as connection, connection.transaction():
        rows = await connection.fetch(
            """
            SELECT m.name
              FROM circle_members cm
              JOIN members m ON m.id = cm.member_id
             WHERE cm.circle_id = $1
               AND NOT EXISTS (
                   SELECT 1 FROM circle_members other
                    WHERE other.member_id = cm.member_id
                      AND other.circle_id <> $1)
             ORDER BY m.name
            """,
            circle_id,
        )
        await connection.execute("DELETE FROM circles WHERE id = $1", circle_id)
    return [row["name"] for row in rows]


async def set_work_shift(pool: asyncpg.Pool, member_id: str, work_shift: bool) -> bool:
    """Turn the shift concession on or off. False when there is no such member."""
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            "UPDATE members SET work_shift = $2, updated_at = now() WHERE id = $1 RETURNING id",
            member_id, work_shift,
        )
    return row is not None


async def set_woman_mode(pool: asyncpg.Pool, member_id: str, woman_mode: bool) -> bool:
    """Turn the women's concession on or off. False when there is no such member."""
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            "UPDATE members SET woman_mode = $2, updated_at = now() WHERE id = $1 RETURNING id",
            member_id, woman_mode,
        )
    return row is not None


async def set_qazo_debt(pool: asyncpg.Pool, member_id: str, qazo_debt: int) -> bool:
    """State how many prayers this member owes. False when there is no such member."""
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            "UPDATE members SET qazo_debt = $2, updated_at = now() WHERE id = $1 RETURNING id",
            member_id, qazo_debt,
        )
    return row is not None


async def add_to_circle(pool: asyncpg.Pool, circle_id: int, member_id: str) -> None:
    """Idempotent: adding somebody twice is the same as adding them once."""
    async with pool.acquire() as connection:
        await connection.execute(
            """
            INSERT INTO circle_members (circle_id, member_id) VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            circle_id, member_id,
        )


async def remove_from_circle(
    pool: asyncpg.Pool, circle_id: int, member_id: str
) -> bool:
    """Take somebody out of one circle, reporting whether they were in it.

    Their records are not touched. A person is not their membership: they keep
    everything they logged, and keep any other circle they are in.
    """
    async with pool.acquire() as connection:
        result = await connection.execute(
            "DELETE FROM circle_members WHERE circle_id = $1 AND member_id = $2",
            circle_id, member_id,
        )
    return result.endswith(" 1")


async def fetch_group_state(pool: asyncpg.Pool, circle_id: int) -> GroupState:
    """Load one circle's members and everything they have logged.

    The record tables are read whole and filtered in Python rather than joined per
    table: there are five of them, the group is small, and one join condition in one
    place is easier to keep correct than five.
    """
    async with pool.acquire() as connection:
        member_rows = await connection.fetch(
            """
            SELECT m.id, m.name, m.city, m.lat, m.lng, m.tz, m.asr, m.fa,
                   m.ia, m.is_child, m.work_shift, m.woman_mode, m.qazo_debt
              FROM members m
              JOIN circle_members cm ON cm.member_id = m.id
             WHERE cm.circle_id = $1
             ORDER BY m.created_at
            """,
            circle_id,
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
        place_rows = await connection.fetch(
            "SELECT member_id, place FROM places ORDER BY id"
        )
        # Two days back covers every timezone the group could be spread across, and
        # the client narrows it to its own day. A call from last week is not an
        # invitation, it is clutter on the screen.
        since = datetime.now(timezone.utc).date() - timedelta(days=2)
        call_rows = await connection.fetch(
            """
            SELECT day, prayer, caller_id FROM jamoat_calls
             WHERE circle_id = $1 AND day >= $2
             ORDER BY day, id
            """,
            circle_id, since,
        )
        khatm_row = await connection.fetchrow(
            """
            SELECT id, name, started, finished FROM khatms
             WHERE circle_id = $1 AND finished IS NULL
             ORDER BY id DESC LIMIT 1
            """,
            circle_id,
        )
        juz_rows = (
            []
            if khatm_row is None
            else await connection.fetch(
                """
                SELECT juz, member_id, done_at FROM khatm_juz
                 WHERE khatm_id = $1 ORDER BY juz
                """,
                khatm_row["id"],
            )
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

    places: dict[str, list[Place]] = defaultdict(list)
    for row in place_rows:
        places[row["member_id"]].append(Place(**json.loads(row["place"])))

    members = [MemberProfile(**dict(row)) for row in member_rows]
    inside = {member.id for member in members}
    for bucket in (days, bonuses, tasks, books, places):
        for member_id in list(bucket):
            if member_id not in inside:
                del bucket[member_id]
    data = {
        member.id: MemberData(
            days=days.get(member.id, {}),
            bonuses=bonuses.get(member.id, []),
            tasks=tasks.get(member.id, []),
            books=books.get(member.id, []),
            places=places.get(member.id, []),
        )
        for member in members
    }
    khatm = None if khatm_row is None else Khatm(
        **dict(khatm_row),
        juz=[
            KhatmJuz(
                juz=part["juz"], member_id=part["member_id"],
                done=part["done_at"] is not None,
            )
            for part in juz_rows
        ],
    )
    return GroupState(
        members=members,
        data=data,
        calls=[JamoatCall(**dict(row)) for row in call_rows],
        khatm=khatm,
        duels=await fetch_duels(pool, circle_id),
    )


# ---------------------------------------------------------------- duel
_DUEL_COLUMNS = "id, size, created_by, started, ends"


def _duels_from(duel_rows, member_rows) -> list[Duel]:
    """Stitch the two reads together. Kept out of the query so the same shaping is
    used whether one duel or a circle's worth was fetched."""
    people: dict[int, list[DuelMember]] = defaultdict(list)
    for row in member_rows:
        people[row["duel_id"]].append(
            DuelMember(
                member_id=row["member_id"], side=row["side"],
                confirmed=row["confirmed"],
            )
        )
    return [
        Duel(**dict(row), members=people.get(row["id"], []))
        for row in duel_rows
    ]


async def fetch_duels(pool: asyncpg.Pool, circle_id: int, limit: int = 40) -> list[Duel]:
    """A circle's duels, newest first. Results are not stored, so nothing is
    summarised here — the client scores them off the records it already holds."""
    async with pool.acquire() as connection:
        duel_rows = await connection.fetch(
            f"""
            SELECT {_DUEL_COLUMNS} FROM duels
             WHERE circle_id = $1 ORDER BY id DESC LIMIT $2
            """,
            circle_id, limit,
        )
        if not duel_rows:
            return []
        member_rows = await connection.fetch(
            """
            SELECT duel_id, member_id, side, confirmed FROM duel_members
             WHERE duel_id = ANY($1::bigint[]) ORDER BY side, member_id
            """,
            [row["id"] for row in duel_rows],
        )
    return _duels_from(duel_rows, member_rows)


async def fetch_duel(pool: asyncpg.Pool, duel_id: int) -> Duel | None:
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            f"SELECT {_DUEL_COLUMNS} FROM duels WHERE id = $1", duel_id
        )
        if row is None:
            return None
        member_rows = await connection.fetch(
            """
            SELECT duel_id, member_id, side, confirmed FROM duel_members
             WHERE duel_id = $1 ORDER BY side, member_id
            """,
            duel_id,
        )
    return _duels_from([row], member_rows)[0]


async def circle_of_duel(pool: asyncpg.Pool, duel_id: int) -> int | None:
    async with pool.acquire() as connection:
        return await connection.fetchval(
            "SELECT circle_id AS circle FROM duels WHERE id = $1", duel_id
        )


async def count_duels(pool: asyncpg.Pool, circle_id: int) -> int:
    """Open and running duels. A finished one costs nothing but a line of history."""
    async with pool.acquire() as connection:
        return int(await connection.fetchval(
            """
            SELECT count(*) AS live FROM duels
             WHERE circle_id = $1 AND (ends IS NULL OR ends >= CURRENT_DATE)
            """,
            circle_id,
        ) or 0)


async def create_duel(
    pool: asyncpg.Pool, circle_id: int, size: int, created_by: str,
    side1: list[str], side2: list[str],
) -> Duel:
    """Open a challenge. Whoever sent it has already accepted it by sending it."""
    async with pool.acquire() as connection, connection.transaction():
        row = await connection.fetchrow(
            f"""
            INSERT INTO duels (circle_id, size, created_by)
            VALUES ($1, $2, $3) RETURNING {_DUEL_COLUMNS}
            """,
            circle_id, size, created_by,
        )
        await connection.executemany(
            """
            INSERT INTO duel_members (duel_id, member_id, side, confirmed)
            VALUES ($1, $2, $3, $4)
            """,
            [
                (row["id"], member_id, side, member_id == created_by)
                for side, people in ((1, side1), (2, side2))
                for member_id in people
            ],
        )
    return Duel(
        **dict(row),
        members=[
            DuelMember(member_id=m, side=side, confirmed=m == created_by)
            for side, people in ((1, side1), (2, side2))
            for m in people
        ],
    )


async def confirm_duel(pool: asyncpg.Pool, duel_id: int, member_id: str) -> bool:
    """Accept a challenge, and start the week if that was the last acceptance.

    Both steps are one transaction: two people accepting at the same moment must not
    be able to leave a duel that everybody has accepted and nobody has started.
    """
    async with pool.acquire() as connection, connection.transaction():
        updated = await connection.fetchval(
            """
            UPDATE duel_members SET confirmed = true
             WHERE duel_id = $1 AND member_id = $2
             RETURNING true AS ok
            """,
            duel_id, member_id,
        )
        if not updated:
            return False
        waiting = await connection.fetchval(
            "SELECT count(*) AS waiting FROM duel_members WHERE duel_id = $1 AND NOT confirmed",
            duel_id,
        )
        if not waiting:
            await connection.execute(
                """
                UPDATE duels
                   SET started = CURRENT_DATE,
                       ends = CURRENT_DATE + ($2::int - 1)
                 WHERE id = $1 AND started IS NULL
                """,
                duel_id, DUEL_DAYS,
            )
    return True


async def delete_duel(pool: asyncpg.Pool, duel_id: int) -> bool:
    """Turn a challenge down, or take it back. Only ever before it starts."""
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            "DELETE FROM duels WHERE id = $1 AND started IS NULL RETURNING id", duel_id
        )
    return row is not None


async def fetch_roster(pool: asyncpg.Pool, circle_id: int, key: str) -> list[RosterEntry]:
    """One circle's members with their PINs decrypted. Owner only, by design."""
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT m.id, m.name, m.city, m.is_child, m.pin_encrypted FROM members m
              JOIN circle_members cm ON cm.member_id = m.id
             WHERE cm.circle_id = $1
             ORDER BY m.created_at
            """,
            circle_id,
        )
    return [
        RosterEntry(
            id=row["id"], name=row["name"], city=row["city"],
            is_child=row["is_child"], pin=decrypt_pin(row["pin_encrypted"], key),
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
# ---------------------------------------------------------------- oila
async def set_child(pool: asyncpg.Pool, member_id: str, is_child: bool) -> bool:
    """Turn debt and penalty work off for one person. False if nobody changed."""
    async with pool.acquire() as connection:
        result = await connection.execute(
            "UPDATE members SET is_child = $2, updated_at = now() WHERE id = $1",
            member_id, is_child,
        )
    return result.endswith(" 1")


async def call_jamoat(
    pool: asyncpg.Pool, circle_id: int, day: Date, prayer: str, caller_id: str
) -> JamoatCall:
    """Start "we are praying this one together", or join the call already standing.

    Two people reaching for the same prayer at once is the ordinary case in a house,
    not a race to lose: the second insert conflicts, and the row already there is
    returned as-is so both phones show the same call.
    """
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            INSERT INTO jamoat_calls (circle_id, day, prayer, caller_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (circle_id, day, prayer) DO UPDATE SET prayer = EXCLUDED.prayer
            RETURNING day, prayer, caller_id
            """,
            circle_id, day, prayer, caller_id,
        )
    return JamoatCall(**dict(row))


async def fetch_jamoat_calls(
    pool: asyncpg.Pool, circle_id: int, since: Date
) -> list[JamoatCall]:
    """Recent calls only. A call from last week is noise, not an invitation."""
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT day, prayer, caller_id FROM jamoat_calls
             WHERE circle_id = $1 AND day >= $2
             ORDER BY day, id
            """,
            circle_id, since,
        )
    return [JamoatCall(**dict(row)) for row in rows]


async def create_khatm(
    pool: asyncpg.Pool, circle_id: int, name: str, started: Date
) -> Khatm:
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            INSERT INTO khatms (circle_id, name, started)
            VALUES ($1, $2, $3)
            RETURNING id, name, started, finished
            """,
            circle_id, name, started,
        )
    return Khatm(**dict(row), juz=[])


async def fetch_open_khatm(pool: asyncpg.Pool, circle_id: int) -> Khatm | None:
    """The circle's unfinished khatm with the juz people have taken, if there is one."""
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            SELECT id, name, started, finished FROM khatms
             WHERE circle_id = $1 AND finished IS NULL
             ORDER BY id DESC LIMIT 1
            """,
            circle_id,
        )
        if row is None:
            return None
        taken = await connection.fetch(
            """
            SELECT juz, member_id, done_at FROM khatm_juz
             WHERE khatm_id = $1 ORDER BY juz
            """,
            row["id"],
        )
    return Khatm(
        **dict(row),
        juz=[
            KhatmJuz(
                juz=part["juz"], member_id=part["member_id"],
                done=part["done_at"] is not None,
            )
            for part in taken
        ],
    )


async def take_juz(
    pool: asyncpg.Pool, khatm_id: int, juz: int, member_id: str
) -> bool:
    """Claim a free juz. False when somebody already has it."""
    async with pool.acquire() as connection:
        result = await connection.execute(
            """
            INSERT INTO khatm_juz (khatm_id, juz, member_id) VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
            """,
            khatm_id, juz, member_id,
        )
    return result.endswith(" 1")


async def release_juz(
    pool: asyncpg.Pool, khatm_id: int, juz: int, member_id: str
) -> bool:
    """Give a juz back. Only yours, and only while it is still unread."""
    async with pool.acquire() as connection:
        result = await connection.execute(
            """
            DELETE FROM khatm_juz
             WHERE khatm_id = $1 AND juz = $2 AND member_id = $3 AND done_at IS NULL
            """,
            khatm_id, juz, member_id,
        )
    return result.endswith(" 1")


async def finish_juz(
    pool: asyncpg.Pool, khatm_id: int, juz: int, member_id: str
) -> bool:
    """Mark your own juz read. Already-read stays read, so this does not toggle."""
    async with pool.acquire() as connection:
        result = await connection.execute(
            """
            UPDATE khatm_juz SET done_at = now()
             WHERE khatm_id = $1 AND juz = $2 AND member_id = $3 AND done_at IS NULL
            """,
            khatm_id, juz, member_id,
        )
    return result.endswith(" 1")


async def close_khatm_if_complete(
    pool: asyncpg.Pool, khatm_id: int, day: Date
) -> bool:
    """Finish the khatm once all thirty are read. Nobody has to declare it done."""
    async with pool.acquire() as connection:
        result = await connection.execute(
            """
            UPDATE khatms SET finished = $2
             WHERE id = $1 AND finished IS NULL
               AND (SELECT count(*) FROM khatm_juz
                     WHERE khatm_id = $1 AND done_at IS NOT NULL) >= 30
            """,
            khatm_id, day,
        )
    return result.endswith(" 1")


async def khatm_belongs_to(pool: asyncpg.Pool, khatm_id: int, circle_id: int) -> bool:
    """Stops a member of one family from writing into another family's khatm."""
    async with pool.acquire() as connection:
        return bool(await connection.fetchval(
            "SELECT true AS ours FROM khatms WHERE id = $1 AND circle_id = $2",
            khatm_id, circle_id,
        ))


async def fetch_member_profile(
    pool: asyncpg.Pool, member_id: str
) -> MemberProfile | None:
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            f"SELECT {_MEMBER_COLUMNS} FROM members WHERE id = $1", member_id
        )
    return None if row is None else MemberProfile(**dict(row))


async def free_member_id(pool: asyncpg.Pool, base: str) -> str | None:
    """`zuhra`, or `zuhra2` when that login is taken. None when nothing is free.

    A circle's owner types a name, not a login, so a clash must not come back as an
    error for them to solve. The app picks the next free login and shows what it
    picked. Truncated to 30 so the suffix still fits the 32-character limit.
    """
    base = base[:30]
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            "SELECT id FROM members WHERE id = $1 OR id LIKE $2", base, base + "%"
        )
    taken = {row["id"] for row in rows}
    if base not in taken:
        return base
    for suffix in range(2, 21):
        candidate = f"{base}{suffix}"
        if candidate not in taken:
            return candidate
    return None


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


async def set_pin(pool: asyncpg.Pool, member_id: str, pin: str, key: str) -> bool:
    """Replace a member's PIN, reporting whether anybody was actually changed.

    The admin now types the login by hand rather than tapping it off a roster, so a
    typo has to come back as an error instead of a cheerful "PIN o'zgartirildi" for
    an account that does not exist.

    Existing sessions stay valid on purpose: changing your own PIN should not log you
    out of the phone you are holding.
    """
    async with pool.acquire() as connection:
        result = await connection.execute(
            "UPDATE members SET pin_encrypted = $2, updated_at = now() WHERE id = $1",
            member_id, encrypt_pin(pin, key),
        )
    return result.endswith(" 1")


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
def _merge_day(incoming: dict, stored: str | None) -> dict:
    """Reconcile a day the phone sent with the day already on record.

    Two rules, both of them about not letting a claim be taken back:

    * **Prayer marks are write-once.** Locking this in the browser alone would be
      decoration, since the API is the thing that actually holds the record. A mark
      already stored wins over whatever the phone sends — including a phone that
      sends the key back missing, which is what 'clear' looks like on the wire.
    * **Make-up counts only grow.** They are added to through the day, so they cannot
      be write-once, but a smaller number is an erasure and the larger one wins.

    `quran` and `sunnat` stay ordinary editable fields.
    """
    if not stored:
        return incoming
    prior = json.loads(stored)
    merged = dict(incoming)
    for key in ALL_PRAYERS:
        if prior.get(key) is not None:
            merged[key] = prior[key]
    kept = _keep_qazo_growing(incoming.get("qazo"), prior.get("qazo"))
    if kept is not None:
        merged["qazo"] = kept
    return merged


def _keep_qazo_growing(incoming: dict | None, prior: dict | None) -> dict | None:
    """The bigger of the two counts for each prayer. None when neither side has any."""
    if not prior:
        return incoming
    merged = dict(incoming or {})
    for prayer, count in prior.items():
        merged[prayer] = max(int(count), int(merged.get(prayer, 0)))
    return merged


async def upsert_day(
    pool: asyncpg.Pool,
    member_id: str,
    day: Date,
    record: DayRecord,
    allow_overwrite: bool = False,
) -> None:
    """Write one day. This is the hot path: one tap in the app is one row.

    `allow_overwrite` is the admin's key: a genuine mis-tap has to be fixable by
    somebody, and the admin is already the role that can do anything here.
    """
    async with pool.acquire() as connection, connection.transaction():
        entries = record.to_wire()
        if not allow_overwrite:
            stored = await connection.fetchval(
                "SELECT entries FROM day_records WHERE member_id = $1 AND day = $2 FOR UPDATE",
                member_id, day,
            )
            entries = _merge_day(entries, stored)
        await connection.execute(_UPSERT_DAY_SQL, member_id, day, json.dumps(entries))


async def replace_member_data(
    pool: asyncpg.Pool, member_id: str, data: MemberData, allow_overwrite: bool = False
) -> None:
    """Replace a member's whole document in one transaction.

    Days are upserted rather than deleted-and-reinserted, so a client that pushes
    only a partial history never erases days it did not send. Bonuses, tasks, books
    and places are ledgers the client owns outright, so those are replaced wholesale.
    """
    async with pool.acquire() as connection, connection.transaction():
        for day, record in data.days.items():
            when = Date.fromisoformat(day)
            entries = record.to_wire()
            if not allow_overwrite:
                stored = await connection.fetchval(
                    "SELECT entries FROM day_records WHERE member_id = $1 AND day = $2 FOR UPDATE",
                    member_id, when,
                )
                entries = _merge_day(entries, stored)
            await connection.execute(
                _UPSERT_DAY_SQL, member_id, when, json.dumps(entries)
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
        await connection.execute("DELETE FROM places WHERE member_id = $1", member_id)
        if data.places:
            await connection.executemany(
                "INSERT INTO places (member_id, place) VALUES ($1,$2::jsonb)",
                [
                    (member_id, json.dumps(place.model_dump(mode="json")))
                    for place in sorted(data.places, key=lambda p: p.d)
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
    if not seeded:
        return 0
    for member in seeded:
        await create_member(pool, member, key)
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
