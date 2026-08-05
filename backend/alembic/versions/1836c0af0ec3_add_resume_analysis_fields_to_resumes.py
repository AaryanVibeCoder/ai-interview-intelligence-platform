from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "1836c0af0ec3"
down_revision = "628611b2c754"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # JSON fields
    op.add_column("resumes", sa.Column("technical_skills", sa.JSON(), nullable=True))
    op.add_column("resumes", sa.Column("soft_skills", sa.JSON(), nullable=True))
    op.add_column("resumes", sa.Column("strengths", sa.JSON(), nullable=True))
    op.add_column("resumes", sa.Column("weaknesses", sa.JSON(), nullable=True))

    # ATS score
    op.add_column("resumes", sa.Column("ats_score", sa.Integer(), nullable=True))

    # Native PostgreSQL enum
    bind = op.get_bind()
    analysis_status_enum = sa.Enum(
        "pending",
        "completed",
        "failed",
        name="analysis_status",
        native_enum=True,
    )
    analysis_status_enum.create(bind, checkfirst=True)

    op.add_column(
        "resumes",
        sa.Column(
            "analysis_status",
            analysis_status_enum,
            nullable=False,
            server_default="pending",
        ),
    )

    # Optional: remove server default after backfilling default for existing rows
    op.alter_column("resumes", "analysis_status", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_column("resumes", "analysis_status")
    op.drop_column("resumes", "weaknesses")
    op.drop_column("resumes", "strengths")
    op.drop_column("resumes", "soft_skills")
    op.drop_column("resumes", "technical_skills")
    op.drop_column("resumes", "ats_score")

    # Drop enum type
    analysis_status_enum = sa.Enum(
        "pending",
        "completed",
        "failed",
        name="analysis_status",
        native_enum=True,
    )
    analysis_status_enum.drop(bind, checkfirst=True)
