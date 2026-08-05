"""Create resume analyses table.

Revision identifiers
revision = '628611b2c754'
down_revision = '93c06aa13918'
branch_labels = None
depends_on = None
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "628611b2c754"
down_revision = "93c06aa13918"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "resume_analyses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, index=True, nullable=False),
        sa.Column(
            "resume_id",
            sa.Integer(),
            sa.ForeignKey("resumes.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("technical_skills", sa.JSON(), nullable=True),
        sa.Column("soft_skills", sa.JSON(), nullable=True),
        sa.Column("tools", sa.JSON(), nullable=True),
        sa.Column("strengths", sa.JSON(), nullable=True),
        sa.Column("weaknesses", sa.JSON(), nullable=True),
        sa.Column("suggestions", sa.JSON(), nullable=True),
        sa.Column("ats_score", sa.Integer(), nullable=True),
        sa.Column("ats_feedback", sa.Text(), nullable=True),
        sa.Column("ats_keywords_found", sa.JSON(), nullable=True),
        sa.Column("ats_keywords_missing", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("resume_analyses")
