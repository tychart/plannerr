"""Scheduled daily notifications: per-user schedule + the scheduler job.

The job (``check_and_send_due``) runs on an APScheduler interval inside the
FastAPI lifespan. For every enabled schedule it:

1. resolves the user's local "now" in their stored timezone,
2. skips unless the local clock matches the configured send time,
3. skips if today's summary was already evaluated (sent or skipped),
4. checks there is actually something due today (due before end of local today,
   incl. overdue, excluding completed),
5. sends via ``send_daily_summary`` (LLM summary + push) and marks the day.

``now`` is injectable so the matching logic is unit-testable.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.db import SessionFactory
from app.models import Assignment, NotificationSchedule, PushSubscription, User
from app.schemas import NotificationScheduleIn, NotificationScheduleOut
from app.services.summary import send_daily_summary, today_bounds

logger = logging.getLogger(__name__)


def _resolve_tz(name: str) -> ZoneInfo | timezone:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return timezone.utc


def _to_out(row: NotificationSchedule) -> NotificationScheduleOut:
    return NotificationScheduleOut(
        enabled=row.enabled,
        time=f"{row.send_time:%H:%M}",
        timezone=row.timezone,
    )


async def get_schedule(user_id, db: AsyncSession) -> NotificationScheduleOut:
    """Return the user's schedule, or safe defaults when none is saved yet."""
    row = await db.get(NotificationSchedule, user_id)
    if row is None:
        return NotificationScheduleOut(
            enabled=False,
            time=get_settings().default_notification_time,
            timezone="",
        )
    return _to_out(row)


async def save_schedule(
    user: User, db: AsyncSession, payload: NotificationScheduleIn
) -> NotificationScheduleOut:
    """Upsert the user's schedule.

    Enabling (or first enabling) clears ``last_sent_date`` so the new schedule
    takes effect the same day; re-saving an already-enabled schedule keeps the
    once-per-day guard (no surprise double sends).
    """
    row = await db.get(NotificationSchedule, user.id)
    was_enabled = row.enabled if row is not None else False

    if row is None:
        row = NotificationSchedule(user_id=user.id)
        db.add(row)

    hour, minute = (int(part) for part in payload.time.split(":"))
    row.enabled = payload.enabled
    row.send_time = time(hour, minute)
    row.timezone = payload.timezone
    if payload.enabled and not was_enabled:
        row.last_sent_date = None

    await db.commit()
    await db.refresh(row)
    return _to_out(row)


async def has_assignments_due(
    user_id, db: AsyncSession, tz_name: str, now: datetime | None = None
) -> bool:
    """True when the user has an actionable assignment due before end of local today."""
    _, _, end_utc = today_bounds(tz_name, now)
    count = await db.scalar(
        select(func.count())
        .select_from(Assignment)
        .where(
            Assignment.user_id == user_id,
            Assignment.progress < 100,
            Assignment.due_at < end_utc,
        )
    )
    return bool(count)


async def check_and_send_due(now: datetime | None = None) -> int:
    """Scheduler entrypoint — send every daily summary that is due right now.

    Returns how many notifications were sent. Never raises: per-user failures
    are logged so one broken schedule can't stop the rest.
    """
    if now is None or now.tzinfo is None:
        now = datetime.now(timezone.utc)

    sent = 0
    async with SessionFactory() as db:
        schedules = (
            await db.execute(
                select(NotificationSchedule)
                .options(selectinload(NotificationSchedule.user))
                .where(NotificationSchedule.enabled.is_(True))
            )
        ).scalars()

        for row in schedules:
            try:
                local_now = now.astimezone(_resolve_tz(row.timezone))
                if local_now.strftime("%H:%M") != f"{row.send_time:%H:%M}":
                    continue
                if row.last_sent_date == local_now.date():
                    continue
                if not await has_assignments_due(row.user_id, db, row.timezone, now):
                    logger.info("Skipping daily summary for user %s: nothing due today", row.user_id)
                else:
                    device_count = await db.scalar(
                        select(func.count())
                        .select_from(PushSubscription)
                        .where(PushSubscription.user_id == row.user_id)
                    )
                    if not device_count:
                        logger.info(
                            "Skipping daily summary for user %s: no devices enrolled",
                            row.user_id,
                        )
                    else:
                        await send_daily_summary(row.user, db, row.timezone)
                        sent += 1
                        logger.info("Sent daily summary for user %s", row.user_id)
                # Mark the user-local day as evaluated (sent or skipped) so the
                # job only acts once per day.
                row.last_sent_date = local_now.date()
            except Exception:
                logger.exception("Scheduled daily summary failed for user %s", row.user_id)
        await db.commit()
    return sent
