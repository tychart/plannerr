"""Item routes: CRUD with nested links + a shared, filterable list endpoint.

Items are the unified model for assignments, quizzes, and exams (``kind``
discriminates). One list endpoint powers every surface — the per-kind library
pages (search/filter/sort), the Home dashboard's assignment window, and the
Home sidebar's upcoming quizzes/exams.

List filters (all query params, ``kind`` required):
- ``q``        case-insensitive substring over title + notes
- ``class_id`` restrict to one owned class
- ``status``   ``active`` (default) | ``completed`` | ``all``
- ``window``   ``all`` (default) | ``upcoming`` | ``past`` | ``today`` |
               ``week`` | ``month`` | ``horizon`` — day boundaries computed in
               the client's ``tz`` (IANA), UTC when invalid/missing
- ``order``    ``asc`` (default, keyset cursor) | ``desc``
- ``cursor`` / ``limit``  keyset pagination on ``(due_at, id)``

``horizon`` (due before start-of-today + 7 days, incl. overdue) is the Home
dashboard's Overdue + next-7-days window. ``upcoming`` (due >= start of today)
is what the Home sidebar sections show.
"""

import base64
import uuid
from datetime import datetime, time as dt_time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.deps import get_current_user
from app.models import Class, Item, ItemLink, User
from app.schemas import (
    ClassBriefOut,
    ItemIn,
    ItemKind,
    ItemLinkOut,
    ItemListOut,
    ItemOut,
    ItemUpdate,
)

router = APIRouter()

SAFETY_CAP = 500
DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
MAX_LINKS = 5
_Q_MAX = 200


def _item_out(item: Item) -> ItemOut:
    return ItemOut(
        id=item.id,
        kind=item.kind,
        title=item.title,
        notes=item.notes,
        due_at=item.due_at,
        progress=item.progress,
        is_priority=item.is_priority,
        is_complete=item.is_complete,
        created_at=item.created_at,
        updated_at=item.updated_at,
        class_=ClassBriefOut(id=item.class_.id, name=item.class_.name, color=item.class_.color),
        links=[
            ItemLinkOut(id=l.id, url=l.url, label=l.label, position=l.position)
            for l in item.links
        ],
    )


async def _load_item(db: AsyncSession, user: User, item_id: uuid.UUID) -> Item:
    """Fetch an item owned by ``user`` with class + links, or 404."""
    item = await db.scalar(
        select(Item)
        .options(selectinload(Item.class_), selectinload(Item.links))
        .where(Item.id == item_id, Item.user_id == user.id)
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


async def _ensure_owned_class(db: AsyncSession, user: User, class_id: uuid.UUID) -> Class:
    cls = await db.scalar(select(Class).where(Class.id == class_id, Class.user_id == user.id))
    if cls is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    return cls


def _set_links(item: Item, links) -> None:
    item.links = [ItemLink(url=str(l.url), label=l.label, position=i) for i, l in enumerate(links)]


# ── List filters ─────────────────────────────────────────────────────────────

def _resolve_tz(tz_name: str) -> ZoneInfo | timezone:
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return timezone.utc


def _start_of_today(tz_name: str) -> datetime:
    """UTC instant of local midnight today in ``tz_name`` (UTC fallback)."""
    tz = _resolve_tz(tz_name)
    now_local = datetime.now(timezone.utc).astimezone(tz)
    return datetime.combine(now_local.date(), dt_time.min, tzinfo=tz).astimezone(timezone.utc)


def _encode_cursor(due_at: datetime, id: uuid.UUID) -> str:
    raw = f"{due_at.isoformat()}|{id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        due_str, id_str = raw.split("|", 1)
        return datetime.fromisoformat(due_str), uuid.UUID(id_str)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid cursor")


def _window_bounds(window: str, tz_name: str) -> tuple[datetime | None, datetime | None]:
    """Return (gte, lt) UTC bounds for a window, or (None, None) for 'all'."""
    if window in (None, "", "all"):
        return None, None
    start = _start_of_today(tz_name)
    day = timedelta(days=1)
    if window == "upcoming":
        return start, None
    if window == "past":
        return None, start
    if window == "today":
        return start, start + day
    if window == "week":
        return start, start + 7 * day
    if window == "month":
        return start, start + 30 * day
    if window == "horizon":
        # Everything due before the end of the 7-day window — overdue included.
        return None, start + 7 * day
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unknown window: {window!r}",
    )


@router.get("", response_model=ItemListOut)
async def list_items(
    kind: ItemKind = Query(...),
    q: str | None = Query(default=None, max_length=_Q_MAX),
    class_id: uuid.UUID | None = Query(default=None),
    status_filter: str = Query(default="active", alias="status"),
    window: str = Query(default="all"),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
    tz: str = Query(default="UTC", max_length=64),
    cursor: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ItemListOut:
    stmt = (
        select(Item)
        .options(selectinload(Item.class_), selectinload(Item.links))
        .where(Item.user_id == user.id, Item.kind == kind)
    )

    if status_filter not in ("active", "completed", "all"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="status must be one of: active, completed, all",
        )
    if status_filter == "active":
        # NULL progress (quizzes/exams) is never 'completed' — always active.
        stmt = stmt.where(or_(Item.progress < 100, Item.progress.is_(None)))
    elif status_filter == "completed":
        stmt = stmt.where(Item.progress == 100)

    gte, lt = _window_bounds(window, tz)
    if gte is not None:
        stmt = stmt.where(Item.due_at >= gte)
    if lt is not None:
        stmt = stmt.where(Item.due_at < lt)

    if class_id is not None:
        stmt = stmt.where(Item.class_id == class_id)

    if q:
        needle = q.strip().lower()
        if needle:
            stmt = stmt.where(
                or_(
                    func.lower(Item.title).contains(needle, autoescape=True),
                    func.lower(Item.notes).contains(needle, autoescape=True),
                )
            )

    descending = order == "desc"
    col_order = Item.due_at.desc() if descending else Item.due_at.asc()
    stmt = stmt.order_by(col_order, Item.id.desc() if descending else Item.id.asc())

    if cursor is not None:
        due_at, id = _decode_cursor(cursor)
        if descending:
            stmt = stmt.where(tuple_(Item.due_at, Item.id) < (due_at, id))
        else:
            stmt = stmt.where(tuple_(Item.due_at, Item.id) > (due_at, id))

    # First page without an explicit limit is the "big window" fetch (dashboard /
    # full-window pages); cursor pages and explicit limits page normally.
    page_size = limit if (limit is not None or cursor is not None) else SAFETY_CAP
    rows = (await db.scalars(stmt.limit(page_size + 1))).all()  # +1 to detect more
    has_more = len(rows) > page_size
    items = rows[:page_size]
    return ItemListOut(
        items=[_item_out(a) for a in items],
        next_cursor=(
            _encode_cursor(items[-1].due_at, items[-1].id) if has_more and items else None
        ),
    )


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
async def create_item(
    payload: ItemIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ItemOut:
    await _ensure_owned_class(db, user, payload.class_id)
    item = Item(
        user_id=user.id,
        class_id=payload.class_id,
        kind=payload.kind,
        title=payload.title,
        notes=payload.notes,
        due_at=payload.due_at,
        progress=payload.progress,
        is_priority=payload.is_priority,
    )
    _set_links(item, payload.links)
    db.add(item)
    await db.commit()
    return _item_out(await _load_item(db, user, item.id))


@router.get("/{item_id}", response_model=ItemOut)
async def get_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ItemOut:
    return _item_out(await _load_item(db, user, item_id))


@router.patch("/{item_id}", response_model=ItemOut)
async def update_item(
    item_id: uuid.UUID,
    payload: ItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ItemOut:
    item = await _load_item(db, user, item_id)

    if item.kind != "assignment" and payload.progress is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="progress is only valid for assignments",
        )

    if payload.title is not None:
        item.title = payload.title
    if payload.class_id is not None:
        await _ensure_owned_class(db, user, payload.class_id)
        item.class_id = payload.class_id
    if payload.notes is not None:
        item.notes = payload.notes
    if payload.due_at is not None:
        item.due_at = payload.due_at
    if payload.progress is not None:
        item.progress = payload.progress
    if payload.is_priority is not None:
        item.is_priority = payload.is_priority
    if payload.links is not None:
        _set_links(item, payload.links)

    await db.commit()
    return _item_out(await _load_item(db, user, item_id))


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    item = await _load_item(db, user, item_id)
    await db.delete(item)  # links cascade via FK
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
