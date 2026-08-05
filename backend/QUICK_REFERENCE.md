# 🚀 Quick Reference Card

## Start the Application

```bash
cd backend
.\.venv\Scripts\activate  # Windows
python main.py
```

Visit: **http://localhost:8000/docs**

## Database Setup

```bash
# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE elevateiq_db;"
psql -U postgres -c "CREATE USER elevateiq_user WITH PASSWORD 'elevateiq_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE elevateiq_db TO elevateiq_user;"

# Apply migrations
alembic upgrade head
```

## Add a New Model

### 1. Create model in `app/models/user.py`:
```python
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import BaseModel

class User(BaseModel):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
```

### 2. Import in `app/models/__init__.py`:
```python
from app.models.user import User
```

### 3. Create migration:
```bash
alembic revision --autogenerate -m "Add user model"
alembic upgrade head
```

## Common Commands

```bash
# View migration history
alembic history

# Show current migration
alembic current

# Downgrade one step
alembic downgrade -1

# Downgrade to base
alembic downgrade base

# View API docs
http://localhost:8000/docs

# Health check
curl http://localhost:8000/health/

# Verify setup
python verify_setup.py
```

## Project Files

| File | Purpose |
|------|---------|
| `main.py` | Application entry point |
| `app/core/config.py` | Configuration management |
| `app/core/database.py` | Database setup & sessions |
| `app/models/base.py` | Base model with timestamps |
| `app/schemas/base.py` | Pydantic base schemas |
| `app/api/health.py` | Health check endpoints |
| `alembic/env.py` | Alembic configuration |
| `alembic.ini` | Alembic settings |
| `.env` | Environment variables |

## Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/elevateiq_db
ENVIRONMENT=development
DEBUG=true
```

## Dependencies Installed

- **FastAPI** (0.136.3) - Web framework
- **SQLAlchemy** (2.0.50) - ORM
- **Alembic** - Migrations
- **Pydantic** (2.13.4) - Data validation
- **Psycopg** - PostgreSQL driver
- **Uvicorn** - ASGI server

## Architecture

```
HTTP Request
    ↓
FastAPI Router (app/api/)
    ↓
Service Layer (app/services/)
    ↓
SQLAlchemy Models (app/models/)
    ↓
PostgreSQL Database
    ↓
Pydantic Schemas (app/schemas/)
    ↓
HTTP Response (JSON)
```

## Documentation

- **README.md** - Project overview
- **SETUP_COMPLETE.md** - Detailed setup guide
- **DATABASE_SETUP.md** - Database operations
- **ARCHITECTURE.md** - System design
- **QUICK_REFERENCE.md** - This file

## Troubleshooting

```bash
# Database not found?
createdb elevateiq_db

# Need to see SQL queries?
Set DATABASE_ECHO=true in .env

# Port already in use?
python -m uvicorn main:app --port 8001

# Reset migrations (dev only)?
alembic downgrade base
```

---

**Everything is ready! Start building! 🎯**
