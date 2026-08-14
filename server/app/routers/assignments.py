"""Assignment routes: CRUD with nested links, cursor pagination.

Pagination (keyset):
- No ``cursor``  → the first page: every assignment (respecting
  ``include_completed``) due within the next 7 days, including overdue,
  ordered ``due_at ASC, id ASC``.
- With ``cursor`` → the next ``limit`` items strictly after ``(due_at, id)``
  of the cursor, same ordering.
"""

import base64
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.deps import get_current_user
from app.models import Assignment, AssignmentLink, Class, User
from app.schemas import (
    AssignmentIn,
    AssignmentLinkOut,
    AssignmentListOut,
    AssignmentOut,
    AssignmentUpdate,
    ClassBriefOut,
)

router = APIRouter()

HORIZON_DAYS = 7
SAFETY_CAP = 500
DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
MAX_LINKS = 5


def _assignment_out(a: Assignment) -> AssignmentOut:
    return AssignmentOut(
        id=a.id,
        title=a.title,
        notes=a.notes,
        due_at=a.due_at,
        progress=a.progress,
        is_priority=a.is_priority,
        is_complete=a.is_complete,
        created_at=a.created_at,
        updated_at=a.updated_at,
        class_=ClassBriefOut(id=a.class_.id, name=a.class_.name, color=a.class_.color),
        links=[
            AssignmentLinkOut(id=l.id, url=l.url, label=l.label, position=l.position)
            for l in a.links
        ],
    )


async def _load_assignment(
    db: AsyncSession, user: User, assignment_id: uuid.UUID
) -> Assignment:
    """Fetch an assignment owned by ``user`` with class + links, or 404."""
    assignment = await db.scalar(
        select(Assignment)
        .options(selectinload(Assignment.class_), selectinload(Assignment.links))
        .where(Assignment.id == assignment_id, Assignment.user_id == user.id)
    )
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )
    return assignment


async def _ensure_owned_class(
    db: AsyncSession, user: User, class_id: uuid.UUID
) -> Class:
    cls = await db.scalar(select(Class).where(Class.id == class_id, Class.user_id == user.id))
    if cls is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    return cls


def _encode_cursor(due_at: datetime, id: uuid.UUID) -> str:
    raw = f"{due_at.isoformat()}|{id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        due_str, id_str = raw.split("|", 1)
        return datetime.fromisoformat(due_str), uuid.UUID(id_str)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid cursor"
        )


def _set_links(assignment: Assignment, links) -> None:
    assignment.links = [
        AssignmentLink(url=str(l.url), label=l.label, position=i)
        for i, l in enumerate(links)
    ]


@router.get("", response_model=AssignmentListOut)
async def list_assignments(
    include_completed: bool = Query(default=False),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssignmentListOut:
    stmt = (
        select(Assignment)
        .options(selectinload(Assignment.class_), selectinload(Assignment.links))
        .where(Assignment.user_id == user.id)
    )
    if not include_completed:
        stmt = stmt.where(Assignment.progress < 100)

    if cursor is None:
        # First page: everything due within the horizon (overdue included).
        horizon = datetime.now(timezone.utc) + timedelta(days=HORIZON_DAYS)
        stmt = stmt.where(Assignment.due_at < horizon).order_by(
            Assignment.due_at, Assignment.id
        )
        items = (await db.scalars(stmt.limit(SAFETY_CAP))).all()
        return AssignmentListOut(
            items=[_assignment_out(a) for a in items],
            next_cursor=(
                _encode_cursor(items[-1].due_at, items[-1].id) if items else None
            ),
        )

    due_at, id = _decode_cursor(cursor)
    stmt = (
        stmt.where(tuple_(Assignment.due_at, Assignment.id) > (due_at, id))
        .order_by(Assignment.due_at, Assignment.id)
        .limit(limit + 1)  # fetch one extra to detect whether more pages exist
    )
    rows = (await db.scalars(stmt)).all()
    has_more = len(rows) > limit
    items = rows[:limit]
    return AssignmentListOut(
        items=[_assignment_out(a) for a in items],
        next_cursor=(
            _encode_cursor(items[-1].due_at, items[-1].id) if has_more else None
        ),
    )


@router.post("", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    payload: AssignmentIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssignmentOut:
    await _ensure_owned_class(db, user, payload.class_id)
    assignment = Assignment(
        user_id=user.id,
        class_id=payload.class_id,
        title=payload.title,
        notes=payload.notes,
        due_at=payload.due_at,
        progress=payload.progress,
        is_priority=payload.is_priority,
    )
    _set_links(assignment, payload.links)
    db.add(assignment)
    await db.commit()
    return _assignment_out(await _load_assignment(db, user, assignment.id))


@router.get("/{assignment_id}", response_model=AssignmentOut)
async def get_assignment(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssignmentOut:
    return _assignment_out(await _load_assignment(db, user, assignment_id))


@router.patch("/{assignment_id}", response_model=AssignmentOut)
async def update_assignment(
    assignment_id: uuid.UUID,
    payload: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssignmentOut:
    assignment = await _load_assignment(db, user, assignment_id)

    if payload.title is not None:
        assignment.title = payload.title
    if payload.class_id is not None:
        await _ensure_owned_class(db, user, payload.class_id)
        assignment.class_id = payload.class_id
    if payload.notes is not None:
        assignment.notes = payload.notes
    if payload.due_at is not None:
        assignment.due_at = payload.due_at
    if payload.progress is not None:
        assignment.progress = payload.progress
    if payload.is_priority is not None:
        assignment.is_priority = payload.is_priority
    if payload.links is not None:
        _set_links(assignment, payload.links)

    await db.commit()
    return _assignment_out(await _load_assignment(db, user, assignment_id))


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    assignment = await _load_assignment(db, user, assignment_id)
    await db.delete(assignment)  # links cascade via FK
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
