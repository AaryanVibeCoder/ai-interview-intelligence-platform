"""Add question_source to interview_sessions and make interview_profile_id nullable

Revision ID: d2e3f4a5b6c7
Revises: a1b2c3d4e5f6
Create Date: 2026-01-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d2e3f4a5b6c7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade database schema.

    - Add question_source column to interview_sessions.
      "fallback" (static opener returned immediately) vs "llm"
      (personalized opener swapped in by the background task).
    - Make interview_profile_id nullable so direct session starts are
      possible before a persisted profile row exists.
    """
    # Deploy order critical: run `alembic upgrade head` BEFORE deploying the
    # new backend code so this column exists before the first start_interview
    # write fires.
    op.add_column(
        "interview_sessions",
        sa.Column(
            "question_source",
            sa.String(length=20),
            nullable=True,
            comment=(
                "'fallback' = static opener returned immediately; "
                "'llm' = personalized opener swapped in by the background task."
            ),
        ),
    )
    op.alter_column(
        "interview_sessions",
        "interview_profile_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    """Downgrade database schema."""
    op.alter_column(
        "interview_sessions",
        "interview_profile_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.drop_column("interview_sessions", "question_source")

