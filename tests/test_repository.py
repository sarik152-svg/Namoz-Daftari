import pytest
from cryptography.fernet import Fernet

from tests.fakes import FakeConnection, FakePool


@pytest.mark.asyncio
async def test_fake_connection_records_sql():
    connection = FakeConnection(rows={"FROM members": [{"id": "sardor"}]})
    async with FakePool(connection).acquire() as held:
        rows = await held.fetch("SELECT id\n  FROM members")
    assert rows == [{"id": "sardor"}]
    assert connection.sql == ["SELECT id FROM members"]


import json

from app import repository
from app.models import DayRecord, MemberData

MEMBER_ROW = {
    "id": "sardor", "name": "Sardor", "city": "Toshkent",
    "lat": 41.3, "lng": 69.2, "tz": 5.0, "asr": 2, "fa": 18.0, "ia": 18.0,
}


def state_rows(**extra) -> dict:
    rows = {
        "FROM members m": [MEMBER_ROW],
        "FROM day_records": [], "FROM bonuses": [],
        "FROM tasks": [], "FROM books": [], "FROM places": [],
    }
    rows.update(extra)
    return rows


@pytest.mark.asyncio
async def test_fetch_group_state_returns_the_circle_members():
    connection = FakeConnection(rows=state_rows())
    state = await repository.fetch_group_state(FakePool(connection), circle_id=1)
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


from app.models import Circle


def test_circle_rejects_an_unknown_kind():
    with pytest.raises(Exception):
        Circle(id=1, name="Oila", kind="mosque", owner_id="sardor", week_goal=25)


def test_circle_rejects_an_impossible_week_goal():
    with pytest.raises(Exception):
        Circle(id=1, name="Oila", kind="family", owner_id="sardor", week_goal=0)


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


@pytest.mark.asyncio
async def test_seeding_an_empty_database_creates_the_friends_circle():
    connection = FakeConnection(scalars={"count(*)": 0})
    spec = "sardor:Sardor:Toshkent:41.3:69.2:5:2:18:18"
    await repository.seed_members_if_empty(
        FakePool(connection), spec, Fernet.generate_key().decode()
    )
    assert connection.issued("INSERT INTO circles")
    assert connection.issued("INSERT INTO circle_members")
