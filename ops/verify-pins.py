"""Read-only PIN/migration check; never print identities, PINs, or secrets."""
import asyncio
import json
from pathlib import Path

import asyncpg
from cryptography.fernet import Fernet, InvalidToken

from app.config import load_settings


async def main():
    settings = load_settings()
    connection = await asyncpg.connect(settings.asyncpg_dsn)
    try:
        tokens = await connection.fetch("SELECT pin_encrypted FROM members")
        cipher = Fernet(settings.pin_encryption_key.encode())
        valid = missing = unreadable = 0
        for row in tokens:
            token = row["pin_encrypted"]
            if not token:
                missing += 1
                continue
            try:
                pin = cipher.decrypt(token.encode()).decode()
                if len(pin) == 4 and pin.isascii() and pin.isdigit():
                    valid += 1
                else:
                    unreadable += 1
            except (InvalidToken, ValueError, UnicodeError):
                unreadable += 1
        done = {row["filename"] for row in await connection.fetch("SELECT filename FROM schema_migrations")}
        files = {p.name for p in Path("/app/migrations").glob("*.sql")}
        result = {"members": len(tokens), "valid_pins": valid,
                  "missing_pins": missing, "unreadable_pins": unreadable,
                  "applied_migrations": len(done),
                  "pending_migrations": sorted(files - done),
                  "unknown_migrations": sorted(done - files)}
        print(json.dumps(result, sort_keys=True))
        if not tokens or missing or unreadable or result["pending_migrations"] or result["unknown_migrations"]:
            raise SystemExit("Migration verification requires review; do not start web yet.")
    finally:
        await connection.close()


asyncio.run(main())
