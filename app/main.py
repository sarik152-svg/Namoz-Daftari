"""HTTP layer for Namoz Daftari.

Every request carries a session token; there is no longer a public name list. The
session says who you are, and writes compare that identity against the member being
written to. There is no shared secret: ownership is structural, not a header check.

Admin is a second kind of session that can overwrite a mark and reset a PIN. It can
no longer read them: an admin session has no member_id and so owns no circle, and PINs
belong to a circle's owner.
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from datetime import date as Date

import asyncpg
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app import repository
from app.config import (
    ADMIN_SUBJECT,
    MAX_CIRCLE_MEMBERS,
    MAX_CIRCLES_OWNED,
    MAX_MEMBERS,
    STATIC_DIR,
    load_settings,
)
from app.db import create_pool, run_migrations
from app.models import (
    AdminLoginRequest,
    ChildFlag,
    CircleCreate,
    CircleMemberAdd,
    CircleUpdate,
    DayRecord,
    JamoatCallCreate,
    KhatmCreate,
    LoginRequest,
    MemberData,
    QazoDebt,
    Session,
    SetPinRequest,
)
from app.security import AuthError, verify_admin_password, verify_pin

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s", level=logging.INFO
)
logger = logging.getLogger("namoz.api")

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate config, open the pool, migrate, seed. Fail loudly at boot."""
    settings = load_settings()
    pool = await create_pool(settings)
    await run_migrations(pool)
    await repository.seed_members_if_empty(
        pool, settings.seed_members, settings.pin_encryption_key
    )
    purged = await repository.purge_expired_sessions(pool)
    app.state.settings = settings
    app.state.pool = pool
    logger.info("Namoz Daftari API ready (purged %d expired sessions)", purged)
    try:
        yield
    finally:
        await pool.close()


app = FastAPI(title="Namoz Daftari", version="2.0.0", lifespan=lifespan)


def _error(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(status_code=http_status, detail={"code": code, "message": message})


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Return one consistent error shape: {"error": {"code", "message"}}."""
    detail = exc.detail
    if not isinstance(detail, dict):
        detail = {"code": "error", "message": str(detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": detail})


@app.middleware("http")
async def _log_requests(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    if request.url.path.startswith(API_PREFIX):
        logger.info(
            "%s %s -> %s in %.0fms",
            request.method, request.url.path, response.status_code,
            (time.perf_counter() - started) * 1000,
        )
    return response


# ---------------------------------------------------------------- dependencies
def _bearer(authorization: str) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    return token.strip() if scheme.lower() == "bearer" else ""


async def require_session(request: Request, authorization: str = Header(default="")) -> Session:
    """Every authenticated route depends on this. No token, no data."""
    session = await repository.load_session(request.app.state.pool, _bearer(authorization))
    if session is None:
        raise _error("no_session", "Iltimos, qaytadan kiring", status.HTTP_401_UNAUTHORIZED)
    return session


async def require_owner_or_admin(
    member_id: str, session: Session = Depends(require_session)
) -> Session:
    """The core rule: you write to yourself, admin writes to anyone."""
    if not session.may_write_to(member_id):
        raise _error(
            "not_your_record", "Bu sizning yozuvingiz emas", status.HTTP_403_FORBIDDEN
        )
    return session


async def _guard_throttle(pool: asyncpg.Pool, subject: str) -> None:
    if await repository.is_locked_out(pool, subject):
        raise _error(
            "too_many_attempts", "Juda ko'p urinish. Biroz kuting.",
            status.HTTP_429_TOO_MANY_REQUESTS,
        )


# ---------------------------------------------------------------- auth routes
@app.get("/health")
async def health(request: Request) -> dict:
    """Liveness plus a real database round trip, so Railway sees true health."""
    try:
        async with request.app.state.pool.acquire() as connection:
            await connection.fetchval("SELECT 1")
    except Exception:
        logger.exception("Health check could not reach the database")
        raise _error("db_unavailable", "Database unreachable", status.HTTP_503_SERVICE_UNAVAILABLE)
    return {"status": "ok"}


@app.post(f"{API_PREFIX}/auth/login")
async def login(body: LoginRequest, request: Request) -> dict:
    pool: asyncpg.Pool = request.app.state.pool
    key = request.app.state.settings.pin_encryption_key

    await _guard_throttle(pool, body.member_id)
    stored = await repository.fetch_encrypted_pin(pool, body.member_id)

    # A missing member and a wrong PIN return the same thing on purpose: the login
    # screen already lists the names, but the error should not confirm anything.
    if stored is None or not verify_pin(body.pin, stored, key):
        await repository.record_failure(pool, body.member_id)
        raise _error("bad_login", "PIN noto'g'ri", status.HTTP_401_UNAUTHORIZED)

    await repository.clear_failures(pool, body.member_id)
    token = await repository.create_session(pool, body.member_id)
    return {"token": token, "member_id": body.member_id, "is_admin": False}


@app.post(f"{API_PREFIX}/auth/admin")
async def admin_login(body: AdminLoginRequest, request: Request) -> dict:
    pool: asyncpg.Pool = request.app.state.pool
    await _guard_throttle(pool, ADMIN_SUBJECT)

    if not verify_admin_password(body.password, request.app.state.settings.admin_password):
        await repository.record_failure(pool, ADMIN_SUBJECT)
        raise _error("bad_login", "Parol noto'g'ri", status.HTTP_401_UNAUTHORIZED)

    await repository.clear_failures(pool, ADMIN_SUBJECT)
    token = await repository.create_session(pool, None, is_admin=True)
    return {"token": token, "member_id": None, "is_admin": True}


@app.delete(f"{API_PREFIX}/auth/session")
async def logout(request: Request, session: Session = Depends(require_session)) -> dict:
    await repository.delete_session(request.app.state.pool, session.token)
    return {"ok": True}


@app.get(f"{API_PREFIX}/auth/me")
async def whoami(session: Session = Depends(require_session)) -> dict:
    """Lets a phone with a stored token skip the login screen."""
    return {"member_id": session.member_id, "is_admin": session.is_admin}


# ---------------------------------------------------------------- data routes
async def _require_circle(request: Request, session: Session, circle: int | None) -> int:
    """Resolve which circle a read is about, and prove the caller belongs to it.

    Omitting `circle` means "my first one", so a client that has not caught up still
    gets a sensible answer instead of an error.
    """
    pool: asyncpg.Pool = request.app.state.pool
    if circle is None:
        mine = await repository.fetch_circles_for(pool, session.member_id or "")
        if not mine:
            raise _error("no_circle", "Siz hech qaysi doirada emassiz", status.HTTP_404_NOT_FOUND)
        return mine[0].id
    if not await repository.is_circle_member(pool, circle, session.member_id or ""):
        raise _error("not_your_circle", "Bu doira sizniki emas", status.HTTP_403_FORBIDDEN)
    return circle


@app.get(f"{API_PREFIX}/circles")
async def list_circles(request: Request, session: Session = Depends(require_session)) -> dict:
    """The circles this member belongs to. Drives the switcher in the client."""
    circles = await repository.fetch_circles_for(
        request.app.state.pool, session.member_id or ""
    )
    return {"circles": [c.model_dump() for c in circles]}


@app.get(f"{API_PREFIX}/state")
async def get_state(
    request: Request, circle: int | None = None,
    session: Session = Depends(require_session),
) -> dict:
    """One circle's profiles and records. A circle is only readable from inside it."""
    circle_id = await _require_circle(request, session, circle)
    state = await repository.fetch_group_state(request.app.state.pool, circle_id)
    return state.to_wire()


@app.put(f"{API_PREFIX}/members/{{member_id}}/days/{{day}}")
async def put_day(
    member_id: str, day: Date, record: DayRecord, request: Request,
    session: Session = Depends(require_owner_or_admin),
) -> dict:
    """The hot path: one tap in the app writes exactly one row.

    `day` is typed as a date so FastAPI parses it at the boundary: a malformed
    path returns 422 instead of reaching asyncpg and raising a 500.

    A prayer already marked is not overwritten: the record is what the group holds
    each other to, so it is write-once for the member who owns it. The admin can
    still overwrite, because a genuine mis-tap has to be fixable by somebody.
    """
    await repository.upsert_day(
        request.app.state.pool, member_id, day, record,
        allow_overwrite=session.is_admin,
    )
    return {"ok": True}


@app.put(f"{API_PREFIX}/members/{{member_id}}/data")
async def put_member_data(
    member_id: str, data: MemberData, request: Request,
    session: Session = Depends(require_owner_or_admin),
) -> dict:
    """Whole-document write, used for the bonus, task, book and place ledgers.

    Days travel in this payload too, so it honours the same write-once rule as
    put_day; otherwise saving a book would be a way to rewrite a prayer.
    """
    await repository.replace_member_data(
        request.app.state.pool, member_id, data,
        allow_overwrite=session.is_admin,
    )
    return {"ok": True}


@app.post(f"{API_PREFIX}/members/{{member_id}}/pin")
async def change_pin(
    member_id: str, body: SetPinRequest, request: Request,
    session: Session = Depends(require_session),
) -> dict:
    """Members prove the current PIN to change it. Admin and the owner of a circle
    the member is in set it outright.

    Giving the owner that power is the point: a forgotten PIN in somebody's family
    has to be fixable inside that family, not only by whoever holds the server
    password. It is also the honest reading of what the roster already shows them.
    """
    pool: asyncpg.Pool = request.app.state.pool
    key = request.app.state.settings.pin_encryption_key

    if session.member_id == member_id:
        stored = await repository.fetch_encrypted_pin(pool, member_id)
        await _guard_throttle(pool, member_id)
        if stored is None or not verify_pin(body.current_pin, stored, key):
            await repository.record_failure(pool, member_id)
            raise _error("bad_pin", "Joriy PIN noto'g'ri", status.HTTP_403_FORBIDDEN)
        await repository.clear_failures(pool, member_id)
    elif not session.is_admin:
        if session.member_id is None or not await repository.owns_circle_containing(
            pool, session.member_id, member_id
        ):
            raise _error(
                "not_your_record", "Bu sizning yozuvingiz emas",
                status.HTTP_403_FORBIDDEN,
            )

    if not await repository.set_pin(pool, member_id, body.new_pin, key):
        raise _error("no_member", f"'{member_id}' topilmadi", status.HTTP_404_NOT_FOUND)
    return {"ok": True}


@app.delete(f"{API_PREFIX}/members/{{member_id}}")
async def remove_member(
    member_id: str, request: Request, _: Session = Depends(require_owner_or_admin)
) -> dict:
    """Delete yourself, or anyone if you are admin. Cascades to records."""
    await repository.delete_member(request.app.state.pool, member_id)
    return {"ok": True}


# ---------------------------------------------------------------- circle routes
async def _require_owned_circle(request: Request, session: Session, circle_id: int):
    """The gate in front of everything only a circle's owner may do."""
    circle = await repository.fetch_circle(request.app.state.pool, circle_id)
    if circle is None or circle.owner_id != session.member_id:
        raise _error(
            "not_circle_owner", "Bu doira sizniki emas", status.HTTP_403_FORBIDDEN
        )
    return circle


@app.post(f"{API_PREFIX}/circles", status_code=status.HTTP_201_CREATED)
async def create_circle(
    body: CircleCreate, request: Request, session: Session = Depends(require_session)
) -> dict:
    """Start a family. The caller owns it and is its first member.

    Nobody's permission is needed: a person's own family is theirs to open, which is
    the whole reason circles exist rather than one group with a flag on it.
    """
    pool: asyncpg.Pool = request.app.state.pool
    if session.member_id is None:
        raise _error(
            "not_a_member", "Admin sessiyasi doira ocha olmaydi",
            status.HTTP_403_FORBIDDEN,
        )
    if await repository.count_circles_owned(pool, session.member_id) >= MAX_CIRCLES_OWNED:
        raise _error(
            "too_many_circles",
            f"{MAX_CIRCLES_OWNED} tadan ortiq doira ocholmaysiz", 409,
        )
    circle = await repository.create_circle(
        pool, body.name, session.member_id, body.week_goal
    )
    return circle.model_dump()


@app.patch(f"{API_PREFIX}/circles/{{circle_id}}")
async def edit_circle(
    circle_id: int, body: CircleUpdate, request: Request,
    session: Session = Depends(require_session),
) -> dict:
    """Rename a circle and set its weekly goal."""
    await _require_owned_circle(request, session, circle_id)
    circle = await repository.update_circle(
        request.app.state.pool, circle_id, body.name, body.week_goal
    )
    if circle is None:
        raise _error("no_circle", "Doira topilmadi", status.HTTP_404_NOT_FOUND)
    return circle.model_dump()


@app.delete(f"{API_PREFIX}/circles/{{circle_id}}")
async def remove_circle(
    circle_id: int, request: Request, session: Session = Depends(require_session),
) -> dict:
    """Close a family. Owner only, and never the friends circle.

    A duplicate family opened by mistake had no way out before this: it sat in the
    switcher forever and used up one of its owner's five circles. Records are not at
    stake — they belong to the member — so the only real casualty is the circle's own
    khatm and its call to pray together, which is what the client warns about.

    The friends circle is refused rather than merely hidden from the button: it is the
    one circle everybody is in, and deleting it would strand the whole group.
    """
    circle = await _require_owned_circle(request, session, circle_id)
    if circle.kind != "family":
        raise _error(
            "friends_circle", "Do'stlar doirasini o'chirib bo'lmaydi", 409
        )
    stranded = await repository.delete_circle(request.app.state.pool, circle_id)
    return {"ok": True, "stranded": stranded}


@app.get(f"{API_PREFIX}/circles/{{circle_id}}/roster")
async def circle_roster(
    circle_id: int, request: Request, session: Session = Depends(require_session)
) -> dict:
    """A circle's members with PINs in the clear, for its owner only.

    This replaces the single global admin roster: with families in the picture,
    "everyone" is no longer a group anybody should be able to enumerate.
    """
    await _require_owned_circle(request, session, circle_id)
    entries = await repository.fetch_roster(
        request.app.state.pool, circle_id,
        request.app.state.settings.pin_encryption_key,
    )
    return {"members": [e.model_dump() for e in entries]}


@app.post(
    f"{API_PREFIX}/circles/{{circle_id}}/members",
    status_code=status.HTTP_201_CREATED,
)
async def add_circle_member(
    circle_id: int, body: CircleMemberAdd, request: Request,
    session: Session = Depends(require_session),
) -> dict:
    """Put somebody in a circle: an existing login, or a person created here.

    Creating runs through this route rather than a bare `POST /members` so that
    nobody can be made into no circle at all. Such an account can log in and then see
    nothing, which is the dead end the previous stage had to put a guard in front of.

    An existing login joins without a second account, which is what lets one person
    mark a prayer once and have it count in their friends group and their family.
    """
    pool: asyncpg.Pool = request.app.state.pool
    await _require_owned_circle(request, session, circle_id)
    if await repository.count_circle_members(pool, circle_id) >= MAX_CIRCLE_MEMBERS:
        raise _error(
            "circle_full",
            f"Doirada {MAX_CIRCLE_MEMBERS} tadan ortiq a'zo bo'lmaydi", 409,
        )

    if body.member_id is not None:
        profile = await repository.fetch_member_profile(pool, body.member_id)
        if profile is None:
            raise _error(
                "no_member", f"'{body.member_id}' topilmadi",
                status.HTTP_404_NOT_FOUND,
            )
        await repository.add_to_circle(pool, circle_id, profile.id)
        return {"member": profile.model_dump()}

    if await repository.count_members(pool) >= MAX_MEMBERS:
        raise _error("group_full", f"{MAX_MEMBERS} tadan ortiq a'zo bo'lmaydi", 409)
    requested = body.new_member
    assert requested is not None  # the model guarantees one of the two
    member_id = await repository.free_member_id(pool, requested.id)
    if member_id is None:
        raise _error("duplicate_id", f"'{requested.id}' bo'sh emas", 409)
    member = requested.model_copy(update={"id": member_id})
    try:
        profile = await repository.create_member(
            pool, member, request.app.state.settings.pin_encryption_key
        )
    except asyncpg.UniqueViolationError:
        raise _error("duplicate_id", f"'{member_id}' allaqachon mavjud", 409) from None
    except AuthError as exc:
        raise _error(
            "bad_pin_format", str(exc), status.HTTP_422_UNPROCESSABLE_ENTITY
        ) from None
    await repository.add_to_circle(pool, circle_id, profile.id)
    # The PIN comes back once so the owner can read it out. It is not a new secret:
    # the roster shows it to the same person on the same screen.
    return {"member": profile.model_dump(), "pin": member.pin}


@app.delete(f"{API_PREFIX}/circles/{{circle_id}}/members/{{member_id}}")
async def remove_circle_member(
    circle_id: int, member_id: str, request: Request,
    session: Session = Depends(require_session),
) -> dict:
    """Take somebody out of a circle, or leave one yourself.

    Records are untouched. Leaving a family does not erase the prayers somebody
    logged while in it, and does not touch any other circle they are in.
    """
    pool: asyncpg.Pool = request.app.state.pool
    circle = await repository.fetch_circle(pool, circle_id)
    if circle is None:
        raise _error("no_circle", "Doira topilmadi", status.HTTP_404_NOT_FOUND)
    if circle.owner_id != session.member_id and session.member_id != member_id:
        raise _error(
            "not_circle_owner", "Bu doira sizniki emas", status.HTTP_403_FORBIDDEN
        )
    if circle.owner_id == member_id:
        raise _error("owner_stays", "Doira egasini chiqarib bo'lmaydi", 409)
    if not await repository.remove_from_circle(pool, circle_id, member_id):
        raise _error(
            "no_member", f"'{member_id}' bu doirada emas", status.HTTP_404_NOT_FOUND
        )
    return {"ok": True}


# ---------------------------------------------------------------- family routes
async def _require_family(request: Request, session: Session, circle_id: int):
    """A family circle the caller is inside.

    The family features are refused elsewhere rather than merely hidden: friends live
    in different cities and cannot pray in one room, and a khatm between people who
    do not see each other daily is a different thing than the one being built here.
    """
    pool: asyncpg.Pool = request.app.state.pool
    if not await repository.is_circle_member(pool, circle_id, session.member_id or ""):
        raise _error(
            "not_your_circle", "Bu doira sizniki emas", status.HTTP_403_FORBIDDEN
        )
    circle = await repository.fetch_circle(pool, circle_id)
    if circle is None or circle.kind != "family":
        raise _error("not_a_family", "Bu imkoniyat faqat oilada ishlaydi", 409)
    return circle


@app.post(f"{API_PREFIX}/members/{{member_id}}/qazo-debt")
async def set_qazo_debt(
    member_id: str, body: QazoDebt, request: Request,
    session: Session = Depends(require_owner_or_admin),
) -> dict:
    """State your own backlog of prayers owed from years past.

    Its own route rather than a field on the document: the document is pushed whole
    on every book edit and bonus claim, so a phone that had not caught up would send
    the backlog back as zero and wipe it. Nobody sets anybody else's — it is a claim
    about your own past.
    """
    if not await repository.set_qazo_debt(
        request.app.state.pool, member_id, body.qazo_debt
    ):
        raise _error("no_member", "A'zo topilmadi", status.HTTP_404_NOT_FOUND)
    return {"ok": True, "qazo_debt": body.qazo_debt}


@app.post(f"{API_PREFIX}/members/{{member_id}}/child")
async def set_child(
    member_id: str, body: ChildFlag, request: Request,
    session: Session = Depends(require_session),
) -> dict:
    """Turn debt and penalty work off for a child, or back on when they grow.

    A parent sets this, not the child: somebody marking themselves a child would
    simply be switching off their own arrears.
    """
    pool: asyncpg.Pool = request.app.state.pool
    if not session.is_admin:
        if session.member_id is None or not await repository.owns_circle_containing(
            pool, session.member_id, member_id
        ):
            raise _error(
                "not_circle_owner", "Buni doira egasi belgilaydi",
                status.HTTP_403_FORBIDDEN,
            )
    if not await repository.set_child(pool, member_id, body.is_child):
        raise _error("no_member", f"'{member_id}' topilmadi", status.HTTP_404_NOT_FOUND)
    return {"ok": True}


@app.post(f"{API_PREFIX}/circles/{{circle_id}}/jamoat", status_code=201)
async def call_jamoat(
    circle_id: int, body: JamoatCallCreate, request: Request,
    session: Session = Depends(require_session),
) -> dict:
    """Say "we are praying this one together". Anyone in the family may start it.

    This records the call, never anybody's prayer. Each person still marks their own,
    which is why joining costs the caller nothing and gives them nothing.
    """
    await _require_family(request, session, circle_id)
    call = await repository.call_jamoat(
        request.app.state.pool, circle_id, body.day, body.prayer,
        session.member_id or "",
    )
    return call.model_dump(mode="json")


@app.post(f"{API_PREFIX}/circles/{{circle_id}}/khatm", status_code=201)
async def start_khatm(
    circle_id: int, body: KhatmCreate, request: Request,
    session: Session = Depends(require_session),
) -> dict:
    """Open a khatm for the family. One at a time, so the progress bar means something."""
    pool: asyncpg.Pool = request.app.state.pool
    await _require_family(request, session, circle_id)
    if await repository.fetch_open_khatm(pool, circle_id) is not None:
        raise _error("khatm_open", "Tugallanmagan xatm bor", 409)
    khatm = await repository.create_khatm(pool, circle_id, body.name, body.started)
    return khatm.model_dump(mode="json")


async def _require_khatm(request: Request, circle_id: int, khatm_id: int) -> None:
    if not await repository.khatm_belongs_to(
        request.app.state.pool, khatm_id, circle_id
    ):
        raise _error("no_khatm", "Xatm topilmadi", status.HTTP_404_NOT_FOUND)


@app.post(f"{API_PREFIX}/circles/{{circle_id}}/khatm/{{khatm_id}}/juz/{{juz}}")
async def take_juz(
    circle_id: int, khatm_id: int, juz: int, request: Request,
    session: Session = Depends(require_session),
) -> dict:
    """Take a free juz. Whoever has time reaches for one; nobody is assigned."""
    await _require_family(request, session, circle_id)
    await _require_khatm(request, circle_id, khatm_id)
    if not 1 <= juz <= 30:
        raise _error("bad_juz", "Pora 1 dan 30 gacha", 422)
    if not await repository.take_juz(
        request.app.state.pool, khatm_id, juz, session.member_id or ""
    ):
        raise _error("juz_taken", f"{juz}-pora allaqachon olingan", 409)
    return {"ok": True}


@app.delete(f"{API_PREFIX}/circles/{{circle_id}}/khatm/{{khatm_id}}/juz/{{juz}}")
async def release_juz(
    circle_id: int, khatm_id: int, juz: int, request: Request,
    session: Session = Depends(require_session),
) -> dict:
    """Give back a juz you took and have not read. Read stays read."""
    await _require_family(request, session, circle_id)
    await _require_khatm(request, circle_id, khatm_id)
    if not await repository.release_juz(
        request.app.state.pool, khatm_id, juz, session.member_id or ""
    ):
        raise _error("not_yours", "Bu pora sizniki emas yoki o'qib bo'lingan", 409)
    return {"ok": True}


@app.post(f"{API_PREFIX}/circles/{{circle_id}}/khatm/{{khatm_id}}/juz/{{juz}}/done")
async def finish_juz(
    circle_id: int, khatm_id: int, juz: int, request: Request,
    session: Session = Depends(require_session),
) -> dict:
    """Mark your juz read. The khatm closes itself once all thirty are."""
    pool: asyncpg.Pool = request.app.state.pool
    await _require_family(request, session, circle_id)
    await _require_khatm(request, circle_id, khatm_id)
    if not await repository.finish_juz(pool, khatm_id, juz, session.member_id or ""):
        raise _error("not_yours", "Bu pora sizniki emas yoki o'qib bo'lingan", 409)
    await repository.close_khatm_if_complete(pool, khatm_id, Date.today())
    return {"ok": True}


class RevalidatingStatic(StaticFiles):
    """Serve the client with revalidation forced on every load.

    Without a Cache-Control header the browser falls back to heuristic caching, and
    a phone — iOS especially, once the page is on the home screen — can keep serving
    a stored copy for days. A deploy then silently never reaches the person holding
    the phone, which is exactly how a fixed bug looks unfixed.

    `no-cache` does not mean "do not store": the conditional request still answers
    304 from the ETag already being sent, so the cost is a round trip rather than
    the 90 KB body.
    """

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers.setdefault("Cache-Control", "no-cache")
        return response


# Mounted last so it never shadows the API routes above.
app.mount("/", RevalidatingStatic(directory=STATIC_DIR, html=True), name="static")
