"""Endpoint behaviour: who may call what, and what comes back."""
from __future__ import annotations

import pytest
from datetime import date as Date

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


MEMBER_JSON = {
    "id": "sardor", "name": "Sardor", "city": "Toshkent", "lat": 41.3,
    "lng": 69.2, "tz": 5.0, "asr": 2, "fa": 18.0, "ia": 18.0, "is_child": False,
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


@pytest.mark.asyncio
async def test_the_name_list_is_gone(api, connection):
    """Publishing every name would leak the names of other people's families."""
    async with api as client:
        response = await client.get("/api/v1/auth/members")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_login_still_works_by_id_and_pin(api, connection, settings):
    from app.security import encrypt_pin

    connection.rows["SELECT pin_encrypted"] = [
        {"pin_encrypted": encrypt_pin("1234", settings.pin_encryption_key)}
    ]
    async with api as client:
        response = await client.post(
            "/api/v1/auth/login", json={"member_id": "sardor", "pin": "1234"}
        )
    assert response.status_code == 200
    assert response.json()["member_id"] == "sardor"


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
        "id": "behruz", "name": "Behruz", "city": "Dubay", "is_child": False,
        "pin_encrypted": encrypt_pin("1234", settings.pin_encryption_key),
    }]
    async with api as client:
        response = await client.get("/api/v1/circles/1/roster", headers=headers)
    assert response.status_code == 200
    assert response.json()["members"][0]["pin"] == "1234"


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
async def test_a_day_accepts_make_up_prayers(api, connection):
    headers = as_session(connection)
    async with api as client:
        response = await client.put(
            "/api/v1/members/sardor/days/2026-08-22",
            json={"bomdod": {"s": "ontime", "t": "04:05"},
                  "qazo": {"bomdod": 3, "xufton": 2}},
            headers=headers,
        )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_a_days_qazo_count_is_capped(api, connection):
    """A cap no honest day reaches, there to stop a stuck finger, not a person."""
    headers = as_session(connection)
    async with api as client:
        response = await client.put(
            "/api/v1/members/sardor/days/2026-08-22",
            json={"qazo": {"bomdod": 21}}, headers=headers,
        )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_a_nafl_prayer_has_no_make_up(api, connection):
    headers = as_session(connection)
    async with api as client:
        response = await client.put(
            "/api/v1/members/sardor/days/2026-08-22",
            json={"qazo": {"tahajjud": 1}}, headers=headers,
        )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_a_document_without_a_backlog_is_still_accepted(api, connection):
    headers = as_session(connection)
    async with api as client:
        response = await client.put(
            "/api/v1/members/sardor/data",
            json={"days": {}, "bonuses": [], "tasks": [], "books": [],
                  "places": []},
            headers=headers,
        )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_a_member_states_their_own_backlog(api, connection):
    headers = as_session(connection)
    connection.rows["UPDATE members SET qazo_debt"] = [{"id": "sardor"}]
    async with api as client:
        response = await client.post(
            "/api/v1/members/sardor/qazo-debt", json={"qazo_debt": 9125},
            headers=headers,
        )
    assert response.status_code == 200
    assert connection.args_for("UPDATE members")[1] == 9125


@pytest.mark.asyncio
async def test_nobody_else_states_your_backlog(api, connection):
    """It is a claim about your own past, so a whole-document push from a stale
    phone must not be able to reset it either — hence a route of its own."""
    headers = as_session(connection, member_id="behruz")
    async with api as client:
        response = await client.post(
            "/api/v1/members/sardor/qazo-debt", json={"qazo_debt": 1},
            headers=headers,
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_an_absurd_backlog_is_refused(api, connection):
    headers = as_session(connection)
    connection.rows["UPDATE members SET qazo_debt"] = [{"id": "sardor"}]
    async with api as client:
        response = await client.post(
            "/api/v1/members/sardor/qazo-debt", json={"qazo_debt": 999999},
            headers=headers,
        )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_the_circle_owner_sets_the_work_shift(api, connection):
    headers = as_session(connection)
    connection.scalars["SELECT true AS owns"] = True
    connection.rows["UPDATE members SET work_shift"] = [{"id": "shahriddin"}]
    async with api as client:
        response = await client.post(
            "/api/v1/members/shahriddin/work-shift", json={"work_shift": True},
            headers=headers,
        )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_nobody_grants_themselves_the_work_shift(api, connection):
    """It lightens the scoring, so it is the circle owner's call, like is_child."""
    headers = as_session(connection, member_id="shahriddin")
    connection.scalars["SELECT true AS owns"] = None
    async with api as client:
        response = await client.post(
            "/api/v1/members/shahriddin/work-shift", json={"work_shift": True},
            headers=headers,
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_password_is_checked(api, connection):
    async with api as client:
        bad = await client.post("/api/v1/auth/admin", json={"password": "wrong"})
    assert bad.status_code == 401


@pytest.mark.asyncio
async def test_resetting_the_pin_of_a_missing_member_is_an_error(api, connection):
    """The admin types the login by hand now, so a typo must not report success."""
    headers = as_session(connection, member_id=None, is_admin=True)
    connection.results["UPDATE members SET pin_encrypted"] = "UPDATE 0"
    async with api as client:
        response = await client.post(
            "/api/v1/members/nobody/pin", json={"new_pin": "1234"}, headers=headers
        )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "no_member"


@pytest.mark.asyncio
async def test_resetting_the_pin_of_a_real_member_succeeds(api, connection):
    headers = as_session(connection, member_id=None, is_admin=True)
    async with api as client:
        response = await client.post(
            "/api/v1/members/behruz/pin", json={"new_pin": "1234"}, headers=headers
        )
    assert response.status_code == 200


# ---------------------------------------------------------------- oila doiralari
FAMILY = {"id": 2, "name": "Oilam", "kind": "family",
          "owner_id": "sardor", "week_goal": 20}
NEW_PERSON = {
    "id": "zuhra", "name": "Zuhra", "city": "Toshkent", "lat": 41.3,
    "lng": 69.2, "tz": 5.0, "asr": 2, "fa": 18.0, "ia": 18.0, "pin": "4821",
}


def owning(connection: FakeConnection, member_id="sardor") -> dict:
    """A session for the owner of circle 2, with that circle readable."""
    connection.rows["FROM circles WHERE id"] = [FAMILY]
    return as_session(connection, member_id=member_id)


@pytest.mark.asyncio
async def test_creating_a_family_returns_it(api, connection):
    headers = as_session(connection)
    connection.scalars["count(*) AS owned"] = 0
    connection.rows["INSERT INTO circles"] = [FAMILY]
    async with api as client:
        response = await client.post(
            "/api/v1/circles", headers=headers, json={"name": "Oilam", "week_goal": 20}
        )
    assert response.status_code == 201
    assert response.json() == FAMILY


@pytest.mark.asyncio
async def test_an_admin_session_cannot_open_a_family(api, connection):
    """Admin owns no member row, so a circle it created would belong to nobody."""
    headers = as_session(connection, member_id=None, is_admin=True)
    async with api as client:
        response = await client.post(
            "/api/v1/circles", headers=headers, json={"name": "Oilam"}
        )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_a_member"


@pytest.mark.asyncio
async def test_circles_are_capped(api, connection):
    headers = as_session(connection)
    connection.scalars["count(*) AS owned"] = 5
    async with api as client:
        response = await client.post(
            "/api/v1/circles", headers=headers, json={"name": "Yana bitta"}
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "too_many_circles"


@pytest.mark.asyncio
async def test_only_the_owner_may_rename_a_circle(api, connection):
    headers = owning(connection, member_id="behruz")
    async with api as client:
        response = await client.patch(
            "/api/v1/circles/2", headers=headers,
            json={"name": "Meniki endi", "week_goal": 30},
        )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_circle_owner"


@pytest.mark.asyncio
async def test_the_owner_may_move_the_weekly_goal(api, connection):
    headers = owning(connection)
    connection.rows["UPDATE circles"] = [dict(FAMILY, week_goal=12)]
    async with api as client:
        response = await client.patch(
            "/api/v1/circles/2", headers=headers,
            json={"name": "Oilam", "week_goal": 12},
        )
    assert response.status_code == 200
    assert response.json()["week_goal"] == 12


@pytest.mark.asyncio
async def test_only_the_owner_may_delete_a_circle(api, connection):
    headers = owning(connection, member_id="behruz")
    async with api as client:
        response = await client.delete("/api/v1/circles/2", headers=headers)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_circle_owner"
    assert not connection.issued("DELETE FROM circles")


@pytest.mark.asyncio
async def test_the_friends_circle_cannot_be_deleted(api, connection):
    """It is the one circle everybody is in, so deleting it strands the lot."""
    connection.rows["FROM circles WHERE id"] = [
        dict(FAMILY, id=1, name="Do'stlar", kind="friends")
    ]
    headers = as_session(connection)
    async with api as client:
        response = await client.delete("/api/v1/circles/1", headers=headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "friends_circle"
    assert not connection.issued("DELETE FROM circles")


@pytest.mark.asyncio
async def test_deleting_a_family_names_who_is_left_without_one(api, connection):
    """The names are read before the delete, because afterwards nobody can ask."""
    headers = owning(connection)
    connection.rows["NOT EXISTS"] = [{"name": "Nodira"}, {"name": "Aziz"}]
    async with api as client:
        response = await client.delete("/api/v1/circles/2", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"ok": True, "stranded": ["Nodira", "Aziz"]}
    assert connection.issued("DELETE FROM circles")
    assert connection.args_for("DELETE FROM circles") == (2,)


@pytest.mark.asyncio
async def test_an_existing_login_joins_without_a_second_account(api, connection):
    """The point of circles: one record, shown in two places."""
    headers = owning(connection)
    connection.scalars["count(*) AS people"] = 1
    connection.rows["FROM members WHERE id"] = [MEMBER_JSON]
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/members", headers=headers, json={"member_id": "sardor"}
        )
    assert response.status_code == 201
    assert connection.issued("INSERT INTO circle_members")
    assert not connection.issued("INSERT INTO members")


@pytest.mark.asyncio
async def test_a_new_person_is_created_and_joined_in_one_call(api, connection):
    headers = owning(connection)
    connection.scalars["count(*) AS people"] = 1
    connection.scalars["count(*) FROM members"] = 3
    connection.rows["OR id LIKE"] = []
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/members", headers=headers,
            json={"new_member": NEW_PERSON},
        )
    assert response.status_code == 201
    body = response.json()
    assert body["member"]["id"] == "zuhra"
    assert body["pin"] == "4821"
    assert connection.args_for("INSERT INTO circle_members")[1] == "zuhra"


@pytest.mark.asyncio
async def test_a_taken_login_is_moved_aside_instead_of_failing(api, connection):
    headers = owning(connection)
    connection.scalars["count(*) AS people"] = 1
    connection.scalars["count(*) FROM members"] = 3
    connection.rows["OR id LIKE"] = [{"id": "zuhra"}]
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/members", headers=headers,
            json={"new_member": NEW_PERSON},
        )
    assert response.status_code == 201
    assert response.json()["member"]["id"] == "zuhra2"


@pytest.mark.asyncio
async def test_adding_needs_exactly_one_of_the_two_ways(api, connection):
    headers = owning(connection)
    async with api as client:
        both = await client.post(
            "/api/v1/circles/2/members", headers=headers,
            json={"member_id": "sardor", "new_member": NEW_PERSON},
        )
        neither = await client.post(
            "/api/v1/circles/2/members", headers=headers, json={}
        )
    assert both.status_code == 422
    assert neither.status_code == 422


@pytest.mark.asyncio
async def test_a_stranger_cannot_add_to_your_circle(api, connection):
    headers = owning(connection, member_id="behruz")
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/members", headers=headers, json={"member_id": "behruz"}
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_full_circle_refuses_more_people(api, connection):
    headers = owning(connection)
    connection.scalars["count(*) AS people"] = 20
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/members", headers=headers, json={"member_id": "behruz"}
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "circle_full"


@pytest.mark.asyncio
async def test_the_owner_removes_a_member(api, connection):
    headers = owning(connection)
    async with api as client:
        response = await client.delete("/api/v1/circles/2/members/zuhra", headers=headers)
    assert response.status_code == 200
    assert connection.args_for("DELETE FROM circle_members") == (2, "zuhra")


@pytest.mark.asyncio
async def test_removing_a_member_does_not_delete_them(api, connection):
    headers = owning(connection)
    async with api as client:
        await client.delete("/api/v1/circles/2/members/zuhra", headers=headers)
    assert not connection.issued("DELETE FROM members")


@pytest.mark.asyncio
async def test_a_member_may_leave_a_circle_themselves(api, connection):
    headers = owning(connection, member_id="zuhra")
    async with api as client:
        response = await client.delete("/api/v1/circles/2/members/zuhra", headers=headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_one_member_cannot_evict_another(api, connection):
    headers = owning(connection, member_id="behruz")
    async with api as client:
        response = await client.delete("/api/v1/circles/2/members/zuhra", headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_the_owner_cannot_be_taken_out_of_their_own_circle(api, connection):
    """Otherwise the circle is left with nobody who can manage it."""
    headers = owning(connection)
    async with api as client:
        response = await client.delete("/api/v1/circles/2/members/sardor", headers=headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "owner_stays"


@pytest.mark.asyncio
async def test_a_circle_owner_resets_a_forgotten_pin(api, connection):
    headers = as_session(connection)
    connection.scalars["JOIN circle_members"] = True
    async with api as client:
        response = await client.post(
            "/api/v1/members/zuhra/pin", headers=headers, json={"new_pin": "1111"}
        )
    assert response.status_code == 200
    assert connection.issued("UPDATE members SET pin_encrypted")


@pytest.mark.asyncio
async def test_someone_who_owns_no_circle_of_yours_cannot_reset_your_pin(api, connection):
    headers = as_session(connection, member_id="behruz")
    connection.scalars["JOIN circle_members"] = None
    async with api as client:
        response = await client.post(
            "/api/v1/members/zuhra/pin", headers=headers, json={"new_pin": "1111"}
        )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_your_record"
    assert not connection.issued("UPDATE members SET pin_encrypted")


def test_members_are_no_longer_created_outside_a_circle():
    """The route that made circle-less accounts is gone. Such a person can log in
    and then see nothing at all, so creating one now runs through a circle."""
    from app.main import app

    paths = {
        (route.path, method)
        for route in app.routes
        for method in getattr(route, "methods", ())
    }
    assert ("/api/v1/members", "POST") not in paths
    assert ("/api/v1/circles/{circle_id}/members", "POST") in paths


# ---------------------------------------------------------------- oilaviy imkoniyatlar
FRIENDS_ROW = {"id": 1, "name": "Do'stlar", "kind": "friends",
               "owner_id": "sardor", "week_goal": 25}
KHATM_ROW = {"id": 5, "name": "Ramazon xatmi", "started": Date(2026, 8, 1),
             "finished": None}


def inside_family(connection: FakeConnection, member_id="sardor") -> dict:
    """A session for somebody who is in family circle 2."""
    connection.rows["FROM circles WHERE id"] = [FAMILY]
    connection.scalars["FROM circle_members WHERE circle_id"] = True
    return as_session(connection, member_id=member_id)


@pytest.mark.asyncio
async def test_the_owner_marks_someone_a_child(api, connection):
    headers = as_session(connection)
    connection.scalars["JOIN circle_members"] = True
    async with api as client:
        response = await client.post(
            "/api/v1/members/aziz/child", headers=headers, json={"is_child": True}
        )
    assert response.status_code == 200
    assert connection.args_for("SET is_child") == ("aziz", True)


@pytest.mark.asyncio
async def test_you_cannot_declare_yourself_a_child(api, connection):
    """It would be a way to switch off your own arrears."""
    headers = as_session(connection, member_id="aziz")
    connection.scalars["JOIN circle_members"] = None
    async with api as client:
        response = await client.post(
            "/api/v1/members/aziz/child", headers=headers, json={"is_child": True}
        )
    assert response.status_code == 403
    assert not connection.issued("SET is_child")


@pytest.mark.asyncio
async def test_calling_everyone_to_pray_records_the_call_not_the_prayer(api, connection):
    headers = inside_family(connection)
    connection.rows["INSERT INTO jamoat_calls"] = [
        {"day": Date(2026, 8, 23), "prayer": "shom", "caller_id": "sardor"}
    ]
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/jamoat", headers=headers,
            json={"day": "2026-08-23", "prayer": "shom"},
        )
    assert response.status_code == 201
    assert response.json()["caller_id"] == "sardor"
    assert not connection.issued("INSERT INTO day_records"), "nobody's prayer is written"


@pytest.mark.asyncio
async def test_the_friends_circle_has_no_praying_together(api, connection):
    """They are in different cities; the invitation would only be noise."""
    headers = as_session(connection)
    connection.rows["FROM circles WHERE id"] = [FRIENDS_ROW]
    connection.scalars["FROM circle_members WHERE circle_id"] = True
    async with api as client:
        response = await client.post(
            "/api/v1/circles/1/jamoat", headers=headers,
            json={"day": "2026-08-23", "prayer": "shom"},
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "not_a_family"


@pytest.mark.asyncio
async def test_an_outsider_cannot_call_a_family_to_prayer(api, connection):
    headers = as_session(connection, member_id="behruz")
    connection.rows["FROM circles WHERE id"] = [FAMILY]
    connection.scalars["FROM circle_members WHERE circle_id"] = None
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/jamoat", headers=headers,
            json={"day": "2026-08-23", "prayer": "shom"},
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_khatm_starts_empty(api, connection):
    headers = inside_family(connection)
    connection.rows["FROM khatms"] = []
    connection.rows["INSERT INTO khatms"] = [KHATM_ROW]
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/khatm", headers=headers,
            json={"name": "Ramazon xatmi", "started": "2026-08-01"},
        )
    assert response.status_code == 201
    assert response.json()["juz"] == []


@pytest.mark.asyncio
async def test_only_one_khatm_runs_at_a_time(api, connection):
    """Two at once and the progress bar stops meaning anything."""
    headers = inside_family(connection)
    connection.rows["FROM khatms"] = [KHATM_ROW]
    connection.rows["FROM khatm_juz"] = []
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/khatm", headers=headers,
            json={"name": "Yana bitta", "started": "2026-08-23"},
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "khatm_open"


@pytest.mark.asyncio
async def test_a_free_juz_can_be_taken(api, connection):
    headers = inside_family(connection)
    connection.scalars["true AS ours"] = True
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/khatm/5/juz/7", headers=headers
        )
    assert response.status_code == 200
    assert connection.args_for("INSERT INTO khatm_juz") == (5, 7, "sardor")


@pytest.mark.asyncio
async def test_a_taken_juz_is_refused(api, connection):
    headers = inside_family(connection)
    connection.scalars["true AS ours"] = True
    connection.results["INSERT INTO khatm_juz"] = "INSERT 0 0"
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/khatm/5/juz/7", headers=headers
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "juz_taken"


@pytest.mark.asyncio
async def test_a_khatm_from_another_family_is_out_of_reach(api, connection):
    headers = inside_family(connection)
    connection.scalars["true AS ours"] = None
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/khatm/99/juz/7", headers=headers
        )
    assert response.status_code == 404
    assert not connection.issued("INSERT INTO khatm_juz")


@pytest.mark.asyncio
async def test_you_can_only_give_back_your_own_unread_juz(api, connection):
    headers = inside_family(connection)
    connection.scalars["true AS ours"] = True
    connection.results["DELETE FROM khatm_juz"] = "DELETE 0"
    async with api as client:
        response = await client.delete(
            "/api/v1/circles/2/khatm/5/juz/7", headers=headers
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "not_yours"


@pytest.mark.asyncio
async def test_reading_a_juz_tries_to_close_the_khatm(api, connection):
    """Nobody has to declare a khatm finished; the thirtieth juz does it."""
    headers = inside_family(connection)
    connection.scalars["true AS ours"] = True
    async with api as client:
        response = await client.post(
            "/api/v1/circles/2/khatm/5/juz/30/done", headers=headers
        )
    assert response.status_code == 200
    assert connection.issued("UPDATE khatm_juz SET done_at")
    assert connection.issued("UPDATE khatms SET finished")


@pytest.mark.asyncio
async def test_state_carries_the_call_and_the_khatm(api, connection):
    headers = as_session(connection)
    connection.scalars["FROM circle_members WHERE circle_id"] = True
    connection.rows["FROM members m"] = [MEMBER_JSON]
    for table in ("day_records", "bonuses", "tasks", "books", "places"):
        connection.rows[f"FROM {table}"] = []
    connection.rows["FROM jamoat_calls"] = [
        {"day": Date(2026, 8, 23), "prayer": "shom", "caller_id": "sardor"}
    ]
    connection.rows["FROM khatms"] = [KHATM_ROW]
    connection.rows["FROM khatm_juz"] = [
        {"juz": 3, "member_id": "sardor", "done_at": None}
    ]
    async with api as client:
        response = await client.get("/api/v1/state?circle=2", headers=headers)
    body = response.json()
    assert body["calls"] == [{"day": "2026-08-23", "prayer": "shom", "caller_id": "sardor"}]
    assert body["khatm"]["juz"] == [{"juz": 3, "member_id": "sardor", "done": False}]
