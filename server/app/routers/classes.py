"""Class management routes: CRUD, delete-preview, and transfer-on-delete.

All queries are scoped to the logged-in user. Deleting a class always
cascades to its items (assignments, quizzes, exams); the UI calls
``delete-preview`` first so the user can confirm and optionally transfer the
class's items to another class.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import Class, Item, User
from app.naming import normalize_name
from app.schemas import (
    ClassDeletePreview,
    ClassIn,
    ClassOut,
    ClassUpdate,
    ItemBriefOut,
    ItemCounts,
)

router = APIRouter()

_PREVIEW_LIMIT = 500

# Order of the keys in serialized counts (also the UI display order).
KIND_ORDER = ("assignment", "quiz", "exam")


def _empty_counts() -> dict[str, int]:
    return {kind: 0 for kind in KIND_ORDER}


def _to_out(cls: Class, counts: dict[str, int]) -> ClassOut:
    return ClassOut(
        id=cls.id,
        name=cls.name,
        color=cls.color,
        counts=ItemCounts(**counts),
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


async def _counts_by_class(
    db: AsyncSession, user: User, class_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[str, int]]:
    """Per-class per-kind item counts for ``class_ids`` (all owned by user)."""
    result: dict[uuid.UUID, dict[str, int]] = {}
    if not class_ids:
        return result
    rows = await db.execute(
        select(Item.class_id, Item.kind, func.count(Item.id))
        .where(Item.user_id == user.id, Item.class_id.in_(class_ids))
        .group_by(Item.class_id, Item.kind)
    )
    for class_id, kind, count in rows.all():
        result.setdefault(class_id, _empty_counts())[kind] = count
    return result


async def _counts_for_class(db: AsyncSession, user: User, class_id: uuid.UUID) -> dict[str, int]:
    counts = await _counts_by_class(db, user, [class_id])
    return counts.get(class_id, _empty_counts())


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

    counts = await _counts_by_class(db, user, [c.id for c in classes])
    return [_to_out(c, counts.get(c.id, _empty_counts())) for c in classes]


@router.post("", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
async def create_class(
    payload: ClassIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClassOut:
    name = normalize_name(payload.name)
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name cannot be empty")
    await _ensure_name_available(db, user, name)

    cls = Class(user_id=user.id, name=name, color=payload.color)
    db.add(cls)
    await db.commit()
    await db.refresh(cls)
    return _to_out(cls, _empty_counts())


@router.patch("/{class_id}", response_model=ClassOut)
async def update_class(
    class_id: uuid.UUID,
    payload: ClassUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClassOut:
    cls = await _get_owned_class(db, user, class_id)

    if payload.name is not None:
        name = normalize_name(payload.name)
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name cannot be empty")
        await _ensure_name_available(db, user, name, exclude_id=cls.id)
        cls.name = name
    if payload.color is not None:
        cls.color = payload.color

    await db.commit()
    await db.refresh(cls)
    return _to_out(cls, await _counts_for_class(db, user, cls.id))


@router.get("/{class_id}/delete-preview", response_model=ClassDeletePreview)
async def delete_preview(
    class_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClassDeletePreview:
    """Return the items that would be lost, for the confirm dialog."""
    await _get_owned_class(db, user, class_id)  # 404 when not owned

    counts = await _counts_for_class(db, user, class_id)
    items = (
        await db.scalars(
            select(Item)
            .where(Item.user_id == user.id, Item.class_id == class_id)
            .order_by(Item.due_at, Item.id)
            .limit(_PREVIEW_LIMIT)
        )
    ).all()

    return ClassDeletePreview(
        counts=ItemCounts(**counts),
        total=sum(counts.values()),
        items=[
            ItemBriefOut(
                id=i.id,
                kind=i.kind,
                title=i.title,
                due_at=i.due_at,
                progress=i.progress,
            )
            for i in items
        ],
    )


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: uuid.UUID,
    transfer_to_class_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Delete a class. Optionally transfer its items to another class first."""
    await _get_owned_class(db, user, class_id)

    if transfer_to_class_id is not None:
        if transfer_to_class_id == class_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot transfer items to the class being deleted",
            )
        target = await db.scalar(
            select(Class.id).where(Class.id == transfer_to_class_id, Class.user_id == user.id)
        )
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Target class not found"
            )
        await db.execute(
            update(Item)
            .where(Item.user_id == user.id, Item.class_id == class_id)
            .values(class_id=transfer_to_class_id)
        )

    cls = await db.get(Class, class_id)
    if cls is not None:
        await db.delete(cls)  # remaining items cascade via FK
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
