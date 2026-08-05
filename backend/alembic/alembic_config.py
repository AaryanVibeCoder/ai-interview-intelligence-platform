"""Alembic configuration.

Database versioning tool configuration.
"""

from alembic import config as alembic_config


def get_alembic_config():
    """Get Alembic configuration instance."""
    return alembic_config.Config("alembic.ini")
