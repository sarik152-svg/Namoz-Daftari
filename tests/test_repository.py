import pytest

from tests.fakes import FakeConnection, FakePool


@pytest.mark.asyncio
async def test_fake_connection_records_sql():
    connection = FakeConnection(rows={"FROM members": [{"id": "sardor"}]})
    async with FakePool(connection).acquire() as held:
        rows = await held.fetch("SELECT id\n  FROM members")
    assert rows == [{"id": "sardor"}]
    assert connection.sql == ["SELECT id FROM members"]
