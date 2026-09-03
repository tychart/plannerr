"""Pydantic v2 schemas — request/response models for the API."""

import uuid
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


# What an Item can be. Assignments carry progress; quizzes and exams are dated
# class events with no completion semantics.
ItemKind = Literal["assignment", "quiz", "exam"]



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


class ItemCounts(BaseModel):
    """How many items of each kind a class holds."""

    assignment: int = 0
    quiz: int = 0
    exam: int = 0


class ClassOut(BaseModel):
    """Public class representation, including per-kind item counts."""

    id: uuid.UUID
    name: str
    color: str
    counts: ItemCounts
    created_at: datetime
    updated_at: datetime


class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = Field(pattern=HEX_COLOR_RE)


class ClassUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = Field(default=None, pattern=HEX_COLOR_RE)


class ItemBriefOut(BaseModel):
    """Compact item (any kind) used in class delete-preview lists."""

    id: uuid.UUID
    kind: ItemKind
    title: str
    due_at: datetime
    progress: int | None


class ClassDeletePreview(BaseModel):
    counts: ItemCounts
    total: int
    items: list[ItemBriefOut]


# ── Items (assignments, quizzes, exams) ─────────────────────────────────────

class ClassBriefOut(BaseModel):
    """Compact class nested inside item responses."""

    id: uuid.UUID
    name: str
    color: str


class ItemLinkIn(BaseModel):
    url: AnyHttpUrl
    label: str | None = Field(default=None, max_length=100)


class ItemLinkOut(BaseModel):
    id: uuid.UUID
    url: str
    label: str | None
    position: int


class ItemIn(BaseModel):
    kind: ItemKind
    title: str = Field(min_length=1, max_length=200)
    class_id: uuid.UUID
    notes: str = Field(default="", max_length=100_000)
    due_at: datetime
    progress: int | None = Field(default=None, ge=0, le=100, multiple_of=5)
    is_priority: bool = False
    links: list[ItemLinkIn] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def _kind_progress_rules(self) -> "ItemIn":
        if self.kind == "assignment":
            # Assignments always carry progress; omitted means 0 (just created).
            self.progress = 0 if self.progress is None else self.progress
        elif self.progress is not None:
            raise ValueError("progress is only valid for assignments")
        return self


class ItemUpdate(BaseModel):
    """Partial item update. ``kind`` is immutable — set it at creation."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    class_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=100_000)
    due_at: datetime | None = None
    progress: int | None = Field(default=None, ge=0, le=100, multiple_of=5)
    is_priority: bool | None = None
    links: list[ItemLinkIn] | None = Field(default=None, max_length=5)


class ItemOut(BaseModel):
    """Full item representation with nested class and links."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: uuid.UUID
    kind: ItemKind
    title: str
    notes: str
    due_at: datetime
    progress: int | None
    is_priority: bool
    is_complete: bool  # derived: only assignments (progress == 100) are complete
    created_at: datetime
    updated_at: datetime
    class_: ClassBriefOut = Field(alias="class")
    links: list[ItemLinkOut]


class ItemListOut(BaseModel):
    """Cursor-paginated item list."""

    items: list[ItemOut]
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


class CustomNotificationIn(BaseModel):
    """User-provided prompt for a custom LLM notification."""

    message: str = Field(min_length=1, max_length=500)


class CustomNotificationOut(BaseModel):
    """Result of sending a custom LLM notification."""

    device_count: int
    body: str


# ── Daily schedule ───────────────────────────────────────────────────────────

HH_MM_RE = r"^([01]\d|2[0-3]):[0-5]\d$"  # 24-hour "HH:MM"


class NotificationScheduleIn(BaseModel):
    """Per-user daily notification schedule."""

    enabled: bool
    time: str = Field(pattern=HH_MM_RE, description='24-hour "HH:MM" in the user\'s timezone')
    timezone: str = Field(min_length=1, max_length=64)

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError:
            raise ValueError(f"Unknown timezone: {value!r}") from None
        return value


class NotificationScheduleOut(BaseModel):
    """Saved schedule as returned to the client."""

    enabled: bool
    time: str
    timezone: str
