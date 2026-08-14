"""SQLAlchemy 2.0 declarative models for Plannerr.

Schema overview:
- users                — accounts (username + argon2 password hash)
- sessions             — server-side login sessions (token hash stored)
- classes              — per-user classes with a hex color
- assignments          — tasks with a class, due date, progress (step 5), priority
- assignment_links     — optional labeled URLs per assignment
- push_subscriptions   — Web Push endpoints (one per user/device)

Every data table carries ``user_id`` so all queries can be scoped to the
logged-in user cheaply (defense in depth on top of FK cascades).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    Uuid,
    column,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # Case-insensitive uniqueness: "Ada" and "ada" cannot both register.
        Index("uq_users_username_ci", func.lower(column("username")), unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    username: Mapped[str] = mapped_column(String(32), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    sessions: Mapped[list[Session]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    classes: Mapped[list[Class]] = relationship(back_populates="user", cascade="all, delete-orphan")
    assignments: Mapped[list[Assignment]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    push_subscriptions: Mapped[list[PushSubscription]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # SHA-256 of the opaque token sent to the browser — never the raw token.
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped[User] = relationship(back_populates="sessions")


class Class(Base):
    __tablename__ = "classes"
    __table_args__ = (
        # One class per user, case-insensitive on name.
        Index(
            "uq_classes_user_name_ci",
            "user_id",
            func.lower(column("name")),
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)  # "#RRGGBB"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="classes")
    assignments: Mapped[list[Assignment]] = relationship(
        back_populates="class_", cascade="all, delete-orphan"
    )


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        # Keyset pagination for the home list.
        Index("ix_assignments_user_due", "user_id", "due_at", "id"),
        # Fast path for "hide completed".
        Index(
            "ix_assignments_user_due_active",
            "user_id",
            "due_at",
            "id",
            postgresql_where=text("progress < 100"),
        ),
        Index("ix_assignments_class_id", "class_id"),
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_assignments_progress_range"),
        CheckConstraint("progress % 5 = 0", name="ck_assignments_progress_step"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classes.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    progress: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    is_priority: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="assignments")
    class_: Mapped[Class] = relationship(back_populates="assignments")
    links: Mapped[list[AssignmentLink]] = relationship(
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="AssignmentLink.position",
    )

    @property
    def is_complete(self) -> bool:
        """Derived, never stored: complete == progress at 100."""
        return self.progress == 100


class AssignmentLink(Base):
    __tablename__ = "assignment_links"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    assignment: Mapped[Assignment] = relationship(back_populates="links")


class PushSubscription(Base):
    """A browser push subscription (Web Push) registered by a user's device.

    ``endpoint`` is the push-service URL the server delivers to; ``p256dh`` /
    ``auth`` are the message-encryption keys handed out by ``pushManager``.
    """

    __tablename__ = "push_subscriptions"
    __table_args__ = (
        # One row per push endpoint per user; re-subscribing replaces in place.
        Index("uq_push_subscriptions_user_endpoint", "user_id", "endpoint", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="push_subscriptions")
