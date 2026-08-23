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
