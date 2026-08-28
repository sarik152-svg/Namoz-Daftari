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
    "id": "sardor", "name": "Sardor", "city": "Toshkent", "is_child": False,
    "lat": 41.3, "lng": 69.2, "tz": 5.0, "asr": 2, "fa": 18.0, "ia": 18.0,
    "qazo_debt": 9125, "work_shift": True, "woman_mode": False,
}


def state_rows(**extra) -> dict:
    rows = {
        "FROM members m": [MEMBER_ROW],
        "FROM day_records": [], "FROM bonuses": [],
        "FROM tasks": [], "FROM books": [], "FROM places": [],
        "FROM jamoat_calls": [], "FROM khatms": [],
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
async def test_the_qazo_backlog_survives_a_reload():
    """It had nowhere to live: the model carried it, no table stored it, and every
    reload handed back a zero — which on screen looked like the save had failed."""
    connection = FakeConnection(rows=state_rows())
    state = await repository.fetch_group_state(FakePool(connection), circle_id=1)
    assert state.members[0].qazo_debt == 9125


@pytest.mark.asyncio
async def test_the_work_shift_flag_reaches_the_profile():
    connection = FakeConnection(rows=state_rows())
    state = await repository.fetch_group_state(FakePool(connection), circle_id=1)
    assert state.members[0].work_shift is True


@pytest.mark.asyncio
async def test_the_work_shift_flag_is_written_to_the_member():
    connection = FakeConnection(rows={"UPDATE members SET work_shift": [{"id": "shahriddin"}]})
    await repository.set_work_shift(FakePool(connection), "shahriddin", True)
    assert connection.args_for("UPDATE members SET work_shift")[1] is True


@pytest.mark.asyncio
async def test_the_backlog_is_written_to_the_member():
    connection = FakeConnection(rows={"UPDATE members": [{"id": "sardor"}]})
    await repository.set_qazo_debt(FakePool(connection), "sardor", 9125)
    assert connection.issued("UPDATE members")
    assert connection.args_for("UPDATE members")[1] == 9125


@pytest.mark.asyncio
async def test_a_qazo_count_may_grow_but_never_shrink():
    """Make-up prayers are counted up through the day, so the mark rule is bent one
    way only: a bigger number is an addition, a smaller one is an erasure."""
    stored = json.dumps({"qazo": {"bomdod": 5, "peshin": 2}})
    connection = FakeConnection(scalars={"SELECT entries": stored})
    await repository.upsert_day(
        FakePool(connection), "sardor", __import__("datetime").date(2026, 8, 22),
        DayRecord(qazo={"bomdod": 7, "peshin": 0}),
    )
    written = json.loads(connection.args_for("INSERT INTO day_records")[2])
    assert written["qazo"]["bomdod"] == 7
    assert written["qazo"]["peshin"] == 2


@pytest.mark.asyncio
async def test_a_day_sent_without_qazo_keeps_the_stored_count():
    """A phone that has not caught up sends the day back with the key missing."""
    stored = json.dumps({"qazo": {"asr": 4}})
    connection = FakeConnection(scalars={"SELECT entries": stored})
    await repository.upsert_day(
        FakePool(connection), "sardor", __import__("datetime").date(2026, 8, 22),
        DayRecord(bomdod={"s": "ontime", "t": "04:05"}),
    )
    written = json.loads(connection.args_for("INSERT INTO day_records")[2])
    assert written["qazo"]["asr"] == 4


@pytest.mark.asyncio
async def test_admin_may_correct_a_qazo_count():
    stored = json.dumps({"qazo": {"bomdod": 5}})
    connection = FakeConnection(scalars={"SELECT entries": stored})
    await repository.upsert_day(
        FakePool(connection), "sardor", __import__("datetime").date(2026, 8, 22),
        DayRecord(qazo={"bomdod": 1}), allow_overwrite=True,
    )
    written = json.loads(connection.args_for("INSERT INTO day_records")[2])
    assert written["qazo"]["bomdod"] == 1


@pytest.mark.asyncio
async def test_saving_the_whole_document_cannot_shrink_a_qazo_count():
    stored = json.dumps({"qazo": {"shom": 6}})
    connection = FakeConnection(scalars={"SELECT entries": stored})
    await repository.replace_member_data(
        FakePool(connection), "sardor",
        MemberData(days={"2026-08-22": {"qazo": {"shom": 1}}}),
    )
    written = json.loads(connection.args_for("INSERT INTO day_records")[2])
    assert written["qazo"]["shom"] == 6


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


# ---------------------------------------------------------------- doira yozuvlari
FAMILY_ROW = {
    "id": 2, "name": "Oilam", "kind": "family",
    "owner_id": "sardor", "week_goal": 20,
}


@pytest.mark.asyncio
async def test_creating_a_circle_puts_its_owner_inside_it():
    """A family whose owner is not a member of it is invisible to the person who
    just made it, so the two writes have to happen together."""
    connection = FakeConnection(rows={"INSERT INTO circles": [FAMILY_ROW]})
    circle = await repository.create_circle(FakePool(connection), "Oilam", "sardor", 20)
    assert circle.kind == "family"
    assert connection.args_for("INSERT INTO circle_members") == (2, "sardor")


@pytest.mark.asyncio
async def test_a_created_circle_is_always_a_family():
    connection = FakeConnection(rows={"INSERT INTO circles": [FAMILY_ROW]})
    await repository.create_circle(FakePool(connection), "Oilam", "sardor", 20)
    assert connection.issued("VALUES ($1, 'family', $2, $3)")


@pytest.mark.asyncio
async def test_a_free_login_is_used_as_typed():
    connection = FakeConnection(rows={"OR id LIKE": []})
    assert await repository.free_member_id(FakePool(connection), "zuhra") == "zuhra"


@pytest.mark.asyncio
async def test_a_taken_login_gets_the_next_free_number():
    connection = FakeConnection(
        rows={"OR id LIKE": [{"id": "zuhra"}, {"id": "zuhra2"}]}
    )
    assert await repository.free_member_id(FakePool(connection), "zuhra") == "zuhra3"


@pytest.mark.asyncio
async def test_a_login_never_grows_past_the_id_limit():
    connection = FakeConnection(rows={"OR id LIKE": []})
    got = await repository.free_member_id(FakePool(connection), "z" * 40)
    assert got is not None and len(got) <= 32


@pytest.mark.asyncio
async def test_removing_someone_who_was_not_in_the_circle_reports_it():
    connection = FakeConnection(results={"DELETE FROM circle_members": "DELETE 0"})
    assert await repository.remove_from_circle(FakePool(connection), 2, "behruz") is False


@pytest.mark.asyncio
async def test_removing_a_member_leaves_their_records_alone():
    """Leaving a family must not erase what somebody logged while in it."""
    connection = FakeConnection()
    await repository.remove_from_circle(FakePool(connection), 2, "behruz")
    assert connection.sql == [
        "DELETE FROM circle_members WHERE circle_id = $1 AND member_id = $2"
    ]


@pytest.mark.asyncio
async def test_owning_a_circle_containing_someone_is_read_from_the_join():
    connection = FakeConnection(scalars={"JOIN circle_members": True})
    assert await repository.owns_circle_containing(FakePool(connection), "sardor", "zuhra")


@pytest.mark.asyncio
async def test_a_duel_waits_for_the_last_acceptance():
    """Three have said yes, one has not: the week must not begin."""
    connection = FakeConnection(scalars={"RETURNING true AS ok": True, "AS waiting": 1})
    assert await repository.confirm_duel(FakePool(connection), 7, "behruz") is True
    assert not connection.issued("UPDATE duels")


@pytest.mark.asyncio
async def test_the_last_acceptance_starts_the_week():
    connection = FakeConnection(scalars={"RETURNING true AS ok": True, "AS waiting": 0})
    await repository.confirm_duel(FakePool(connection), 7, "behruz")
    assert connection.issued("UPDATE duels")
    assert connection.issued("started IS NULL"), "starting twice would move the goalposts"


@pytest.mark.asyncio
async def test_accepting_a_duel_you_are_not_in_changes_nothing():
    connection = FakeConnection(scalars={"RETURNING true AS ok": None})
    assert await repository.confirm_duel(FakePool(connection), 7, "stranger") is False
    assert not connection.issued("UPDATE duels")


@pytest.mark.asyncio
async def test_the_sender_of_a_challenge_has_already_accepted_it():
    connection = FakeConnection(rows={"INSERT INTO duels": [
        {"id": 3, "size": 2, "created_by": "sardor", "started": None, "ends": None}
    ]})
    duel = await repository.create_duel(
        FakePool(connection), 1, 2, "sardor", ["sardor", "behruz"], ["hikmat", "aziz"],
    )
    said_yes = {m.member_id for m in duel.members if m.confirmed}
    assert said_yes == {"sardor"}
    assert {m.member_id for m in duel.members} == {"sardor", "behruz", "hikmat", "aziz"}
