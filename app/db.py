"""Connection pool and migration runner. Nothing here knows about HTTP."""
from __future__ import annotations

import logging
from pathlib import Path

import asyncpg

from app.config import (
    DB_COMMAND_TIMEOUT_SECONDS,
    DB_POOL_MAX,
    DB_POOL_MIN,
    MIGRATIONS_DIR,
    Settings,
)

logger = logging.getLogger("namoz.db")

_MIGRATION_TABLE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""


async def create_pool(settings: Settings) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        dsn=settings.asyncpg_dsn,
        min_size=DB_POOL_MIN,
        max_size=DB_POOL_MAX,
        command_timeout=DB_COMMAND_TIMEOUT_SECONDS,
    )


async def run_migrations(pool: asyncpg.Pool, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply every unapplied .sql file in name order. Returns what it applied."""
    applied: list[str] = []
    async with pool.acquire() as connection:
        await connection.execute(_MIGRATION_TABLE)
        done = {
            row["filename"] for row in await connection.fetch("SELECT filename FROM schema_migrations")
        }
        for path in sorted(directory.glob("*.sql")):
            if path.name in done:
                continue
            async with connection.transaction():
                await connection.execute(path.read_text(encoding="utf-8"))
                await connection.execute(
                    "INSERT INTO schema_migrations (filename) VALUES ($1)", path.name
                )
            applied.append(path.name)
            logger.info("Applied migration %s", path.name)
    return applied
