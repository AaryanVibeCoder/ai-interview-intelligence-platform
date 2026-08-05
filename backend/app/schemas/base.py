"""Base schemas for API responses."""

from datetime import datetime
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class BaseSchema(BaseModel):
    """Base schema with common configuration."""

    model_config = ConfigDict(from_attributes=True)


class TimestampSchema(BaseSchema):
    """Schema with timestamp fields."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PaginationSchema(BaseSchema, Generic[T]):
    """Pagination schema for list responses."""

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class ResponseSchema(BaseSchema):
    """Standard API response schema."""

    success: bool
    message: str
    data: Optional[dict] = None
