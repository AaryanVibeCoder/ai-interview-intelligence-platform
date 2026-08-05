"""Alembic configuration file."""

import os

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

# This is the Alembic Config object.
config = fileConfig("alembic.ini")

# Alembic configuration
sqlalchemy_url = os.environ.get("DATABASE_URL", "sqlite:///./test.db")


def configure_alembic():
    """Configure Alembic settings."""
    if config.config_file_name is not None:
        fileConfig(config.config_file_name)

    config.set_main_option("sqlalchemy.url", sqlalchemy_url)
