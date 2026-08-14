"""Notification routes: VAPID public key, push-subscription management, test send.

- ``GET  /vapid-public-key`` — public key for the browser's ``pushManager`` (no auth).
- ``POST /subscribe`` — register (or refresh) a device's push subscription.
- ``DELETE /subscribe`` — remove a device's push subscription.
- ``POST /test`` — generate today's LLM summary and push it to all the user's
  devices (rate-limited — it can spend real money on LLM calls).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import PushSubscription, User
from app.ratelimit import limiter
from app.schemas import (
    CustomNotificationIn,
    CustomNotificationOut,
    PushSubscriptionIn,
    TestNotificationIn,
    TestNotificationOut,
)
from app.services.summary import (
    LLMUnavailableError,
    send_custom_notification,
    send_daily_summary,
)

router = APIRouter()
settings = get_settings()


@router.get("/vapid-public-key")
async def vapid_public_key() -> dict[str, str | bool]:
    """Notification capabilities: the public VAPID key for subscribing
    (empty ⇒ notifications disabled) and whether the LLM is configured.
    """
    return {
        "public_key": settings.vapid_public_key,
        "llm_configured": bool(settings.llm_base_url),
    }


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(
    payload: PushSubscriptionIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Register or refresh this device's push subscription for the user."""
    existing = await db.scalar(
        select(PushSubscription).where(
            PushSubscription.user_id == user.id,
            PushSubscription.endpoint == payload.endpoint,
        )
    )
    if existing is None:
        existing = PushSubscription(user_id=user.id, endpoint=payload.endpoint)
        db.add(existing)
    existing.p256dh = payload.keys.p256dh
    existing.auth = payload.keys.auth
    existing.user_agent = request.headers.get("user-agent")
    await db.commit()
    return Response(status_code=status.HTTP_201_CREATED)


@router.delete("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    endpoint: str = Query(..., min_length=1, max_length=2000),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Remove this device's push subscription for the user (idempotent)."""
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user.id,
            PushSubscription.endpoint == endpoint,
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/test", response_model=TestNotificationOut)
@limiter.limit(settings.rate_limit_notifications)
async def send_test(
    request: Request,
    payload: TestNotificationIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TestNotificationOut:
    """Generate today's daily summary and push it to the user's devices."""
    device_count = await db.scalar(
        select(func.count())
        .select_from(PushSubscription)
        .where(PushSubscription.user_id == user.id)
    )
    if not device_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No devices are set up for notifications yet — enable them in Settings first.",
        )
    return await send_daily_summary(user, db, payload.timezone)


@router.post("/test-llm", response_model=CustomNotificationOut)
@limiter.limit(settings.rate_limit_notifications)
async def send_test_llm(
    request: Request,
    payload: CustomNotificationIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomNotificationOut:
    """Send a custom notification whose body is written by the LLM."""
    if not settings.llm_base_url:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "AI notifications are off — set LLM_BASE_URL (and LLM_API_KEY if needed) "
                "in the server's .env, then restart the server."
            ),
        )
    device_count = await db.scalar(
        select(func.count())
        .select_from(PushSubscription)
        .where(PushSubscription.user_id == user.id)
    )
    if not device_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No devices are set up for notifications yet — enable them in Settings first.",
        )
    try:
        return await send_custom_notification(user, db, payload.message)
    except LLMUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
