"""Authentication routes: register, login, logout, me.

- Registration auto-creates the user's "Default" class.
- Sessions are stored server-side; the browser holds an HttpOnly cookie
  containing an opaque token (only its SHA-256 is persisted).
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.constants import DEFAULT_CLASS_COLOR, DEFAULT_CLASS_NAME
from app.db import get_db
from app.deps import get_current_user
from app.models import Class, Session as SessionModel
from app.models import User
from app.ratelimit import limiter
from app.schemas import LoginIn, RegisterIn, UserOut
from app.security import (
    generate_session_token,
    hash_password,
    hash_token,
    validate_password,
    validate_username,
    verify_password,
)

router = APIRouter()
settings = get_settings()


def _set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=raw_token,
        max_age=settings.cookie_max_age,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.cookie_name, path="/")


async def _create_session(db: AsyncSession, user: User) -> str:
    """Create a session row and return the raw cookie token."""
    raw_token, token_hash = generate_session_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days)
    db.add(SessionModel(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    return raw_token


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.rate_limit_auth)
async def register(
    request: Request,
    payload: RegisterIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Create an account (with a "Default" class) and log the user in."""
    if error := validate_username(payload.username):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
    if error := validate_password(payload.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

    existing = await db.scalar(
        select(User).where(func.lower(User.username) == payload.username.lower())
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Username is already taken"
        )

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.add(
        Class(
            user=user,
            name=DEFAULT_CLASS_NAME,
            color=DEFAULT_CLASS_COLOR,
        )
    )
    await db.flush()  # assign user.id before creating the session row
    raw_token = await _create_session(db, user)
    await db.commit()
    await db.refresh(user)

    _set_session_cookie(response, raw_token)
    return user


@router.post("/login", response_model=UserOut)
@limiter.limit(settings.rate_limit_auth)
async def login(
    request: Request,
    payload: LoginIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate and start a session."""
    await db.execute(
        delete(SessionModel).where(SessionModel.expires_at <= datetime.now(timezone.utc))
    )
    user = await db.scalar(
        select(User).where(func.lower(User.username) == payload.username.lower())
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password"
        )

    raw_token = await _create_session(db, user)
    await db.commit()
    await db.refresh(user)

    _set_session_cookie(response, raw_token)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    session_cookie: str | None = Cookie(default=None, alias=settings.cookie_name),
) -> Response:
    """Delete the current session and clear the cookie. Idempotent."""
    if session_cookie is not None:
        await db.execute(
            delete(SessionModel).where(SessionModel.token_hash == hash_token(session_cookie))
        )
        await db.commit()
    _clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)) -> User:
    """Return the currently authenticated user (drives app boot)."""
    return current_user
