"""Pydantic v2 schemas — request/response models for the API."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    """Public user representation."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    created_at: datetime


class RegisterIn(BaseModel):
    """Registration payload. Loose field limits; the policy lives in
    ``app.security`` so error messages are friendly and consistent.
    """

    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=200)


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=200)


# ── Classes ────────────────────────────────────────────────────────────────

HEX_COLOR_RE = r"^#[0-9a-fA-F]{6}$"


class ClassOut(BaseModel):
    """Public class representation, including its assignment count."""

    id: uuid.UUID
    name: str
    color: str
    assignment_count: int
    created_at: datetime
    updated_at: datetime


class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = Field(pattern=HEX_COLOR_RE)


class ClassUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = Field(default=None, pattern=HEX_COLOR_RE)


class AssignmentBriefOut(BaseModel):
    """Compact assignment used in class delete-preview lists."""

    id: uuid.UUID
    title: str
    due_at: datetime
    progress: int


class ClassDeletePreview(BaseModel):
    assignment_count: int
    assignments: list[AssignmentBriefOut]


# ── Assignments ─────────────────────────────────────────────────────────────

class ClassBriefOut(BaseModel):
    """Compact class nested inside assignment responses."""

    id: uuid.UUID
    name: str
    color: str


class AssignmentLinkIn(BaseModel):
    url: AnyHttpUrl
    label: str | None = Field(default=None, max_length=100)


class AssignmentLinkOut(BaseModel):
    id: uuid.UUID
    url: str
    label: str | None
    position: int


class AssignmentIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    class_id: uuid.UUID
    notes: str = Field(default="", max_length=100_000)
    due_at: datetime
    progress: int = Field(default=0, ge=0, le=100, multiple_of=5)
    is_priority: bool = False
    links: list[AssignmentLinkIn] = Field(default_factory=list, max_length=5)


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    class_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=100_000)
    due_at: datetime | None = None
    progress: int | None = Field(default=None, ge=0, le=100, multiple_of=5)
    is_priority: bool | None = None
    links: list[AssignmentLinkIn] | None = Field(default=None, max_length=5)


class AssignmentOut(BaseModel):
    """Full assignment representation with nested class and links."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: uuid.UUID
    title: str
    notes: str
    due_at: datetime
    progress: int
    is_priority: bool
    is_complete: bool  # derived from progress == 100
    created_at: datetime
    updated_at: datetime
    class_: ClassBriefOut = Field(alias="class")
    links: list[AssignmentLinkOut]


class AssignmentListOut(BaseModel):
    """Cursor-paginated assignment list."""

    items: list[AssignmentOut]
    next_cursor: str | None


# ── Notifications ───────────────────────────────────────────────────────────

class PushSubscriptionKeys(BaseModel):
    """Message-encryption keys from the browser's pushManager."""

    p256dh: str = Field(min_length=1)
    auth: str = Field(min_length=1)


class PushSubscriptionIn(BaseModel):
    """A Web Push subscription as handed back by pushManager.subscribe()."""

    endpoint: str = Field(min_length=1, max_length=2000)
    keys: PushSubscriptionKeys


class TestNotificationIn(BaseModel):
    """Trigger for a daily-summary test notification."""

    timezone: str = Field(default="UTC", min_length=1, max_length=64)


class TestNotificationOut(BaseModel):
    """Result of sending the daily summary."""

    device_count: int
    summary: str
    source: Literal["llm", "fallback"]
