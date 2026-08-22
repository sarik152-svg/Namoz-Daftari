"""Central configuration. All environment access lives here (no scattered os.getenv)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

# --- PIN rules ---
# Four digits is the owner's decision, overriding a recommendation of six. With the
# shared group code retired, the PIN is the only wall in front of a member's data, so
# the brute-force throttle below is persisted rather than held in memory.
PIN_DIGITS = 4

# --- Abuse limits ---
PIN_ATTEMPT_LIMIT = 8
PIN_ATTEMPT_WINDOW_SECONDS = 300
ADMIN_SUBJECT = "__admin__"  # throttle key for admin password attempts

# --- Sessions ---
SESSION_TOKEN_BYTES = 32
SESSION_TTL_DAYS = 90

# --- Payload limits, so one phone cannot fill the database ---
MAX_DAYS_PER_MEMBER = 2000
MAX_BONUSES_PER_MEMBER = 2000
MAX_TASKS_PER_MEMBER = 5000
MAX_MEMBERS = 50

# --- Kitob daftari ---
# A book's notes and reading log travel inside the book document, so the caps are
# per book as well as per member. The whole list is replaced on every write, which
# is what keeps these numbers small.
MAX_BOOKS_PER_MEMBER = 200
MAX_NOTES_PER_BOOK = 500
MAX_LOG_ENTRIES_PER_BOOK = 2000

# --- Travel ---
# One entry per city change, not per day, so this only grows when someone moves.
MAX_PLACES_PER_MEMBER = 1000

# --- Connection pool ---
DB_POOL_MIN = 1
DB_POOL_MAX = 5
DB_COMMAND_TIMEOUT_SECONDS = 15.0


def _require(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            f"Set it in .env (local) or Railway -> Variables."
        )
    return value


@dataclass(frozen=True)
class Settings:
    """Immutable snapshot of the environment, validated once at startup."""

    database_url: str
    admin_password: str
    pin_encryption_key: str
    seed_members: str
    port: int

    @property
    def asyncpg_dsn(self) -> str:
        """asyncpg rejects the 'postgres://' scheme some providers still hand out."""
        if self.database_url.startswith("postgres://"):
            return "postgresql://" + self.database_url[len("postgres://") :]
        return self.database_url


def load_settings() -> Settings:
    """Read and validate configuration. Raises at startup, never mid-request."""
    settings = Settings(
        database_url=_require("DATABASE_URL"),
        admin_password=_require("ADMIN_PASSWORD"),
        pin_encryption_key=_require("PIN_ENCRYPTION_KEY"),
        seed_members=os.getenv("SEED_MEMBERS", "").strip(),
        port=int(os.getenv("PORT", "8080")),
    )
    if len(settings.admin_password) < 8:
        raise RuntimeError("ADMIN_PASSWORD must be at least 8 characters.")
    return settings
