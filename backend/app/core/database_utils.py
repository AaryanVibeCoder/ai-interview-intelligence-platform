"""Database utilities and helpers."""

from sqlalchemy import text
from sqlalchemy.orm import Session


async def test_database_connection(db: Session) -> bool:
    """
    Test database connection.

    Args:
        db: Database session

    Returns:
        True if connection successful, False otherwise
    """
    try:
        db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def init_db_tables(db: Session) -> None:
    """
    Initialize database tables.

    Args:
        db: Database session
    """
    # Import all models here to ensure they are registered
    # with the Base metadata before creating tables
    from app.models.base import Base  # noqa: F401

    Base.metadata.create_all(bind=db.get_bind())
