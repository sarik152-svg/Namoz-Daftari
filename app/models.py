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

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.config import (
    MAX_BONUSES_PER_MEMBER,
    MAX_BOOKS_PER_MEMBER,
    MAX_DAYS_PER_MEMBER,
    MAX_LOG_ENTRIES_PER_BOOK,
    MAX_NOTES_PER_BOOK,
    MAX_PLACES_PER_MEMBER,
    MAX_QAZO_DEBT,
    MAX_QAZO_PER_PRAYER_PER_DAY,
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


QazoCount = Annotated[int, Field(ge=0, le=MAX_QAZO_PER_PRAYER_PER_DAY)]


class QazoDay(BaseModel):
    """Make-up prayers from years ago, counted on the day they were prayed.

    Nothing to do with `PrayerStatus.qazo`, which is today's prayer said after its
    window and costs a quarter point. These are prayers owed from long before the
    notebook existed, and each one *earns* a quarter point. The two are deliberately
    never shown under the same word in the app.

    Only the five fard prayers appear: a nafl prayer is never owed, so it can never
    be made up. The day it was missed is not recorded — nobody knows it — so the
    count hangs off the day it was finally prayed.
    """

    model_config = ConfigDict(extra="forbid")

    bomdod: QazoCount = 0
    peshin: QazoCount = 0
    asr: QazoCount = 0
    shom: QazoCount = 0
    xufton: QazoCount = 0


class DayRecord(BaseModel):
    """One calendar day for one member, in the browser app's flat shape."""

    model_config = ConfigDict(extra="forbid")

    tahajjud: PrayerMark | None = None
    bomdod: PrayerMark | None = None
    peshin: PrayerMark | None = None
    asr: PrayerMark | None = None
    shom: PrayerMark | None = None
    xufton: PrayerMark | None = None
    qazo: QazoDay | None = None
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


class Circle(BaseModel):
    """A group of people who see each other.

    Records belong to members, never to a circle: this only answers "who is shown
    together", which is what lets one person be in a friends circle and a family at
    the same time while marking a prayer once.
    """

    model_config = ConfigDict(extra="forbid")

    id: int
    name: str = Field(min_length=1, max_length=64)
    kind: Literal["friends", "family"]
    owner_id: str
    week_goal: int = Field(default=25, ge=1, le=100)

    _check_owner = field_validator("owner_id")(_validate_member_id)


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
    """A member as the client renders them. Never carries the PIN.

    `is_child` turns off debt and penalty work for that person. It travels with the
    profile rather than the records because every screen that scores somebody needs
    to know, and the answer is the same in every circle they are in.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    is_child: bool = False
    # Ish rejimi: Peshin, Asr and Shom made up the same day count as prayed on time,
    # because this member's shift covers all three. Everything else is judged the
    # same as anyone's, including a prayer left until the next day.
    work_shift: bool = False
    # Ayollar rejimi: a prayer caught up the same day earns a quarter point instead
    # of costing one. On time and left-until-tomorrow are both judged as anyone's.
    woman_mode: bool = False
    # The backlog the member says they owe, as it stood when they wrote it down. What
    # is left is always this minus everything counted in their days, so re-stating it
    # never subtracts the same made-up prayers twice. It rides on the profile because
    # that is where it is stored, and because the circle's screen shows what everyone
    # is working through.
    qazo_debt: int = Field(default=0, ge=0, le=MAX_QAZO_DEBT)
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


# ---------------------------------------------------------------- circle bodies
class CircleCreate(BaseModel):
    """Body for starting a family.

    There is no `kind` to choose. The friends circle already exists and a second one
    would only be a family wearing the wrong label, so everything created here is a
    family and the caller becomes its owner.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=64)
    week_goal: int = Field(default=25, ge=1, le=100)


class CircleUpdate(BaseModel):
    """Rename a circle, or move its weekly goal. Owner only.

    The goal is per circle because a family holds children and grandparents to a
    different number than three friends hold each other to.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=64)
    week_goal: int = Field(ge=1, le=100)


class CircleMemberAdd(BaseModel):
    """Put somebody in a circle: an existing login, or a person created right here.

    Exactly one of the two. Sending both would leave it ambiguous whether an account
    is being made or reused, and sending neither is a no-op the caller thinks worked.
    """

    model_config = ConfigDict(extra="forbid")

    member_id: str | None = None
    new_member: MemberCreate | None = None

    @field_validator("member_id")
    @classmethod
    def _check_member_id(cls, value: str | None) -> str | None:
        return None if value is None else _validate_member_id(value)

    @model_validator(mode="after")
    def _exactly_one(self) -> "CircleMemberAdd":
        if (self.member_id is None) == (self.new_member is None):
            raise ValueError("send either member_id or new_member, not both")
        return self


class RosterEntry(BaseModel):
    """A circle owner's view of a member, including the PIN in the clear."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    city: str
    pin: str
    is_child: bool = False


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


# ---------------------------------------------------------------- oila
class JamoatCall(BaseModel):
    """One "we are praying this together" for one prayer on one day.

    Who joined is deliberately not stored. Each person marks their own prayer through
    the ordinary write, so the two rules that make the record trustworthy — nobody
    marks for anybody else, and a mark is write-once — are never bent for this.
    """

    model_config = ConfigDict(extra="forbid")

    day: Date
    prayer: PrayerKey
    caller_id: str

    _check_caller = field_validator("caller_id")(_validate_member_id)


class JamoatCallCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day: Date
    prayer: PrayerKey


class KhatmJuz(BaseModel):
    """One of the thirty parts, once somebody has taken it."""

    model_config = ConfigDict(extra="forbid")

    juz: int = Field(ge=1, le=30)
    member_id: str | None = None
    done: bool = False


class Khatm(BaseModel):
    """A Qur'an read between a family, one juz at a time.

    Only taken juz are listed. A number from 1 to 30 that is missing from `juz` is
    free, which is the whole of the bookkeeping.
    """

    model_config = ConfigDict(extra="forbid")

    id: int
    name: str = Field(min_length=1, max_length=64)
    started: Date
    finished: Date | None = None
    juz: list[KhatmJuz] = Field(default_factory=list, max_length=30)


class KhatmCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=64)
    started: Date


class QazoDebt(BaseModel):
    """Body for stating your own backlog. A route of its own rather than a field on
    the document, so a phone pushing a stale document can never reset it."""

    model_config = ConfigDict(extra="forbid")

    qazo_debt: int = Field(ge=0, le=MAX_QAZO_DEBT)


# ---------------------------------------------------------------- duel
class DuelMember(BaseModel):
    """One participant: which side they are on, and whether they have accepted."""

    model_config = ConfigDict(extra="forbid")

    member_id: str
    side: Literal[1, 2]
    confirmed: bool = False

    _check_id = field_validator("member_id")(_validate_member_id)


class Duel(BaseModel):
    """Two people, or two pairs, over one week of prayer points.

    The result is not here and never will be: it is worked out from the same records
    the ranking reads, so it cannot disagree with them. `started` is NULL until
    everybody has accepted, which is the whole state machine — no start means
    waiting, a start means running or finished depending on `ends`.
    """

    model_config = ConfigDict(extra="forbid")

    id: int
    size: Literal[1, 2]
    created_by: str
    started: Date | None = None
    ends: Date | None = None
    members: list[DuelMember] = Field(default_factory=list, max_length=4)


class DuelCreate(BaseModel):
    """Who is challenging whom. The caller must be one of them."""

    model_config = ConfigDict(extra="forbid")

    size: Literal[1, 2]
    side1: list[str] = Field(min_length=1, max_length=2)
    side2: list[str] = Field(min_length=1, max_length=2)

    @model_validator(mode="after")
    def _sides_line_up(self) -> "DuelCreate":
        if len(self.side1) != self.size or len(self.side2) != self.size:
            raise ValueError(f"each side needs exactly {self.size}")
        everyone = self.side1 + self.side2
        for member_id in everyone:
            _validate_member_id(member_id)
        if len(set(everyone)) != len(everyone):
            raise ValueError("nobody can be on both sides, or on one side twice")
        return self


class ChildFlag(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_child: bool


class WorkShiftFlag(BaseModel):
    """Set by the circle owner, never by the member: it lightens their own scoring."""

    model_config = ConfigDict(extra="forbid")

    work_shift: bool


class WomanModeFlag(BaseModel):
    """Also the circle owner's to set, for the same reason."""

    model_config = ConfigDict(extra="forbid")

    woman_mode: bool


class GroupState(BaseModel):
    """The whole group in one response. Drives the comparison screen.

    The family pieces ride along here rather than on endpoints of their own: the app
    already polls this every minute, so a call to pray together shows up on the other
    phones without anybody adding a second poll.
    """

    members: list[MemberProfile]
    data: dict[str, MemberData]
    calls: list[JamoatCall] = Field(default_factory=list)
    khatm: Khatm | None = None
    duels: list[Duel] = Field(default_factory=list)

    def to_wire(self) -> dict:
        return {
            "members": [m.model_dump() for m in self.members],
            "data": {member_id: d.to_wire() for member_id, d in self.data.items()},
            "calls": [c.model_dump(mode="json") for c in self.calls],
            "khatm": None if self.khatm is None else self.khatm.model_dump(mode="json"),
            "duels": [d.model_dump(mode="json") for d in self.duels],
        }
