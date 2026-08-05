from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.clerk_auth import get_current_user
from app.models.user import User
from app.schemas.user import ProtectedExampleResponse

router = APIRouter(prefix="", tags=["protected-example"])


@router.get("/protected/example", response_model=ProtectedExampleResponse)
async def protected_example(
    current_user: User = Depends(get_current_user),
) -> ProtectedExampleResponse:
    """
    Protected API example route.
    Requires valid Clerk JWT.
    """
    return ProtectedExampleResponse(
        success=True,
        message="Protected route accessed",
        data={
            "clerk_user_id": current_user.clerk_user_id,
            "email": current_user.email,
            "name": f"{current_user.first_name} {current_user.last_name}".strip(),
        },
    )
