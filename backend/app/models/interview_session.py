from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, ForeignKey, Integer, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class InterviewSession(BaseModel):
    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    user_id: Mapped[str] = mapped_column(
        String(255),
        ForeignKey("users.clerk_user_id"),
        nullable=False,
        index=True,
    )

    # Nullable so direct starts (before a profile row exists) can create a
    # session without requiring a pre-persisted interview profile.
    interview_profile_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("interview_profiles.id", ondelete="CASCADE"),
        nullable=True,
    )

    conversation_history: Mapped[list[dict]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
        server_default="[]",
    )

    feedback: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="in_progress",
        server_default="in_progress",
    )

    # question_source: "fallback" (static opener used immediately) or "llm"
    # (personalized opener generated in the background and swapped in later).
    question_source: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        default="fallback",
    )

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

    # nim_transcripts: result of post-interview NIM ASR enrichment.
    # Keyed by question_index (str) -> transcript text or None (failed).
    # NEVER used to overwrite conversation_history (the browser transcripts).
    nim_transcripts: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        default=None,
    )

    # audio_store: paths/references to recorded audio blobs per answer.
    # Keyed by question_index (str) -> local file path.
    audio_store: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        default=None,
    )

    # Relationships (optional but helpful)
    user = relationship("User")
    interview_profile = relationship("InterviewProfile")
