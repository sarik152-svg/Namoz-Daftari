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
        "id": "behruz", "name": "Behruz", "city": "Dubay",
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
