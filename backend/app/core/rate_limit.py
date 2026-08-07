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
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            token = auth.split(" ", 1)[1]
            payload_b64 = token.split(".")[1]
            payload_b64 += "==" * (-len(payload_b64) % 4)
            claims = _json.loads(base64.urlsafe_b64decode(payload_b64))
            user_id = claims.get("sub") or claims.get("user_id")
            if user_id:
                return str(user_id)
        except Exception:
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key, default_limits=[])
