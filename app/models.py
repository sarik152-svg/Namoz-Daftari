"""Pydantic models. Every payload from a phone is validated here before it
reaches the database, and every response is shaped here before it leaves.

The record field names deliberately match the browser app's existing JSON (`s`, `t`,
`amt`, `lvl`, ...) so the client keeps its current data shape.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date as Date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.config import (
    MAX_BONUSES_PER_MEMBER,
    MAX_DAYS_PER_MEMBER,
    MAX_TASKS_PER_MEMBER,
    PIN_DIGITS,
)
from app.security import is_valid_pin

PrayerKey = Literal["tahajjud", "bomdod", "peshin", "asr", "shom", "xufton"]
PrayerStatus = Literal["ontime", "qazo", "late", "missed"]
FARD_PRAYERS: tuple[PrayerKey, ...] = ("bomdod", "peshin", "asr", "shom", "xufton")

MEMBER_ID_PATTERN = re.compile(r"^[a-z0-9]{1,32}$")
CLOCK_PATTERN = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")

Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]
UtcOffset = Annotated[float, Field(ge=-12, le=14)]
TwilightAngle = Annotated[float, Field(ge=0, le=25)]


def _validate_member_id(value: str) -> str:
    if not MEMBER_ID_PATTERN.match(value):
        raise ValueError("id must be 1-32 lowercase letters or digits")
    return value


def _validate_pin(value: str) -> str:
    if not is_valid_pin(value):
        raise ValueError(f"PIN must be exactly {PIN_DIGITS} digits")
    return value


# ---------------------------------------------------------------- records
class PrayerMark(BaseModel):
    """One prayer on one day. `t` is the clock time the user logged, if any."""

    model_config = ConfigDict(extra="forbid")

    s: PrayerStatus
    t: str | None = None

    @field_validator("t")
    @classmethod
    def _check_clock(cls, value: str | None) -> str | None:
        if value is not None and not CLOCK_PATTERN.match(value):
            raise ValueError("time must be HH:MM")
        return value


class DayRecord(BaseModel):
    """One calendar day for one member, in the browser app's flat shape."""

    model_config = ConfigDict(extra="forbid")

    tahajjud: PrayerMark | None = None
    bomdod: PrayerMark | None = None
    peshin: PrayerMark | None = None
    asr: PrayerMark | None = None
    shom: PrayerMark | None = None
    xufton: PrayerMark | None = None
    quran: bool | None = None
    sunnat: str | None = Field(default=None, max_length=2000)

    def to_wire(self) -> dict:
        """Drop unset keys so the client sees exactly what it sent."""
        return self.model_dump(exclude_none=True)


class Bonus(BaseModel):
    """A streak reward the member claimed."""

    model_config = ConfigDict(extra="forbid")

    p: PrayerKey
    lvl: int = Field(ge=0, le=1000)
    amt: float = Field(ge=0, le=1000)
    d: Date


class Task(BaseModel):
    """A completed penance task (rakats + tasbih)."""

    model_config = ConfigDict(extra="forbid")

    d: Date
    rak: int = Field(ge=0, le=1000)
    tas: int = Field(ge=0, le=100_000)


class MemberData(BaseModel):
    """Everything one member has logged."""

    model_config = ConfigDict(extra="forbid")

    days: dict[str, DayRecord] = Field(default_factory=dict)
    bonuses: list[Bonus] = Field(default_factory=list, max_length=MAX_BONUSES_PER_MEMBER)
    tasks: list[Task] = Field(default_factory=list, max_length=MAX_TASKS_PER_MEMBER)

    @field_validator("days")
    @classmethod
    def _check_days(cls, value: dict[str, DayRecord]) -> dict[str, DayRecord]:
        if len(value) > MAX_DAYS_PER_MEMBER:
            raise ValueError(f"at most {MAX_DAYS_PER_MEMBER} days per member")
        for key in value:
            try:
                Date.fromisoformat(key)
            except ValueError as exc:
                raise ValueError(f"day key '{key}' must be YYYY-MM-DD") from exc
        return value

    def to_wire(self) -> dict:
        return {
            "days": {day: record.to_wire() for day, record in self.days.items()},
            "bonuses": [b.model_dump(mode="json") for b in self.bonuses],
            "tasks": [t.model_dump(mode="json") for t in self.tasks],
        }


# ---------------------------------------------------------------- members
class MemberProfile(BaseModel):
    """A member as the client renders them. Never carries the PIN."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = Field(min_length=1, max_length=64)
    city: str = Field(min_length=1, max_length=64)
    lat: Latitude
    lng: Longitude
    tz: UtcOffset
    asr: Literal[1, 2]
    fa: TwilightAngle
    ia: TwilightAngle

    _check_id = field_validator("id")(_validate_member_id)


class MemberCreate(BaseModel):
    """Body for adding a member. Admin-only, and the PIN is mandatory.

    A member without a PIN could not log in, and under the previous design an empty
    PIN meant anyone could write to them. Requiring it removes both failure modes.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = Field(min_length=1, max_length=64)
    city: str = Field(min_length=1, max_length=64)
    lat: Latitude
    lng: Longitude
    tz: UtcOffset
    asr: Literal[1, 2]
    fa: TwilightAngle
    ia: TwilightAngle
    pin: str

    _check_id = field_validator("id")(_validate_member_id)
    _check_pin = field_validator("pin")(_validate_pin)


class PublicMember(BaseModel):
    """What the login screen may know before anyone authenticates: a name only."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str


class RosterEntry(BaseModel):
    """Admin view of a member, including the PIN in the clear."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    city: str
    pin: str


# ---------------------------------------------------------------- auth
class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    member_id: str
    pin: str

    _check_id = field_validator("member_id")(_validate_member_id)


class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str = Field(min_length=1, max_length=256)


class SetPinRequest(BaseModel):
    """Change a PIN. `current_pin` is required for members, ignored for admin."""

    model_config = ConfigDict(extra="forbid")

    new_pin: str
    current_pin: str = ""

    _check_new = field_validator("new_pin")(_validate_pin)


@dataclass(frozen=True)
class Session:
    """Who a request is acting as. Not a Pydantic model: never crosses the wire."""

    token: str
    member_id: str | None
    is_admin: bool

    def may_write_to(self, member_id: str) -> bool:
        """Admin writes to anyone. A member writes only to themselves."""
        return self.is_admin or self.member_id == member_id


class GroupState(BaseModel):
    """The whole group in one response. Drives the comparison screen."""

    members: list[MemberProfile]
    data: dict[str, MemberData]

    def to_wire(self) -> dict:
        return {
            "members": [m.model_dump() for m in self.members],
            "data": {member_id: d.to_wire() for member_id, d in self.data.items()},
        }
