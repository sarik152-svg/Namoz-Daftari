"""Credentials: PIN encryption, admin password checks, and session tokens.

PINs are encrypted rather than hashed because the admin panel has to display them.
That is a deliberate, owner-approved downgrade from the usual one-way hash: encryption
at rest means a stolen database dump alone is useless, but anyone holding both the dump
and PIN_ENCRYPTION_KEY can read every PIN.

Four-digit PINs are only 10,000 combinations, so the throttle is the real defence. It is
persisted by the caller (see repository.record_pin_failure) so a restart cannot reset an
attacker's counter.
"""
from __future__ import annotations

import hmac
import re
import secrets

from cryptography.fernet import Fernet, InvalidToken

from app.config import PIN_DIGITS, SESSION_TOKEN_BYTES

_PIN_PATTERN = re.compile(rf"^[0-9]{{{PIN_DIGITS}}}$")


class AuthError(Exception):
    """Raised when a credential is missing, malformed, or wrong."""


def is_valid_pin(pin: str) -> bool:
    """Exactly PIN_DIGITS ASCII digits.

    [0-9] rather than \\d: Python's \\d also matches Unicode digits such as
    Arabic-Indic numerals, which the browser's ASCII-only \\d would reject.
    """
    return bool(_PIN_PATTERN.match(pin or ""))


def encrypt_pin(pin: str, key: str) -> str:
    """Encrypt a PIN for storage. Raises AuthError on a malformed PIN."""
    if not is_valid_pin(pin):
        raise AuthError(f"PIN must be exactly {PIN_DIGITS} digits")
    return Fernet(key.encode()).encrypt(pin.encode()).decode()


def decrypt_pin(token: str, key: str) -> str:
    """Recover a stored PIN. Returns '' when the value is absent or unreadable."""
    if not token:
        return ""
    try:
        return Fernet(key.encode()).decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return ""


def verify_pin(supplied: str, stored: str, key: str) -> bool:
    """Constant-time PIN check.

    Fails closed on an empty stored value: a member without a PIN cannot be written
    to by anyone. The previous design let an empty PIN accept any value, which is how
    both seeded members ended up editable by whoever held the group code.
    """
    actual = decrypt_pin(stored, key)
    if not actual:
        return False
    return hmac.compare_digest(supplied or "", actual)


def verify_admin_password(supplied: str, expected: str) -> bool:
    """Constant-time comparison. Fails closed on an empty configured password."""
    if not expected:
        return False
    return hmac.compare_digest((supplied or "").encode(), expected.encode())


def new_session_token() -> str:
    return secrets.token_urlsafe(SESSION_TOKEN_BYTES)


def generate_pin() -> str:
    """A uniformly random PIN, for the admin panel's 'generate' button."""
    return "".join(secrets.choice("0123456789") for _ in range(PIN_DIGITS))
