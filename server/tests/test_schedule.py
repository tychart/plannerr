"""Tests for the daily-notification schedule API + the scheduler job."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import httpx
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.services.schedule import check_and_send_due, has_assignments_due
from tests.conftest import TEST_DATABASE_URL
from tests.helpers import create_assignment, create_class, register

ENDPOINT = "https://push.example.com/sched-device"


def _schedule_payload(time: str = "08:00", timezone_name: str = "UTC", enabled: bool = True) -> dict:
    return {"enabled": enabled, "time": time, "timezone": timezone_name}


async def _schedule_state(user_id: str) -> dict:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.connect() as conn:
        r = await conn.execute(
            text(
                "SELECT enabled, to_char(send_time, 'HH24:MI') AS time, timezone, last_sent_date "
                "FROM notification_schedules WHERE user_id = :uid"
            ),
            {"uid": user_id},
        )
        row = r.first()
    await engine.dispose()
    return None if row is None else dict(row._mapping)


# ── API ─────────────────────────────────────────────────────────────────────

async def test_get_schedule_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/api/v1/notifications/schedule")
    assert r.status_code == 401


async def test_get_schedule_returns_defaults(client: AsyncClient) -> None:
    await register(client)
    r = await client.get("/api/v1/notifications/schedule")
    assert r.status_code == 200
    assert r.json() == {"enabled": False, "time": "08:00", "timezone": ""}


async def test_put_schedule_saves_and_get_returns(client: AsyncClient) -> None:
    user = await register(client)
    r = await client.put(
        "/api/v1/notifications/schedule",
        json=_schedule_payload(time="07:30", timezone_name="America/Denver"),
    )
    assert r.status_code == 200
    assert r.json() == {"enabled": True, "time": "07:30", "timezone": "America/Denver"}

    state = await _schedule_state(user["id"])
    assert state["enabled"] is True
    assert state["time"] == "07:30"
    assert state["timezone"] == "America/Denver"

    r2 = await client.get("/api/v1/notifications/schedule")
    assert r2.json() == {"enabled": True, "time": "07:30", "timezone": "America/Denver"}


async def test_put_schedule_validates_time_and_timezone(client: AsyncClient) -> None:
    await register(client)
    bad_time = await client.put(
        "/api/v1/notifications/schedule", json=_schedule_payload(time="25:99")
    )
    assert bad_time.status_code == 422
    bad_tz = await client.put(
        "/api/v1/notifications/schedule",
        json=_schedule_payload(timezone_name="Not/AZone"),
    )
    assert bad_tz.status_code == 422


# ── Scheduler job ────────────────────────────────────────────────────────────

NOW = datetime(2026, 8, 14, 8, 0, 0, tzinfo=timezone.utc)  # 08:00 UTC on a Friday


async def _enabled_user_with_due_assignment(client: AsyncClient) -> str:
    """Register a user with a device + an assignment due today + a matching schedule."""
    user = await register(client, "sched_user")
    await client.post(
        "/api/v1/notifications/subscribe",
        json={"endpoint": ENDPOINT, "keys": {"p256dh": "k", "auth": "a"}},
    )
    cls = await create_class(client)
    await create_assignment(
        client,
        cls["id"],
        title="Physics lab",
        due_at=datetime(2026, 8, 14, 14, 0, tzinfo=timezone.utc),
    )
    await client.put(
        "/api/v1/notifications/schedule",
        json=_schedule_payload(time="08:00", timezone_name="UTC"),
    )
    return user["id"]


async def test_check_and_send_sends_when_due(client: AsyncClient, monkeypatch) -> None:
    user_id = await _enabled_user_with_due_assignment(client)

    sent = []

    def fake_webpush(**kwargs) -> None:
        sent.append(kwargs)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    result = await check_and_send_due(now=NOW)
    assert result == 1
    assert len(sent) == 1
    state = await _schedule_state(user_id)
    assert state["last_sent_date"].isoformat() == "2026-08-14"


async def test_check_and_send_skips_when_nothing_due(client: AsyncClient, monkeypatch) -> None:
    user = await register(client, "empty_user")
    await client.post(
        "/api/v1/notifications/subscribe",
        json={"endpoint": ENDPOINT, "keys": {"p256dh": "k", "auth": "a"}},
    )
    await client.put(
        "/api/v1/notifications/schedule",
        json=_schedule_payload(time="08:00", timezone_name="UTC"),
    )

    sent = []

    def fake_webpush(**kwargs) -> None:
        sent.append(kwargs)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    result = await check_and_send_due(now=NOW)
    assert result == 0
    assert sent == []
    # Still marked evaluated so the job doesn't re-check all day.
    state = await _schedule_state(user["id"])
    assert state["last_sent_date"].isoformat() == "2026-08-14"


async def test_check_and_send_skips_wrong_minute(client: AsyncClient, monkeypatch) -> None:
    await _enabled_user_with_due_assignment(client)

    sent = []

    def fake_webpush(**kwargs) -> None:
        sent.append(kwargs)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    result = await check_and_send_due(now=NOW.replace(minute=31))
    assert result == 0
    assert sent == []


async def test_check_and_send_sends_once_per_day(client: AsyncClient, monkeypatch) -> None:
    user_id = await _enabled_user_with_due_assignment(client)

    sent = []

    def fake_webpush(**kwargs) -> None:
        sent.append(kwargs)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    assert await check_and_send_due(now=NOW) == 1
    assert await check_and_send_due(now=NOW) == 0  # same day → no repeat
    assert len(sent) == 1
    state = await _schedule_state(user_id)
    assert state["last_sent_date"].isoformat() == "2026-08-14"


async def test_check_and_send_skips_when_no_devices(client: AsyncClient, monkeypatch) -> None:
    """A schedule with no enrolled devices is skipped (and marked evaluated)."""
    user = await register(client, "nodevice_user")
    cls = await create_class(client)
    await create_assignment(
        client,
        cls["id"],
        title="Homework",
        due_at=datetime(2026, 8, 14, 14, 0, tzinfo=timezone.utc),
    )
    await client.put(
        "/api/v1/notifications/schedule",
        json=_schedule_payload(time="08:00", timezone_name="UTC"),
    )

    sent = []

    def fake_webpush(**kwargs) -> None:
        sent.append(kwargs)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    result = await check_and_send_due(now=NOW)
    assert result == 0
    assert sent == []
    state = await _schedule_state(user["id"])
    assert state["last_sent_date"].isoformat() == "2026-08-14"


async def test_has_assignments_due_respects_timezone(client: AsyncClient) -> None:
    """03:00Z on Aug 15 is after Aug 14 in UTC, but 21:00 MDT on Aug 14 in Denver."""
    user = await register(client, "tz_user")
    cls = await create_class(client)
    await create_assignment(
        client,
        cls["id"],
        title="Late homework",
        due_at=datetime(2026, 8, 15, 3, 0, tzinfo=timezone.utc),
    )

    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    from sqlalchemy.ext.asyncio import async_sessionmaker

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        due_utc = await has_assignments_due(user["id"], db, "UTC", now=NOW)
        due_denver = await has_assignments_due(user["id"], db, "America/Denver", now=NOW)
    await engine.dispose()

    assert due_utc is False  # 03:00Z Aug 15 is after the end of Aug 14 in UTC
    assert due_denver is True  # 03:00Z Aug 15 = 21:00 MDT Aug 14 → still today in Denver
