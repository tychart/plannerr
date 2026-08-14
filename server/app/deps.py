"""Shared FastAPI dependencies."""

from datetime import datetime, timezone

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.models import Session as SessionModel
from app.models import User
from app.security import hash_token

settings = get_settings()


async def get_current_user(
    session_cookie: str | None = Cookie(default=None, alias=settings.cookie_name),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the logged-in user from the session cookie, or 401."""
    if session_cookie is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token_hash = hash_token(session_cookie)
    result = await db.execute(
        select(SessionModel).where(
            SessionModel.token_hash == token_hash,
            SessionModel.expires_at > datetime.now(timezone.utc),
        )
    )
    db_session = result.scalar_one_or_none()
    if db_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid"
        )

    user = await db.get(User, db_session.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user
