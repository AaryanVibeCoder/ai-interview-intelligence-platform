"""Health check routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/", response_model=dict)
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint.

    Returns application and database status.
    """
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "healthy",
        "message": "ElevateIQ Backend is running",
        "database": db_status,
    }


@router.get("/live", response_model=dict)
async def liveness_check():
    """Kubernetes liveness probe endpoint."""
    return {"status": "alive"}


@router.get("/ready", response_model=dict)
async def readiness_check(db: Session = Depends(get_db)):
    """Kubernetes readiness probe endpoint."""
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        return {"status": "not_ready"}


@router.get("/test-1mb", response_model=dict)
async def test_1mb():
    """Download speed testing endpoint (returns 1MB of space character data)."""
    return {"data": " " * (1024 * 1024)}

