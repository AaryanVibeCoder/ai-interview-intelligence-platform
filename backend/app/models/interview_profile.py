from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class InterviewProfile(BaseModel):
    __tablename__ = "interview_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # One profile per user: unique=True
    user_id: Mapped[str] = mapped_column(
        String(255),
        ForeignKey("users.clerk_user_id"),
        unique=True,
        nullable=False,
        index=True,
    )

    resume_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("resumes.id", ondelete="CASCADE"),
        nullable=False,
    )

    target_company: Mapped[str] = mapped_column(String, nullable=False)
    interview_type: Mapped[str] = mapped_column(String, nullable=False)
    experience_level: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str | None] = mapped_column(String, nullable=True, default="Software Engineer")
    job_type: Mapped[str | None] = mapped_column(String, nullable=True, default="full time job")

    # Relationships (optional but helpful)
    user = relationship("User")
    resume = relationship("Resume")
