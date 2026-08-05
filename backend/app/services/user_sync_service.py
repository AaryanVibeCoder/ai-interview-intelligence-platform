from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional

from sqlalchemy.exc import IntegrityError

from app.models.user import User


@dataclass(frozen=True)
class UserSyncResult:
    created: bool
    updated: bool
    clerk_user_id: str


class UserSyncService:
    """
    Synchronize ElevateIQ user records with Clerk JWT claims.

    Requirements implemented:
    - First login: create DB user record if missing
    - Subsequent logins: update existing user fields
    - Idempotent and safe against repeated calls
    """

    def __init__(self, db: Any):
        self.db = db

    @staticmethod
    def _extract_clerk_user_id(claims: Mapping[str, Any], clerk_user_id: str) -> str:
        # Prefer explicit clerk_user_id passed in; fallback for safety.
        return str(
            claims.get("sub")
            or claims.get("user_id")
            or claims.get("clerk_user_id")
            or clerk_user_id
        )

    @staticmethod
    def _extract_email(claims: Mapping[str, Any]) -> Optional[str]:
        email = claims.get("email")
        if isinstance(email, str) and email:
            return email

        # Clerk sometimes provides email addresses array under different claim shapes.
        email_addresses = claims.get("email_addresses")
        if isinstance(email_addresses, list) and email_addresses:
            first = email_addresses[0]
            if isinstance(first, dict):
                addr = first.get("email_address") or first.get("email")
                if isinstance(addr, str) and addr:
                    return addr
            if isinstance(first, str) and first:
                return first

        return None

    @staticmethod
    def _extract_first_last_name(
        claims: Mapping[str, Any],
    ) -> tuple[Optional[str], Optional[str]]:
        first_name = claims.get("first_name")
        last_name = claims.get("last_name")

        if isinstance(first_name, str) and isinstance(last_name, str):
            return (first_name, last_name)

        # Some Clerk tokens include name parts in `name`
        full_name = claims.get("name")
        if isinstance(full_name, str) and full_name.strip():
            parts = [p for p in full_name.strip().split(" ") if p]
            if len(parts) == 1:
                return (parts[0], "")
            return (parts[0], " ".join(parts[1:]))

        return (None, None)

    def sync_user_from_clerk(
        self, clerk_user_id: str, claims: Mapping[str, Any]
    ) -> UserSyncResult:
        clerk_uid = self._extract_clerk_user_id(
            claims=claims, clerk_user_id=clerk_user_id
        )

        email = self._extract_email(claims)
        first_name, last_name = self._extract_first_last_name(claims)

        # Validate minimum fields for model constraints (nullable=False)
        # If missing, fail closed.
        if email is None:
            raise ValueError("Clerk JWT missing required user identity fields (email).")
        first_name = first_name or ""
        last_name = last_name or ""

        existing = (
            self.db.query(User).filter(User.clerk_user_id == clerk_uid).one_or_none()
        )

        if existing is None:
            # First login: create user record.
            new_user = User(
                clerk_user_id=clerk_uid,
                email=email,
                first_name=first_name,
                last_name=last_name,
            )
            self.db.add(new_user)
            try:
                self.db.commit()
            except IntegrityError:
                # Unique constraint collisions (e.g., email used by different clerk_user_id)
                self.db.rollback()
                # Fetch by email as fallback and update clerk_user_id.
                by_email = self.db.query(User).filter(User.email == email).one_or_none()
                if by_email is None:
                    raise
                by_email.clerk_user_id = clerk_uid
                by_email.first_name = first_name
                by_email.last_name = last_name
                self.db.commit()
                return UserSyncResult(
                    created=False, updated=True, clerk_user_id=clerk_uid
                )

            return UserSyncResult(created=True, updated=False, clerk_user_id=clerk_uid)

        # Subsequent logins: update fields if changed.
        updated = False
        if existing.email != email:
            existing.email = email
            updated = True
        if existing.first_name != first_name:
            existing.first_name = first_name
            updated = True
        if existing.last_name != last_name:
            existing.last_name = last_name
            updated = True

        if updated:
            self.db.commit()

        return UserSyncResult(created=False, updated=updated, clerk_user_id=clerk_uid)
