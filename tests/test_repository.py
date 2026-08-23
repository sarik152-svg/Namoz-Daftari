import pytest

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
