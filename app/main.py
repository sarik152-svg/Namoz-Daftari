"""HTTP layer for Namoz Daftari.

Every request except the login screen's name list carries a session token. The
session says who you are, and writes compare that identity against the member being
written to. There is no shared secret: ownership is structural, not a header check.

Admin is a second kind of session with unrestricted power, including reading PINs.
That is a deliberate, owner-approved trade-off recorded in the design spec.
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
from app.config import ADMIN_SUBJECT, MAX_MEMBERS, STATIC_DIR, load_settings
from app.db import create_pool, run_migrations
from app.models import (
    AdminLoginRequest,
    DayRecord,
    LoginRequest,
    MemberCreate,
    MemberData,
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


async def require_admin(session: Session = Depends(require_session)) -> Session:
    if not session.is_admin:
        raise _error("not_admin", "Faqat admin uchun", status.HTTP_403_FORBIDDEN)
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


@app.get(f"{API_PREFIX}/auth/members")
async def list_login_names(request: Request) -> dict:
    """Names for the login picker. Deliberately public, and deliberately minimal:
    ids and display names only, never a city, a PIN, or a record."""
    members = await repository.fetch_public_members(request.app.state.pool)
    return {"members": [m.model_dump() for m in members]}


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
    session: Session = Depends(require_owner_or_admin),
) -> dict:
    """Members prove the current PIN to change it. Admin sets it outright."""
    pool: asyncpg.Pool = request.app.state.pool
    key = request.app.state.settings.pin_encryption_key

    if not session.is_admin:
        stored = await repository.fetch_encrypted_pin(pool, member_id)
        await _guard_throttle(pool, member_id)
        if stored is None or not verify_pin(body.current_pin, stored, key):
            await repository.record_failure(pool, member_id)
            raise _error("bad_pin", "Joriy PIN noto'g'ri", status.HTTP_403_FORBIDDEN)
        await repository.clear_failures(pool, member_id)

    await repository.set_pin(pool, member_id, body.new_pin, key)
    return {"ok": True}


@app.delete(f"{API_PREFIX}/members/{{member_id}}")
async def remove_member(
    member_id: str, request: Request, _: Session = Depends(require_owner_or_admin)
) -> dict:
    """Delete yourself, or anyone if you are admin. Cascades to records."""
    await repository.delete_member(request.app.state.pool, member_id)
    return {"ok": True}


# ---------------------------------------------------------------- admin routes
@app.get(f"{API_PREFIX}/admin/roster", dependencies=[Depends(require_admin)])
async def admin_roster(request: Request) -> dict:
    """The roster with PINs in the clear. Admin only, by explicit design."""
    entries = await repository.fetch_roster(
        request.app.state.pool, request.app.state.settings.pin_encryption_key
    )
    return {"members": [e.model_dump() for e in entries]}


@app.post(
    f"{API_PREFIX}/members",
    dependencies=[Depends(require_admin)],
    status_code=status.HTTP_201_CREATED,
)
async def add_member(member: MemberCreate, request: Request) -> dict:
    pool: asyncpg.Pool = request.app.state.pool
    if await repository.count_members(pool) >= MAX_MEMBERS:
        raise _error("group_full", f"Guruhda {MAX_MEMBERS} tadan ortiq a'zo bo'lmaydi", 409)
    try:
        profile = await repository.create_member(
            pool, member, request.app.state.settings.pin_encryption_key
        )
    except asyncpg.UniqueViolationError:
        raise _error("duplicate_id", f"'{member.id}' allaqachon mavjud", 409) from None
    except AuthError as exc:
        raise _error("bad_pin_format", str(exc), status.HTTP_422_UNPROCESSABLE_ENTITY) from None
    return profile.model_dump()


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
