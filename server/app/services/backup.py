"""Backup & transfer: export a user's data to JSON and import it back.

Two jobs, one coherent format:

- ``build_export`` — the user's classes (name + color) and every item
  (assignments, quizzes, exams) with notes, links, priority, and progress,
  serialized deterministically (stable ordering). A lossless, complete
  snapshot of everything the user owns — a local backup or transfer file.
- ``import_backup`` — an additive merge of a file. Classes are matched by name
  (case-insensitive) and created when missing; items are matched by
  ``(kind, class, title, due date)`` and skipped when an identical one already
  exists, so re-importing a file never duplicates. Rows are parsed leniently
  for hand-written files; malformed rows are skipped and reported while valid
  ones import.

A direct export → import round-trip is clean: every exported row parses and
imports exactly once (into an account where they're new), and importing a file
into an account that already holds its rows is a no-op duplicate-skip.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, time as dt_time, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants import DEFAULT_CLASS_COLOR
from app.models import Class, Item, ItemLink, User
from app.naming import normalize_name
from app.schemas import ImportReportOut, ImportRowError

BACKUP_FORMAT = "plannerr-backup"
BACKUP_VERSION = 1
MAX_IMPORT_ITEMS = 10_000
MAX_TITLE = 200
MAX_NOTES = 100_000
MAX_LINK_URL = 2000
MAX_LINK_LABEL = 100
MAX_LINKS = 5
ITEM_KINDS = ("assignment", "quiz", "exam")


# ── Export ───────────────────────────────────────────────────────────────────

async def build_export(db: AsyncSession, user: User) -> dict[str, Any]:
    """Serializable, deterministic snapshot of everything the user owns."""
    classes = (
        (await db.scalars(select(Class).where(Class.user_id == user.id).order_by(Class.name)))
    ).all()
    items = (
        (
            await db.scalars(
                select(Item)
                .options(selectinload(Item.class_), selectinload(Item.links))
                .where(Item.user_id == user.id)
                .order_by(Item.due_at, Item.id)
            )
        )
        .all()
    )

    return {
        "format": BACKUP_FORMAT,
        "version": BACKUP_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "classes": [{"name": c.name, "color": c.color} for c in classes],
        "items": [
            {
                "kind": item.kind,
                "title": item.title,
                "notes": item.notes,
                "due_at": item.due_at.isoformat(),
                "progress": item.progress,
                "is_priority": item.is_priority,
                "class": item.class_.name,
                "links": [{"url": link.url, "label": link.label} for link in item.links],
            }
            for item in items
        ],
    }


# ── Import ───────────────────────────────────────────────────────────────────

def _resolve_tz(tz_name: str) -> ZoneInfo | timezone:
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return timezone.utc


def _normalize_bool(value: Any) -> bool | None:
    """Booleans plus common string/numeric spellings; None when unparsable."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "yes", "1"):
            return True
        if lowered in ("false", "no", "0"):
            return False
    return None


def _normalize_progress(value: Any) -> int | None:
    """Steps of 5 in 0-100; None when absent/unparsable (caller rejects rows)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        progress = int(value)
    except (TypeError, ValueError):
        return None
    if progress < 0 or progress > 100 or progress % 5 != 0:
        return None
    return progress


def _parse_due(value: Any, tz: ZoneInfo | timezone) -> tuple[datetime | None, str | None]:
    """Parse a due date into an aware UTC datetime.

    Accepts ``YYYY-MM-DD`` (interpreted as an all-day item in ``tz``) and any
    ISO 8601 date-time (naive datetimes are interpreted in ``tz``; aware ones
    are used as-is and normalized to UTC).
    """
    if value is None or not isinstance(value, str):
        return None, "due date must be a string (YYYY-MM-DD or an ISO date-time)"
    text = value.strip()
    if not text:
        return None, "due date is empty"
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None, f"unrecognized date {text!r} (use YYYY-MM-DD or an ISO date-time)"

    if parsed.tzinfo is None:
        if parsed.hour == 0 and parsed.minute == 0 and parsed.second == 0:
            # A bare date: all-day, stored at 23:59:59 in the user's zone
            # (the app's convention for date-only items).
            local = datetime.combine(parsed.date(), dt_time(23, 59, 59), tzinfo=tz)
            return local.astimezone(timezone.utc), None
        # Naive date-time: interpret as the user's local time.
        return parsed.replace(tzinfo=tz).astimezone(timezone.utc), None
    return parsed.astimezone(timezone.utc), None


def _row_fingerprint(kind: str, class_name: str, title: str, due_utc: datetime) -> str:
    """Identity for duplicate detection: (kind, class, title, due date)."""
    canonical = "\x1f".join(
        (kind, class_name.casefold(), title.casefold(), due_utc.isoformat())
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def _parse_link(raw: Any) -> ItemLink | None:
    """Lenient link parsing: drop malformed URLs rather than the whole row."""
    if not isinstance(raw, dict):
        return None
    url = str(raw.get("url") or "").strip()
    if not (url.startswith("http://") or url.startswith("https://")) or len(url) > MAX_LINK_URL:
        return None
    label = str(raw.get("label") or "").strip() or None
    if label and len(label) > MAX_LINK_LABEL:
        label = label[:MAX_LINK_LABEL]
    return ItemLink(url=url, label=label)


async def import_backup(
    db: AsyncSession, user: User, payload: dict[str, Any], tz_name: str
) -> ImportReportOut:
    file_format = payload.get("format")
    if file_format is not None and file_format != BACKUP_FORMAT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown backup format: {file_format!r}",
        )
    version = payload.get("version") or BACKUP_VERSION
    if not isinstance(version, int) or version > BACKUP_VERSION:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"This file was created by a newer version of Plannerr "
                f"(file version {version}, supported: {BACKUP_VERSION}). "
                "Update the app and try again."
            ),
        )

    raw_items = payload.get("items")
    if raw_items is None:
        raw_items = []
    if not isinstance(raw_items, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='"items" must be a list',
        )
    if len(raw_items) > MAX_IMPORT_ITEMS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Too many items (max {MAX_IMPORT_ITEMS} per import)",
        )

    tz = _resolve_tz(tz_name)

    # Merge baseline: existing classes by normalized name, existing item
    # fingerprints. Nothing existing is ever deleted or modified.
    existing_rows = (await db.scalars(select(Class).where(Class.user_id == user.id))).all()
    existing_classes: dict[str, Class] = {
        normalize_name(c.name).casefold(): c for c in existing_rows
    }
    existing_before: set[str] = set(existing_classes)
    existing_items = (
        await db.scalars(
            select(Item)
            .options(selectinload(Item.class_))
            .where(Item.user_id == user.id)
        )
    ).all()
    existing_fps: set[str] = {
        _row_fingerprint(i.kind, normalize_name(i.class_.name), i.title, i.due_at)
        for i in existing_items
    }
    seen_fps: set[str] = set()  # rows identical to another row in the same file

    # Classes declared in the file (name -> Class): reuse existing by name,
    # else mark for creation with the file's color (default when malformed).
    declared: dict[str, Class] = {}
    for raw in payload.get("classes") or []:
        if not isinstance(raw, dict):
            continue
        key = normalize_name(str(raw.get("name") or "")).casefold()
        if not key or key in existing_classes or key in declared:
            continue
        color = str(raw.get("color") or "").strip()
        if len(color) != 7 or not color.startswith("#"):
            color = DEFAULT_CLASS_COLOR
        declared[key] = Class(user_id=user.id, name=normalize_name(str(raw.get("name") or "")), color=color)

    invalid: list[ImportRowError] = []
    drafts: list[tuple[Class, dict[str, Any]]] = []
    duplicates = 0

    for index, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            invalid.append(ImportRowError(row=index, reason="row is not an object"))
            continue

        kind = str(raw.get("kind") or "").strip().lower()
        if kind not in ITEM_KINDS:
            invalid.append(
                ImportRowError(row=index, reason="kind must be one of: assignment, quiz, exam")
            )
            continue

        title = str(raw.get("title") or "").strip()
        if not title:
            invalid.append(ImportRowError(row=index, reason="missing title"))
            continue
        if len(title) > MAX_TITLE:
            invalid.append(ImportRowError(row=index, reason=f"title too long (max {MAX_TITLE})"))
            continue

        raw_class = raw.get("class")
        if not isinstance(raw_class, str) or not raw_class.strip():
            invalid.append(ImportRowError(row=index, reason="missing class name"))
            continue
        class_name = normalize_name(raw_class)
        class_key = class_name.casefold()

        due_utc, error = _parse_due(raw.get("due_at"), tz)
        if error:
            invalid.append(ImportRowError(row=index, reason=error))
            continue

        progress: int | None = None
        if kind == "assignment":
            progress = _normalize_progress(raw.get("progress", 0))
            if progress is None:
                invalid.append(
                    ImportRowError(row=index, reason="progress must be 0-100 in steps of 5")
                )
                continue

        is_priority = _normalize_bool(raw.get("is_priority", raw.get("priority", False)))
        if is_priority is None:
            invalid.append(ImportRowError(row=index, reason="priority must be true or false"))
            continue

        notes = str(raw.get("notes") or "")
        if len(notes) > MAX_NOTES:
            invalid.append(ImportRowError(row=index, reason="notes too long"))
            continue

        raw_links = raw.get("links") or []
        if not isinstance(raw_links, list):
            invalid.append(ImportRowError(row=index, reason="links must be a list"))
            continue
        links = [link for link in map(_parse_link, raw_links[:MAX_LINKS]) if link is not None]

        fingerprint = _row_fingerprint(kind, class_key, title, due_utc)
        if fingerprint in existing_fps or fingerprint in seen_fps:
            duplicates += 1
            continue
        seen_fps.add(fingerprint)

        # Resolve (or lazily create) the class only for rows that will import.
        cls = existing_classes.get(class_key) or declared.get(class_key)
        if cls is None:
            cls = Class(user_id=user.id, name=class_name, color=DEFAULT_CLASS_COLOR)
            declared[class_key] = cls
            existing_classes[class_key] = cls

        drafts.append(
            (
                cls,
                {
                    "kind": kind,
                    "title": title,
                    "notes": notes,
                    "due_at": due_utc,
                    "progress": progress,
                    "is_priority": is_priority,
                    "links": links,
                },
            )
        )

    # Persist new classes first (so their ids exist), then the items — one
    # transaction, so a failure rolls the whole import back.
    new_classes = [c for key, c in declared.items() if key not in existing_before]
    created_names = [c.name for c in new_classes]
    if new_classes:
        db.add_all(new_classes)
        await db.flush()
    items_to_add = [
        Item(user_id=user.id, class_id=cls.id, **fields) for cls, fields in drafts
    ]
    if items_to_add:
        db.add_all(items_to_add)
    await db.commit()

    return ImportReportOut(
        imported=len(items_to_add),
        duplicates=duplicates,
        classes_created=created_names,
        invalid=invalid,
    )
