from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.database import get_db
from app.models.user import User
from app.services.user_sync_service import UserSyncService

bearer_scheme = HTTPBearer(auto_error=False)

# Simple in-memory JWKS cache: {jwks_url: {"expires_at": float, "jwks": dict}}
_JWKS_CACHE: dict[str, dict[str, object]] = {}
_JWKS_CACHE_TTL_SECONDS = 3600


@dataclass(frozen=True)
class ClerkJWTContext:
    token: str
    claims: dict[str, Any]
    clerk_user_id: str


def _ensure_valid_jwks_url(jwks_url: str) -> None:
    parsed = urlparse(jwks_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server misconfiguration: invalid CLERK_JWKS_URL",
        )


async def _fetch_jwks(jwks_url: str) -> dict[str, Any]:
    _ensure_valid_jwks_url(jwks_url)

    timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(jwks_url)
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to fetch authentication keys",
            )
        return resp.json()


def _public_key_from_jwks(
    jwks: dict[str, Any], kid: Optional[str]
) -> Optional[dict[str, Any]]:
    keys = jwks.get("keys") or []
    if not isinstance(keys, list):
        return None

    if kid is not None:
        for key in keys:
            if isinstance(key, dict) and key.get("kid") == kid:
                return key

    if keys and isinstance(keys[0], dict):
        # fallback: try the first key
        return keys[0]
    return None


def _get_kid_from_header(token: str) -> Optional[str]:
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        return str(kid) if kid is not None else None
    except JWTError:
        return None


async def _get_jwks_cached(jwks_url: str) -> dict[str, Any]:
    cached = _JWKS_CACHE.get(jwks_url)
    if cached is not None:
        expires_at = cached.get("expires_at")
        jwks_obj = cached.get("jwks")
        if (
            isinstance(expires_at, (int, float))
            and jwks_obj is not None
            and time.time() < float(expires_at)
            and isinstance(jwks_obj, dict)
        ):
            return jwks_obj

    jwks = await _fetch_jwks(jwks_url)
    _JWKS_CACHE[jwks_url] = {
        "expires_at": time.time() + _JWKS_CACHE_TTL_SECONDS,
        "jwks": jwks,
    }
    return jwks


async def _verify_clerk_jwt(token: str) -> ClerkJWTContext:
    settings = get_settings()

    if not settings.CLERK_JWT_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server misconfiguration: Clerk JWT verification disabled",
        )

    if not settings.CLERK_JWKS_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server misconfiguration: CLERK_JWKS_URL is required",
        )

    jwks = await _get_jwks_cached(settings.CLERK_JWKS_URL)
    kid = _get_kid_from_header(token)
    jwk_dict = _public_key_from_jwks(jwks, kid)
    if jwk_dict is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    issuer = settings.CLERK_JWT_ISSUER or None
    audience = settings.CLERK_JWT_AUDIENCE or None
    algorithms = settings.clerk_jwt_algorithms_list or ["RS256"]

    claims: dict[str, Any] = jwt.decode(
        token,
        key=jwk_dict,
        algorithms=algorithms,
        audience=audience,
        issuer=issuer,
        options={
            "verify_aud": audience is not None,
            "verify_iss": issuer is not None,
        },
    )

    clerk_user_id = (
        claims.get("sub") or claims.get("user_id") or claims.get("clerk_user_id")
    )
    if clerk_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token missing user identity",
        )

    return ClerkJWTContext(token=token, claims=claims, clerk_user_id=str(clerk_user_id))


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    db=Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    context = await _verify_clerk_jwt(token)

    # Idempotent sync: first login creates the user, subsequent logins update it.
    service = UserSyncService(db)
    try:
        service.sync_user_from_clerk(
            clerk_user_id=context.clerk_user_id, claims=context.claims
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    user = (
        db.query(User).filter(User.clerk_user_id == context.clerk_user_id).one_or_none()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found after synchronization",
        )

    return user
