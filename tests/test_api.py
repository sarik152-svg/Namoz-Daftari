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
