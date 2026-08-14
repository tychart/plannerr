"""Class management routes: CRUD, delete-preview, and transfer-on-delete.

All queries are scoped to the logged-in user. Deleting a class always
cascades to its assignments; the UI calls ``delete-preview`` first so the
user can confirm and optionally transfer assignments to another class.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import Assignment, Class, User
from app.schemas import (
    AssignmentBriefOut,
    ClassDeletePreview,
    ClassIn,
    ClassOut,
    ClassUpdate,
)

router = APIRouter()

_PREVIEW_LIMIT = 500


def _normalize_name(name: str) -> str:
    """Trim and collapse internal whitespace."""
    return " ".join(name.strip().split())


def _to_out(cls: Class, assignment_count: int) -> ClassOut:
    return ClassOut(
        id=cls.id,
        name=cls.name,
        color=cls.color,
        assignment_count=assignment_count,
        created_at=cls.created_at,
        updated_at=cls.updated_at,
    )


async def _get_owned_class(db: AsyncSession, user: User, class_id: uuid.UUID) -> Class:
    cls = await db.scalar(select(Class).where(Class.id == class_id, Class.user_id == user.id))
    if cls is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    return cls


async def _ensure_name_available(
    db: AsyncSession, user: User, name: str, exclude_id: uuid.UUID | None = None
) -> None:
    """Reject duplicate class names (case-insensitive) for this user."""
    stmt = select(Class.id).where(
        Class.user_id == user.id, func.lower(Class.name) == name.lower()
    )
    if exclude_id is not None:
        stmt = stmt.where(Class.id != exclude_id)
    if await db.scalar(stmt) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A class with this name already exists"
        )


async def _assignment_count(db: AsyncSession, user: User, class_id: uuid.UUID) -> int:
    return await db.scalar(
        select(func.count(Assignment.id)).where(
            Assignment.user_id == user.id, Assignment.class_id == class_id
        )
    ) or 0


@router.get("", response_model=list[ClassOut])
async def list_classes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ClassOut]:
    classes = (
        await db.scalars(
            select(Class)
            .where(Class.user_id == user.id)
            .order_by(func.lower(Class.name), Class.name)
        )
    ).all()

    counts: dict[uuid.UUID, int] = {}
    if classes:
        rows = await db.execute(
            select(Assignment.class_id, func.count(Assignment.id))
            .where(
                Assignment.user_id == user.id,
                Assignment.class_id.in_([c.id for c in classes]),
            )
            .group_by(Assignment.class_id)
        )
        counts = {class_id: count for class_id, count in rows.all()}

    return [_to_out(c, counts.get(c.id, 0)) for c in classes]


@router.post("", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
async def create_class(
    payload: ClassIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClassOut:
    name = _normalize_name(payload.name)
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name cannot be empty")
    await _ensure_name_available(db, user, name)

    cls = Class(user_id=user.id, name=name, color=payload.color)
    db.add(cls)
    await db.commit()
    await db.refresh(cls)
    return _to_out(cls, 0)


@router.patch("/{class_id}", response_model=ClassOut)
async def update_class(
    class_id: uuid.UUID,
    payload: ClassUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClassOut:
    cls = await _get_owned_class(db, user, class_id)

    if payload.name is not None:
        name = _normalize_name(payload.name)
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name cannot be empty")
        await _ensure_name_available(db, user, name, exclude_id=cls.id)
        cls.name = name
    if payload.color is not None:
        cls.color = payload.color

    await db.commit()
    await db.refresh(cls)
    return _to_out(cls, await _assignment_count(db, user, cls.id))


@router.get("/{class_id}/delete-preview", response_model=ClassDeletePreview)
async def delete_preview(
    class_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClassDeletePreview:
    """Return the assignments that would be lost, for the confirm dialog."""
    await _get_owned_class(db, user, class_id)  # 404 when not owned

    total = await _assignment_count(db, user, class_id)
    assignments = (
        await db.scalars(
            select(Assignment)
            .where(Assignment.user_id == user.id, Assignment.class_id == class_id)
            .order_by(Assignment.due_at, Assignment.id)
            .limit(_PREVIEW_LIMIT)
        )
    ).all()

    return ClassDeletePreview(
        assignment_count=total,
        assignments=[
            AssignmentBriefOut(id=a.id, title=a.title, due_at=a.due_at, progress=a.progress)
            for a in assignments
        ],
    )


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: uuid.UUID,
    transfer_to_class_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Delete a class. Optionally transfer its assignments to another class first."""
    await _get_owned_class(db, user, class_id)

    if transfer_to_class_id is not None:
        if transfer_to_class_id == class_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot transfer assignments to the class being deleted",
            )
        target = await db.scalar(
            select(Class.id).where(Class.id == transfer_to_class_id, Class.user_id == user.id)
        )
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Target class not found"
            )
        await db.execute(
            update(Assignment)
            .where(Assignment.user_id == user.id, Assignment.class_id == class_id)
            .values(class_id=transfer_to_class_id)
        )

    cls = await db.get(Class, class_id)
    if cls is not None:
        await db.delete(cls)  # remaining assignments cascade via FK
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
