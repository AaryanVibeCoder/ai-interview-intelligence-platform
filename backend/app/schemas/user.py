from __future__ import annotations

from typing import Optional
from uuid import UUID

from app.schemas.base import BaseSchema, ResponseSchema, TimestampSchema


class UserOut(TimestampSchema):
    id: UUID
    clerk_user_id: str
    email: str
    first_name: str
    last_name: str
    profile: Optional[dict] = None


class MeResponseData(BaseSchema):
    user: UserOut


class MeResponse(ResponseSchema):
    data: Optional[MeResponseData] = None


class ProtectedExampleResponse(ResponseSchema):
    data: Optional[dict] = None
