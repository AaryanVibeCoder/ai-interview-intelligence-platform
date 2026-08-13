# Database Setup Guide

Quick reference for setting up and managing the ElevateIQ PostgreSQL database.

## Prerequisites

1. **Python 3.10+** installed
2. **PostgreSQL 12+** installed and running
3. Virtual environment created and activated

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Database

Edit `.env` with your PostgreSQL credentials:

```bash
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/elevateiq_db
```

### 3. Create Database (PostgreSQL)

```sql
-- Connect to PostgreSQL as admin
psql -U postgres

-- Create database
CREATE DATABASE elevateiq_db;

-- Create user
CREATE USER elevateiq_user WITH PASSWORD 'elevateiq_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE elevateiq_db TO elevateiq_user;

-- Exit
\q
```

### 4. Initialize Database Tables

```bash
# Using FastAPI startup (creates tables automatically)
python -c "from app.core.database import init_db; init_db()"
```

## Using Alembic for Migrations

### Initial Setup (Already Done)

The Alembic migration system is already configured in:
- `alembic/` - Migration scripts and configuration
- `alembic.ini` - Main Alembic configuration
- `alembic/env.py` - Database connection setup

### Creating Models

1. Define your model in `app/models/`:

```python
# app/models/user.py
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import BaseModel


class User(BaseModel):
    """User database model."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
```

2. Import the model in `app/models/__init__.py`:

```python
from app.models.user import User

__all__ = ["User"]
```

### Creating a Migration

After defining models:

```bash
# Auto-generate migration file
alembic revision --autogenerate -m "Add user table"

# Review the generated file in alembic/versions/
```

The generated file will look like:

```python
"""Add user table

Revision ID: 001
Revises: 
Create Date: 2024-01-15 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade database."""
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )


def downgrade() -> None:
    """Downgrade database."""
    op.drop_table('users')
```

### Applying Migrations

```bash
# Apply the latest migration
alembic upgrade head

# Apply to a specific revision
alembic upgrade 001

# Apply n migrations
alembic upgrade +2
```

### Migration Management

```bash
# View migration history
alembic history

# Show current migration
alembic current

# Show pending migrations
alembic current

# Downgrade to previous migration
alembic downgrade -1

# Downgrade all migrations
alembic downgrade base

# Downgrade to specific revision
alembic downgrade 001
```

## Common Scenarios

### Scenario 1: Add a New Column to Existing Table

1. Update the model:

```python
class User(BaseModel):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)  # New column
```

2. Generate migration:

```bash
alembic revision --autogenerate -m "Add is_active to users"
```

3. Review and apply:

```bash
alembic upgrade head
```

### Scenario 2: Create a Relationship Between Tables

```python
# app/models/user.py
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class User(BaseModel):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    
    # Relationship
    posts: Mapped[list["Post"]] = relationship(back_populates="author")


# app/models/post.py
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship, Mapped
from app.models.base import BaseModel


class Post(BaseModel):
    __tablename__ = "posts"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    
    # Relationship
    author: Mapped["User"] = relationship(back_populates="posts")
```

Then run:

```bash
alembic revision --autogenerate -m "Add posts table and user relationship"
alembic upgrade head
```

### Scenario 3: Rename a Column

Manually edit the migration:

```python
def upgrade() -> None:
    """Upgrade database."""
    op.alter_column('users', 'old_name', new_column_name='new_name')


def downgrade() -> None:
    """Downgrade database."""
    op.alter_column('users', 'new_name', new_column_name='old_name')
```

Then run:

```bash
alembic upgrade head
```

### Scenario 4: Change Column Type

Manually edit the migration:

```python
def upgrade() -> None:
    """Upgrade database."""
    op.alter_column('users', 'age', type_=sa.String())  # From Integer to String


def downgrade() -> None:
    """Downgrade database."""
    op.alter_column('users', 'age', type_=sa.Integer())
```

## Troubleshooting

### Issue: "No changes detected in schema"

Usually means SQLAlchemy didn't detect changes. Ensure:

1. Model inherits from `BaseModel`
2. Model has `__tablename__`
3. All imports are in place

```python
from app.models.base import BaseModel

class MyModel(BaseModel):
    __tablename__ = "my_models"
    # columns...
```

### Issue: Migration fails to apply

Check the migration file syntax:

```bash
# Check if migration syntax is valid
python -c "from alembic import config; config.Config('alembic.ini')"
```

### Issue: "Target database is not up to date"

The database is behind on migrations:

```bash
# Apply all pending migrations
alembic upgrade head

# Or check current state
alembic current
```

### Issue: Need to rollback and re-apply

```bash
# Downgrade one step
alembic downgrade -1

# Then upgrade again
alembic upgrade head
```

### Issue: Reset database (Development Only!)

**WARNING: This deletes all data!**

```bash
# Drop all tables
alembic downgrade base

# Re-apply all migrations
alembic upgrade head
```

Or directly in SQL:

```sql
-- Drop all tables
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

## Best Practices

1. **Review auto-generated migrations** - Always check if Alembic detected the right changes
2. **Test locally first** - Apply and test migrations on local database
3. **Keep migrations small** - One logical change per migration
4. **Use descriptive names** - `add_user_email_index` is better than `migration_001`
5. **Never modify applied migrations** - Create a new migration to fix issues
6. **Test downgrade** - Ensure `downgrade()` works correctly
7. **Commit migrations to git** - Version control is essential

## Migration Workflow

```
1. Create/Update Model
   ↓
2. Generate Migration
   ↓
3. Review Migration File
   ↓
4. Test Locally
   ↓
5. Commit & Push
   ↓
6. Deploy & Run: alembic upgrade head
```

## Running Application with Migrations

The application automatically initializes the database on startup. To manually run migrations:

```bash
# Apply all pending migrations
alembic upgrade head

# Start the application
python main.py
```

The health check endpoints will verify the database is ready:

```bash
# Test database connection
curl http://localhost:8500/health/

# Response:
# {"status":"healthy","database":"connected","message":"..."}
```

## Resources

- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
