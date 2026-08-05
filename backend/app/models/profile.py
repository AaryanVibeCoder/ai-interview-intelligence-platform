from __future__ import annotations

import uuid
from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship


from .base import BaseModel

if TYPE_CHECKING:
    from .user import User


class Profile(BaseModel):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
    )

    bio: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    target_role: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    experience_level: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    resume_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)

    user: Mapped["User"] = relationship(back_populates="profile")
