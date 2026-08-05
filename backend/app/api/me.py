from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.clerk_auth import get_current_user
from app.models.user import User
from app.schemas.user import MeResponse, MeResponseData, UserOut

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeResponse)
async def me(current_user: User = Depends(get_current_user)) -> MeResponse:
    """
    Get the authenticated user's current profile (/me).
    """
    user_out = UserOut(
        id=current_user.id,
        clerk_user_id=current_user.clerk_user_id,
        email=current_user.email,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
        profile=None,
    )

    return MeResponse(
        success=True,
        message="Authenticated",
        data=MeResponseData(user=user_out),
    )
