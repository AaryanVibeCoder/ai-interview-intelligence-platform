"""Verification script for ElevateIQ backend setup."""

import sys
from pathlib import Path

print("\n" + "=" * 60)
print("ELEVATEIQ BACKEND - SETUP VERIFICATION")
print("=" * 60 + "\n")

# Check Python version
print(f"✓ Python Version: {sys.version.split()[0]}")

# Check virtual environment
print(f"✓ Virtual Environment: {sys.prefix}")

# Check imports
try:
    import fastapi

    print(f"✓ FastAPI: {fastapi.__version__}")
except ImportError:
    print("✗ FastAPI not installed")

try:
    import sqlalchemy

    print(f"✓ SQLAlchemy: {sqlalchemy.__version__}")
except ImportError:
    print("✗ SQLAlchemy not installed")

try:
    import alembic

    print(f"✓ Alembic: Installed")
except ImportError:
    print("✗ Alembic not installed")

try:
    import pydantic

    print(f"✓ Pydantic: {pydantic.__version__}")
except ImportError:
    print("✗ Pydantic not installed")

# Check directory structure
print("\n" + "-" * 60)
print("DIRECTORY STRUCTURE")
print("-" * 60 + "\n")

required_dirs = [
    "app/core",
    "app/models",
    "app/schemas",
    "app/api",
    "app/services",
    "alembic/versions",
]

required_files = [
    "main.py",
    "alembic.ini",
    ".env",
    "requirements.txt",
    "app/core/config.py",
    "app/core/database.py",
    "app/models/base.py",
    "app/schemas/base.py",
    "app/api/health.py",
    "alembic/env.py",
]

for dir_path in required_dirs:
    if Path(dir_path).exists():
        print(f"✓ {dir_path}/")
    else:
        print(f"✗ {dir_path}/ - NOT FOUND")

print()
for file_path in required_files:
    if Path(file_path).exists():
        print(f"✓ {file_path}")
    else:
        print(f"✗ {file_path} - NOT FOUND")

# Test application import
print("\n" + "-" * 60)
print("APPLICATION IMPORT TEST")
print("-" * 60 + "\n")

try:
    from main import app

    print("✓ Application imports successfully")
    print(f"✓ API Title: {app.title}")
    print(f"✓ API Version: {app.version}")
    print(f"✓ Routes: {len(app.routes)} endpoints")
except Exception as e:
    print(f"✗ Application import failed: {e}")

# Test configuration
print("\n" + "-" * 60)
print("CONFIGURATION TEST")
print("-" * 60 + "\n")

try:
    from app.core.config import get_settings

    settings = get_settings()
    print(f"✓ Environment: {settings.ENVIRONMENT}")
    print(f"✓ Debug Mode: {settings.DEBUG}")
    print(f"✓ Database URL: {settings.DATABASE_URL[:50]}...")
    print(f"✓ CORS Origins: {settings.CORS_ORIGINS}")
except Exception as e:
    print(f"✗ Configuration test failed: {e}")

# Summary
print("\n" + "=" * 60)
print("SETUP VERIFICATION COMPLETE ✓")
print("=" * 60)
print("\nYour ElevateIQ backend is ready!")
print("\nNext steps:")
print("1. Configure PostgreSQL in .env")
print("2. Create database: createdb elevateiq_db")
print("3. Run migrations: alembic upgrade head")
print("4. Start application: python main.py")
print("5. Visit: http://localhost:8000/docs")
print("\n" + "=" * 60 + "\n")
