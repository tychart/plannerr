"""Daily-summary generation and delivery.

Two pieces, kept separate so a future scheduler can reuse ``send_daily_summary``:

- ``generate_summary`` — builds the notification text. Tries the configured
  OpenAI-compatible LLM (LiteLLM proxy, Ollama, …) and falls back to a
  deterministic summary when it's unconfigured or fails.
- ``send_daily_summary`` — queries the user's assignments due before the end of
  their local "today", generates the summary, and pushes it to every device the
  user has registered (pruning dead subscriptions).
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, time as dt_time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models import Assignment, PushSubscription, User
from app.schemas import CustomNotificationOut, TestNotificationOut

logger = logging.getLogger(__name__)

SummarySource = Literal["llm", "fallback"]

SYSTEM_PROMPT = (
    "You are a friendly study assistant for a personal assignment tracker. "
    "Summarize what the user needs to do today in 1-3 short, warm sentences. "
    "Plain text only — no markdown, no bullet lists, no emoji. "
    "Mention overdue and high-priority items first. "
    "Do not invent assignments or numbers that are not in the list. "
    "Keep it under 280 characters."
)

CUSTOM_SYSTEM_PROMPT = (
    "You write short, friendly push notifications for a personal app. "
    "Rewrite the user's message into 1-2 warm sentences. "
    "Plain text only — no markdown, no bullet lists, no emoji. "
    "Keep the user's intent exactly; do not add information that isn't there. "
    "Keep it under 200 characters."
)

MAX_TOKENS = 160
TEMPERATURE = 0.7


class LLMUnavailableError(RuntimeError):
    """Raised when the LLM cannot be used (not configured or unreachable)."""


def _today_bounds(tz_name: str) -> tuple[datetime, datetime, datetime]:
    """Return (local_now, start_of_today_utc, end_of_today_utc) for ``tz_name``."""
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = timezone.utc
    local_now = datetime.now(tz)
    start_local = datetime.combine(local_now.date(), dt_time.min, tzinfo=tz)
    end_local = datetime.combine(local_now.date(), dt_time.max, tzinfo=tz)
    return local_now, start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def _due_label(due_local: datetime, local_now: datetime, is_overdue: bool) -> str:
    """Friendly due-time label in the user's local time."""
    if is_overdue:
        return "overdue"
    if due_local.hour == 0 and due_local.minute == 0:
        return "all day"
    delta = due_local - local_now
    if delta <= timedelta(minutes=15):
        return "due any minute"
    if delta <= timedelta(hours=1):
        minutes = max(1, round(delta.total_seconds() / 60 / 5) * 5)
        return f"due in ~{minutes} min"
    ampm = due_local.strftime("%I:%M %p").lower().lstrip("0")
    return f"due at {ampm}"


def _item_dict(
    a: Assignment, start_utc: datetime, tz: ZoneInfo | timezone, local_now: datetime
) -> dict:
    due_local = a.due_at.astimezone(tz)
    return {
        "title": a.title,
        "class": a.class_.name,
        "due": _due_label(due_local, local_now, a.due_at < start_utc),
        "is_overdue": a.due_at < start_utc,
        "is_priority": a.is_priority,
    }


def _fallback_summary(items: list[dict]) -> str:
    """Deterministic summary used when the LLM is unconfigured or fails."""
    overdue = [i for i in items if i["is_overdue"]]
    due_today = [i for i in items if not i["is_overdue"]]

    def describe(group: list[dict]) -> str:
        return ", ".join(
            f"{i['title']} ({i['class']}, {i['due']})"
            + (" — high priority" if i["is_priority"] else "")
            for i in group
        )

    if overdue and due_today:
        return (
            f"Good morning! {len(due_today)} assignment"
            f"{'' if len(due_today) == 1 else 's'} due today: {describe(due_today)}. "
            f"{len(overdue)} is overdue: {describe(overdue)}. Start with the overdue "
            "one — you've got this!"
        )
    if due_today:
        return (
            f"Good morning! {len(due_today)} assignment"
            f"{'' if len(due_today) == 1 else 's'} due today: {describe(due_today)}. "
            "You've got this!"
        )
    if overdue:
        return (
            f"Good morning! {len(overdue)} assignment"
            f"{'' if len(overdue) == 1 else 's'} overdue: {describe(overdue)}. "
            "Catch up when you can."
        )
    return "Good morning! Nothing is due today — a great day to get ahead."


async def _chat_completion(messages: list[dict[str, str]]) -> str:
    """POST ``messages`` to the configured OpenAI-compatible endpoint; return text."""
    settings = get_settings()
    url = settings.llm_base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"
    payload = {
        "model": settings.llm_model,
        "messages": messages,
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
    }
    async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


async def _llm_summary(items: list[dict], today_str: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": json.dumps(
                {"today": today_str, "assignments": items}, ensure_ascii=False
            ),
        },
    ]
    return await _chat_completion(messages)


def _llm_error_detail(exc: Exception) -> str:
    """Short, human-readable cause for an LLM call failure (for error messages)."""
    if isinstance(exc, httpx.HTTPStatusError):
        body = exc.response.text.strip()[:160]
        return f"HTTP {exc.response.status_code}" + (f" — {body}" if body else "")
    if isinstance(exc, httpx.ConnectError):
        return (
            "connection refused — is the LLM host reachable from the server container? "
            "On Podman/Docker try host.containers.internal or the host's LAN IP"
        )
    if isinstance(exc, httpx.ConnectTimeout):
        return "connection timed out"
    if isinstance(exc, httpx.TimeoutException):
        return "timed out"
    if isinstance(exc, httpx.HTTPError):
        return str(exc)[:200]
    return f"{type(exc).__name__}: {exc}"[:200]


async def generate_custom_notification(message: str) -> str:
    """Ask the LLM to turn ``message`` into a friendly notification body.

    Raises ``LLMUnavailableError`` when the LLM is unconfigured or unreachable.
    """
    settings = get_settings()
    if not settings.llm_base_url:
        raise LLMUnavailableError(
            "AI notifications are off — set LLM_BASE_URL (and LLM_API_KEY if needed) "
            "in the server's .env, then restart the server."
        )
    try:
        text = await _chat_completion(
            [
                {"role": "system", "content": CUSTOM_SYSTEM_PROMPT},
                {"role": "user", "content": message},
            ]
        )
    except Exception as exc:
        url = settings.llm_base_url.rstrip("/") + "/chat/completions"
        logger.exception("Custom LLM notification failed (url=%s)", url)
        raise LLMUnavailableError(
            f"Couldn't reach the LLM at {url} — {_llm_error_detail(exc)}"
        ) from exc
    if not text:
        raise LLMUnavailableError("The LLM returned an empty response — try again.")
    return text[:500]


async def generate_summary(
    items: list[dict], today_str: str
) -> tuple[str, SummarySource]:
    """LLM summary when configured, deterministic fallback otherwise."""
    settings = get_settings()
    if settings.llm_base_url:
        try:
            text = await _llm_summary(items, today_str)
            if text:
                return text[:500], "llm"
            logger.warning("LLM returned an empty summary; using fallback")
        except Exception:
            logger.exception("LLM summary failed; using deterministic fallback")
    return _fallback_summary(items), "fallback"


async def _push_to_subscriptions(user: User, db: AsyncSession, payload: dict) -> int:
    """Deliver ``payload`` to every device the user has registered.

    Prunes dead subscriptions (HTTP 404/410) and returns how many pushes
    were delivered successfully.
    """
    settings = get_settings()
    subscriptions = list(
        (
            await db.execute(
                select(PushSubscription).where(PushSubscription.user_id == user.id)
            )
        ).scalars()
    )
    if not subscriptions:
        return 0

    from pywebpush import WebPushException, webpush  # heavy import, only when sending

    payload_json = json.dumps(payload)
    delivered = 0
    for sub in subscriptions:
        try:
            # webpush() is sync (uses requests) — run it off the event loop.
            await asyncio.to_thread(
                webpush,
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload_json,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
                timeout=10,
            )
            delivered += 1
        except WebPushException as exc:
            status_code = getattr(exc.response, "status_code", None)
            if status_code in (404, 410):
                logger.info("Pruning dead push subscription (%s): %s", status_code, sub.endpoint)
                await db.execute(delete(PushSubscription).where(PushSubscription.id == sub.id))
            else:
                logger.warning("Push to %s failed: %s", sub.endpoint, exc)
        except Exception:
            logger.exception("Unexpected push error for %s", sub.endpoint)
    await db.commit()
    return delivered


async def send_daily_summary(
    user: User, db: AsyncSession, tz_name: str
) -> TestNotificationOut:
    """Build today's summary for ``user`` and push it to all their devices."""
    local_now, start_utc, end_utc = _today_bounds(tz_name)
    tz = local_now.tzinfo

    result = await db.execute(
        select(Assignment)
        .options(selectinload(Assignment.class_))
        .where(
            Assignment.user_id == user.id,
            Assignment.progress < 100,
            Assignment.due_at < end_utc,
        )
        .order_by(Assignment.due_at)
    )
    assignments = result.scalars().all()

    items = [_item_dict(a, start_utc, tz, local_now) for a in assignments]
    today_str = local_now.strftime("%A, %B %-d, %Y")
    summary, source = await generate_summary(items, today_str)

    delivered = await _push_to_subscriptions(
        user,
        db,
        {
            "title": "Your day in Plannerr",
            "body": summary,
            "url": "/",
            "tag": "plannerr-daily",
        },
    )
    return TestNotificationOut(device_count=delivered, summary=summary, source=source)


async def send_custom_notification(
    user: User, db: AsyncSession, message: str
) -> CustomNotificationOut:
    """Turn ``message`` into a custom LLM notification and push it to devices."""
    body = await generate_custom_notification(message)
    delivered = await _push_to_subscriptions(
        user,
        db,
        {
            "title": "Plannerr",
            "body": body,
            "url": "/",
            "tag": "plannerr-custom",
        },
    )
    return CustomNotificationOut(device_count=delivered, body=body)
