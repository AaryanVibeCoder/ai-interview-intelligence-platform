from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .user import User


class Resume(BaseModel):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Stores the Clerk user id, and references users.clerk_user_id
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.clerk_user_id"),
        index=True,
        nullable=False,
    )

    file_name: Mapped[str] = mapped_column(String, nullable=False)
    file_url: Mapped[str] = mapped_column(String, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[str] = mapped_column(String, default="uploaded")

    technical_skills: Mapped[list[str] | None] = mapped_column(JSON(), nullable=True)
    soft_skills: Mapped[list[str] | None] = mapped_column(JSON(), nullable=True)
    strengths: Mapped[list[str] | None] = mapped_column(JSON(), nullable=True)
    weaknesses: Mapped[list[str] | None] = mapped_column(JSON(), nullable=True)

    ats_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    analysis_status: Mapped[str] = mapped_column(
        Enum(
            "pending",
            "completed",
            "failed",
            name="analysis_status",
            native_enum=True,
        ),
        nullable=False,
        server_default="pending",
        default="pending",
    )

    experience_level: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="resumes")
