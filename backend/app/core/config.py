"""
Application configuration using Pydantic settings.
Environment-based configuration management.
"""

from functools import lru_cache
from typing import List, Optional
import datetime

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # API Configuration
    API_TITLE: str = "ElevateIQ API"
    API_VERSION: str = "1.0.0"
    API_DESCRIPTION: str = "Production-grade API for ElevateIQ"
    ALLOWED_HOSTS: str = "localhost,127.0.0.1"

    # Database Configuration
    DATABASE_URL: str = (
        "postgresql://elevateiq_user:elevateiq_password@localhost:5432/elevateiq_db"
    )
    DATABASE_ECHO: bool = False

    # Clerk / JWT Authentication (used for protected endpoints)
    CLERK_SECRET_KEY: str = Field(
        default="",
        description="Clerk API secret key (for reference, not used in JWT validation)",
    )
    CLERK_JWT_ENABLED: bool = False

    CLERK_JWT_ISSUER: str = Field(default="", description="Expected JWT issuer (iss)")
    CLERK_JWT_AUDIENCE: str = Field(
        default="", description="Expected JWT audience (aud)"
    )

    CLERK_JWKS_URL: str = Field(
        default="", description="Clerk JWKS URL for verifying JWT signatures"
    )

    CLERK_JWT_ALGORITHMS: str = Field(
        default="RS256",
        description="Comma-separated JWT algorithms to accept (e.g., RS256)",
    )

    # CORS Configuration
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: str = "*"
    CORS_ALLOW_HEADERS: str = "*"

    # LLM Configuration
    LLM_API_KEY: str = Field(default="", description="LLM/OpenRouter/NVIDIA API Key")
    NVIDIA_API_KEY: str = Field(default="", description="Backward-compatible NVIDIA API key alias")
    NVIDIA_MODEL_NAME: str = Field(
        default="poolside/laguna-s-2.1:free",
        description="OpenRouter/NVIDIA model used for interview generation and scoring",
    )

    # ─── NVIDIA Parakeet ASR Configuration ────────────────────────────────────
    NVIDIA_PARAKEET_API_KEY: str = Field(
        default="",
        description=(
            "NVIDIA NIM Parakeet-TDT-0.6b-v2 ASR API key. "
            "Testing-tier keys expire in ~6 months."
        ),
    )
    NVIDIA_PARAKEET_KEY_ISSUED_DATE: Optional[str] = Field(
        default=None,
        description=(
            "ISO-8601 date when NVIDIA_PARAKEET_API_KEY was issued (e.g. '2026-07-31'). "
            "Used to emit expiry warnings in startup logs."
        ),
    )

    # SMTP Configuration
    SMTP_HOST: str = Field(default="smtp.gmail.com", description="SMTP server host")
    SMTP_PORT: int = Field(default=587, description="SMTP server port")
    SMTP_USER: str = Field(default="", description="SMTP server user")
    SMTP_PASSWORD: str = Field(default="", description="SMTP server password")

    class Config:
        """Pydantic config."""

        env_file = ".env"
        case_sensitive = True

    @property
    def allowed_hosts_list(self) -> List[str]:
        """Get allowed hosts as list."""
        return [host.strip() for host in self.ALLOWED_HOSTS.split(",")]

    @property
    def cors_origins_list(self) -> List[str]:
        """Get CORS origins as list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def cors_methods_list(self) -> List[str]:
        """Get CORS methods as list."""
        if self.CORS_ALLOW_METHODS == "*":
            return ["*"]
        return [method.strip() for method in self.CORS_ALLOW_METHODS.split(",")]

    @property
    def cors_headers_list(self) -> List[str]:
        """Get CORS headers as list."""
        if self.CORS_ALLOW_HEADERS == "*":
            return ["*"]
        return [header.strip() for header in self.CORS_ALLOW_HEADERS.split(",")]

    @property
    def clerk_jwt_algorithms_list(self) -> List[str]:
        """Get allowed JWT algorithms as list."""
        return [a.strip() for a in self.CLERK_JWT_ALGORITHMS.split(",") if a.strip()]

    def get_parakeet_key_age_days(self) -> Optional[int]:
        """Calculate age of the Parakeet key in days, or None if issue date not set."""
        if not self.NVIDIA_PARAKEET_KEY_ISSUED_DATE:
            return None
        try:
            issue_date = datetime.date.fromisoformat(self.NVIDIA_PARAKEET_KEY_ISSUED_DATE)
            today = datetime.date.today()
            return (today - issue_date).days
        except Exception:
            return None

    def get_startup_warnings(self) -> List[str]:
        """Return a list of human-readable startup warnings about config issues."""
        warnings: List[str] = []
        if not self.NVIDIA_PARAKEET_API_KEY:
            warnings.append(
                "[NIM-ASR] NVIDIA_PARAKEET_API_KEY is not set. "
                "Post-interview NIM transcription enrichment will be disabled."
            )
        else:
            age = self.get_parakeet_key_age_days()
            if age is not None:
                if age >= 150:  # ~5 months — early warning
                    warnings.append(
                        f"[NIM-ASR] NVIDIA_PARAKEET_API_KEY is {age} days old "
                        f"(expires ~180 days from issuance). Renew soon at build.nvidia.com."
                    )
            else:
                warnings.append(
                    "[NIM-ASR] NVIDIA_PARAKEET_KEY_ISSUED_DATE not set. "
                    "Cannot track API key age. Set it to enable expiry warnings."
                )
        return warnings


@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()
