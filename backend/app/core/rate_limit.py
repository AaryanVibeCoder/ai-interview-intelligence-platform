"""
Shared rate limiter instance — imported by route modules to apply per-endpoint limits.
Keyed by Clerk user ID (extracted from Bearer JWT payload) with IP fallback.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request
import base64
import json as _json


def _rate_limit_key(request: Request) -> str:
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "clerk_user_id"):
        return str(user.clerk_user_id)
    return get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key, default_limits=[])
