"""unify assignments into items table

Assignments, quizzes, and exams now share one ``items`` table discriminated by
``kind``; ``item_links`` replaces ``assignment_links``. Existing assignment rows
are copied across (kind='assignment'), then the old tables are dropped.

Revision ID: fb32f8af61a2
Revises: 600f514c806f
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fb32f8af61a2'
down_revision: Union[str, Sequence[str], None] = '600f514c806f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_items(op) -> None:
    """items + item_links tables with constraints/indexes (shared by both directions)."""
    op.create_table(
        "items",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("class_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("notes", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("progress", sa.SmallInteger(), nullable=True),
        sa.Column("is_priority", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            sa.text("kind IN ('assignment', 'quiz', 'exam')"), name="ck_items_kind"
        ),
        sa.CheckConstraint(
            sa.text("progress IS NULL OR (progress >= 0 AND progress <= 100)"),
            name="ck_items_progress_range",
        ),
        sa.CheckConstraint(
            sa.text("progress IS NULL OR progress % 5 = 0"), name="ck_items_progress_step"
        ),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_items_user_id"), "items", ["user_id"], unique=False)
    op.create_index("ix_items_class_id", "items", ["class_id"], unique=False)
    op.create_index(
        "ix_items_user_kind_due", "items", ["user_id", "kind", "due_at", "id"], unique=False
    )
    op.create_index(
        "ix_items_user_kind_due_active",
        "items",
        ["user_id", "kind", "due_at", "id"],
        unique=False,
        postgresql_where=sa.text("kind = 'assignment' AND progress < 100"),
    )

    op.create_table(
        "item_links",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=True),
        sa.Column("position", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_item_links_item_id"), "item_links", ["item_id"], unique=False)


def upgrade() -> None:
    """Move assignments into the unified items table."""
    _create_items(op)

    op.execute(
        sa.text(
            """
            INSERT INTO items (id, user_id, class_id, kind, title, notes, due_at,
                               progress, is_priority, created_at, updated_at)
            SELECT id, user_id, class_id, 'assignment', title, notes, due_at,
                   progress, is_priority, created_at, updated_at
            FROM assignments
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO item_links (id, item_id, url, label, position, created_at)
            SELECT id, assignment_id, url, label, position, created_at
            FROM assignment_links
            """
        )
    )

    op.drop_table("assignment_links")
    op.drop_table("assignments")


def downgrade() -> None:
    """Recreate assignments (kind='assignment' rows only)."""
    op.create_table(
        "assignments",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("class_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("notes", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("progress", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("is_priority", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(sa.text("progress % 5 = 0"), name="ck_assignments_progress_step"),
        sa.CheckConstraint(
            "progress >= 0 AND progress <= 100", name="ck_assignments_progress_range"
        ),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assignments_class_id", "assignments", ["class_id"], unique=False)
    op.create_index(
        "ix_assignments_user_due", "assignments", ["user_id", "due_at", "id"], unique=False
    )
    op.create_index(
        "ix_assignments_user_due_active",
        "assignments",
        ["user_id", "due_at", "id"],
        unique=False,
        postgresql_where=sa.text("progress < 100"),
    )
    op.create_table(
        "assignment_links",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=True),
        sa.Column("position", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_assignment_links_assignment_id"), "assignment_links", ["assignment_id"], unique=False
    )

    op.execute(
        sa.text(
            """
            INSERT INTO assignments (id, user_id, class_id, title, notes, due_at,
                                     progress, is_priority, created_at, updated_at)
            SELECT id, user_id, class_id, title, notes, due_at,
                   COALESCE(progress, 0), is_priority, created_at, updated_at
            FROM items
            WHERE kind = 'assignment'
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO assignment_links (id, assignment_id, url, label, position, created_at)
            SELECT l.id, l.item_id, l.url, l.label, l.position, l.created_at
            FROM item_links l
            JOIN items i ON i.id = l.item_id
            WHERE i.kind = 'assignment'
            """
        )
    )

    op.drop_table("item_links")
    op.drop_table("items")
