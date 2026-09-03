"""Unit tests for daily-summary due-time labels (pure logic, no HTTP/DB)."""

from datetime import datetime, timezone

from app.services.summary import _due_label

MORNING = datetime(2026, 8, 14, 7, 0, 0, tzinfo=timezone.utc)  # 7:00 AM UTC


async def test_date_only_sentinel_reads_end_of_day() -> None:
    # The app's sentinel for "no time set": 23:59:59 local.
    due = datetime(2026, 8, 14, 23, 59, 59, tzinfo=timezone.utc)
    assert _due_label(due, MORNING, is_overdue=False) == "end of day"


async def test_date_only_is_microsecond_robust() -> None:
    due = datetime(2026, 8, 14, 23, 59, 59, 999999, tzinfo=timezone.utc)
    assert _due_label(due, MORNING, is_overdue=False) == "end of day"


async def test_date_only_beats_nearby_time_buckets() -> None:
    # Even within the "due any minute" window the sentinel still reads end of day.
    now = datetime(2026, 8, 14, 23, 55, 0, tzinfo=timezone.utc)
    due = datetime(2026, 8, 14, 23, 59, 59, tzinfo=timezone.utc)
    assert _due_label(due, now, is_overdue=False) == "end of day"


async def test_overdue_wins_over_sentinel() -> None:
    due = datetime(2026, 8, 13, 23, 59, 59, tzinfo=timezone.utc)
    assert _due_label(due, MORNING, is_overdue=True) == "overdue"


async def test_midnight_is_a_real_time_not_end_of_day() -> None:
    # A deliberately chosen 12:00 AM due time is labelled honestly, not as a
    # date-only sentinel (next-day midnight keeps it comfortably in the future).
    due = datetime(2026, 8, 15, 0, 0, 0, tzinfo=timezone.utc)
    assert _due_label(due, MORNING, is_overdue=False) == "due at 12:00 am"


async def test_time_buckets() -> None:
    assert _due_label(
        datetime(2026, 8, 14, 7, 5, 0, tzinfo=timezone.utc), MORNING, False
    ) == "due any minute"
    assert _due_label(
        datetime(2026, 8, 14, 7, 20, 0, tzinfo=timezone.utc), MORNING, False
    ) == "due in ~20 min"
    assert _due_label(
        datetime(2026, 8, 14, 14, 30, 0, tzinfo=timezone.utc), MORNING, False
    ) == "due at 2:30 pm"
