# ElevateIQ Backend

Production-grade backend API built with FastAPI, SQLAlchemy 2.0, and PostgreSQL.

## Project Structure

```
backend/
├── app/
│   ├── core/
│   │   ├── config.py          # Application configuration
│   │   ├── database.py        # Database setup and session management
│   │   ├── database_utils.py  # Database utilities
│   │   └── __init__.py
│   ├── models/
│   │   ├── base.py            # Base model classes
│   │   └── __init__.py
│   ├── schemas/
│   │   ├── base.py            # Base Pydantic schemas
│   │   └── __init__.py
│   ├── api/
│   │   ├── health.py          # Health check routes
│   │   └── __init__.py
│   ├── services/
│   │   └── __init__.py
│   └── __init__.py
├── alembic/
│   ├── env.py                 # Alembic environment script
│   ├── script.py.mako         # Migration template
│   ├── versions/              # Migration files
│   ├── alembic_config.py      # Alembic configuration helper
│   └── __init__.py
├── main.py                    # Application entry point
├── alembic.ini               # Alembic configuration
├── .env                      # Environment variables
└── requirements.txt          # Python dependencies
```

## Setup Instructions

### 1. Environment Setup

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# On Windows:
.\.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Environment Configuration

Edit `.env` file with your database credentials:

```bash
# Database Configuration
DATABASE_URL=postgresql://elevateiq_user:elevateiq_password@localhost:5432/elevateiq_db
DATABASE_ECHO=false

# Environment
ENVIRONMENT=development
DEBUG=true
```

### 3. Database Setup

#### Option A: Using Alembic (Recommended)

```bash
# Create initial migration (after creating models)
alembic revision --autogenerate -m "Initial migration"

# Apply migrations
alembic upgrade head

# Check migration status
alembic current
alembic history
```

#### Option B: Direct Table Creation

```bash
# Create all tables directly (for development)
python -c "from app.core.database import init_db; init_db()"
```

## Running the Application

```bash
# Development mode with auto-reload
python main.py

# Production mode
uvicorn main:app --host 0.0.0.0 --port 8500 --workers 4
```

## API Endpoints

### Health Check Endpoints
- `GET /` - Root endpoint with API information
- `GET /health/` - General health check with database status
- `GET /health/live` - Kubernetes liveness probe
- `GET /health/ready` - Kubernetes readiness probe

### API Documentation
- `GET /docs` - Swagger UI
- `GET /redoc` - ReDoc documentation
- `GET /openapi.json` - OpenAPI schema

## Creating Models

### Example Model

```python
# app/models/user.py
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class User(BaseModel):
    """User model."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)
```

### Creating Migrations

After adding models:

```bash
# Auto-generate migration
alembic revision --autogenerate -m "Add user model"

# Review the generated migration file in alembic/versions/

# Apply migration
alembic upgrade head
```

## Database Schema

### Base Tables

Models inherit from `BaseModel` which includes:

- `id` (Primary Key) - Auto-incrementing integer
- `created_at` - Timestamp with timezone (auto-set to now)
- `updated_at` - Timestamp with timezone (auto-set on update)

All timestamp fields use UTC timezone for consistency.

## Configuration

### Environment Variables

```bash
# Application
ENVIRONMENT=development|production
DEBUG=true|false
API_TITLE=ElevateIQ API
API_VERSION=1.0.0

# Database
DATABASE_URL=postgresql://user:password@host:port/database
DATABASE_ECHO=true|false  # Log SQL queries

# CORS
CORS_ORIGINS=["http://localhost:3000"]
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
```

## Best Practices

### 1. Database Sessions

Always use dependency injection for database sessions:

```python
from fastapi import Depends
from sqlalchemy.orm import Session
from app.core.database import get_db

@app.get("/items/")
async def get_items(db: Session = Depends(get_db)):
    items = db.query(Item).all()
    return items
```

### 2. Alembic Migrations

- Always review auto-generated migrations
- Name migrations descriptively
- Keep migrations small and focused
- Test migrations in development first

### 3. Models and Schemas

- Keep models for database representation
- Use Pydantic schemas for API validation
- Separate input (Create/Update) and output (Read) schemas

### 4. Error Handling

```python
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException

@app.get("/items/{item_id}")
async def get_item(item_id: int, db: Session = Depends(get_db)):
    try:
        item = db.query(Item).filter(Item.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        return item
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail="Database error")
```

## Database Connection Strings

### PostgreSQL
```
postgresql://user:password@localhost:5432/database
psycopg3 with native driver: postgresql+psycopg://user:password@localhost:5432/database
```

### SQLite (Development)
```
sqlite:///./database.db
sqlite+aiosqlite:///./database.db  # For async
```

## Troubleshooting

### Database Connection Error
- Verify PostgreSQL is running
- Check DATABASE_URL in .env
- Ensure database exists
- Check user permissions

### Alembic Errors
```bash
# Reset migration history (DEVELOPMENT ONLY)
# Delete alembic/versions/*.py files
# Delete _alembic_version table from database
alembic stamp head  # Mark as current
```

### Import Errors
- Ensure `.venv` is activated
- Run `pip install -r requirements.txt`
- Check all `__init__.py` files exist

## Performance Tips

1. Use connection pooling (configured in database.py)
2. Add database indexes to frequently queried columns
3. Use eager loading with `joinedload()` for relationships
4. Use read replicas for heavy queries in production
5. Monitor slow queries with `DATABASE_ECHO=true`

## Production Deployment

1. Set `ENVIRONMENT=production`
2. Set `DEBUG=false`
3. Use environment-specific connection pools
4. Set up database backups
5. Use Alembic migrations for schema changes
6. Monitor database performance
7. Use HTTPS only
8. Implement proper error logging

## Testing

Create a separate test database and test configuration:

```bash
# .env.test
DATABASE_URL=postgresql://user:password@localhost:5432/elevateiq_test_db
ENVIRONMENT=test
DEBUG=true
```

## Contributing

- Follow PEP 8 style guide
- Write docstrings for all functions
- Use type hints
- Keep models and schemas separate
- Test migrations thoroughly
