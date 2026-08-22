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
    MAX_BOOKS_PER_MEMBER,
    MAX_DAYS_PER_MEMBER,
    MAX_LOG_ENTRIES_PER_BOOK,
    MAX_NOTES_PER_BOOK,
    MAX_PLACES_PER_MEMBER,
    MAX_TASKS_PER_MEMBER,
    PIN_DIGITS,
)
from app.security import is_valid_pin

PrayerKey = Literal["tahajjud", "bomdod", "peshin", "asr", "shom", "xufton"]
PrayerStatus = Literal["ontime", "qazo", "late", "missed"]
FARD_PRAYERS: tuple[PrayerKey, ...] = ("bomdod", "peshin", "asr", "shom", "xufton")
# Write-once keys. A mark is a claim about something that already happened and the
# whole group can see it, so it must not be quietly improved afterwards.
ALL_PRAYERS: tuple[PrayerKey, ...] = ("tahajjud",) + FARD_PRAYERS

MEMBER_ID_PATTERN = re.compile(r"^[a-z0-9]{1,32}$")
CLOCK_PATTERN = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
# Books and notes are created on the phone, so their ids arrive from the client
# rather than the database. Constrained rather than trusted.
CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,40}$")

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


def _validate_client_id(value: str) -> str:
    if not CLIENT_ID_PATTERN.match(value):
        raise ValueError("id must be 1-40 letters, digits, '-' or '_'")
    return value


def _validate_clock(value: str | None) -> str | None:
    if value is not None and not CLOCK_PATTERN.match(value):
        raise ValueError("time must be HH:MM")
    return value


# ---------------------------------------------------------------- records
class PrayerMark(BaseModel):
    """One prayer on one day.

    `t` is the clock time the user logged, if any. `j` marks it as prayed in
    congregation, which is worth more than praying alone and is chosen at the moment
    of marking — like the rest of the mark, it is write-once.
    """

    model_config = ConfigDict(extra="forbid")

    s: PrayerStatus
    t: str | None = None
    j: bool | None = None

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


# ---------------------------------------------------------------- kitob daftari
class ReadingDay(BaseModel):
    """Pages read on one day. The pace estimate is built entirely from these."""

    model_config = ConfigDict(extra="forbid")

    d: Date
    p: int = Field(ge=0, le=10_000)


class BookNote(BaseModel):
    """One thought taken from a book.

    Short like a message, and readable by the whole group: the point of the page is
    that everyone sees what the others are getting out of what they read.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    d: Date
    t: str | None = None
    page: int | None = Field(default=None, ge=0, le=100_000)
    text: str = Field(min_length=1, max_length=4000)

    _check_id = field_validator("id")(_validate_client_id)
    _check_clock = field_validator("t")(_validate_clock)


class Book(BaseModel):
    """A book someone is reading, with its reading log and its notes inside it."""

    model_config = ConfigDict(extra="forbid")

    id: str
    title: str = Field(min_length=1, max_length=200)
    author: str = Field(default="", max_length=200)
    pages: int = Field(ge=1, le=100_000)
    started: Date
    finished: Date | None = None
    log: list[ReadingDay] = Field(
        default_factory=list, max_length=MAX_LOG_ENTRIES_PER_BOOK
    )
    notes: list[BookNote] = Field(default_factory=list, max_length=MAX_NOTES_PER_BOOK)

    _check_id = field_validator("id")(_validate_client_id)

    @field_validator("log")
    @classmethod
    def _one_entry_per_day(cls, value: list[ReadingDay]) -> list[ReadingDay]:
        """Two rows for the same day would double-count that day's pages, which is
        what the pace estimate divides by. Reject rather than silently sum."""
        days = [entry.d for entry in value]
        if len(days) != len(set(days)):
            raise ValueError("a book may log each day only once")
        return value


# ---------------------------------------------------------------- travel
class Place(BaseModel):
    """Where a member is, from day `d` onward.

    Members travel, and prayer times have to follow the city they are actually in.
    This is a dated list rather than an overwrite of the profile, so a day already
    logged keeps being judged against the city they were in on that day.
    """

    model_config = ConfigDict(extra="forbid")

    d: Date
    city: str = Field(min_length=1, max_length=64)
    lat: Latitude
    lng: Longitude
    tz: UtcOffset
    asr: Literal[1, 2]
    fa: TwilightAngle
    ia: TwilightAngle


class MemberData(BaseModel):
    """Everything one member has logged."""

    model_config = ConfigDict(extra="forbid")

    days: dict[str, DayRecord] = Field(default_factory=dict)
    bonuses: list[Bonus] = Field(default_factory=list, max_length=MAX_BONUSES_PER_MEMBER)
    tasks: list[Task] = Field(default_factory=list, max_length=MAX_TASKS_PER_MEMBER)
    books: list[Book] = Field(default_factory=list, max_length=MAX_BOOKS_PER_MEMBER)
    places: list[Place] = Field(default_factory=list, max_length=MAX_PLACES_PER_MEMBER)

    @field_validator("places")
    @classmethod
    def _one_place_per_day(cls, value: list[Place]) -> list[Place]:
        """Two cities claiming the same day makes "where were you then" ambiguous.
        The client replaces the day's entry instead of appending a second one."""
        days = [entry.d for entry in value]
        if len(days) != len(set(days)):
            raise ValueError("a member may record only one place per day")
        return value

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
            "books": [b.model_dump(mode="json") for b in self.books],
            "places": [p.model_dump(mode="json") for p in self.places],
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
