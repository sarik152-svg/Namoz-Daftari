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
