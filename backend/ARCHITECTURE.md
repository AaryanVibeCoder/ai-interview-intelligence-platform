# Backend Architecture Overview

## System Design

ElevateIQ backend uses a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Application                       │
│                  (main.py - Entry Point)                     │
├─────────────────────────────────────────────────────────────┤
│                    Router Layer (API Routes)                 │
│  ┌──────────────┬──────────────┬──────────────────────────┐  │
│  │  Health      │  User        │  Business Logic Routes   │  │
│  │  Routes      │  Routes      │  (To be added)          │  │
│  └──────────────┴──────────────┴──────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│               Service Layer (Business Logic)                 │
│  ┌──────────────┬──────────────┬──────────────────────────┐  │
│  │  Auth        │  User        │  Domain Services        │  │
│  │  Service     │  Service     │  (To be added)          │  │
│  └──────────────┴──────────────┴──────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Data Access Layer                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SQLAlchemy ORM - Database Models & Queries          │   │
│  └──────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                  Database Layer                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  PostgreSQL - Persistent Data Storage                │   │
│  └──────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                 Infrastructure Services                      │
│  ┌──────────────┬──────────────┬──────────────────────────┐  │
│  │  Config      │  Database    │  Logging & Monitoring   │  │
│  │  Management  │  Management  │  (To be configured)     │  │
│  └──────────────┴──────────────┴──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Application Core (`app/core/`)

**Purpose:** Centralized configuration and database setup

**Files:**
- `config.py` - Environment-based configuration
- `database.py` - SQLAlchemy engine, session factory, Base model
- `database_utils.py` - Database helper functions

**Key Features:**
- Environment variable management with Pydantic Settings
- Connection pooling with configurable pool sizes
- SQLAlchemy session factory with proper resource management
- Automatic table creation on startup

### 2. Data Models (`app/models/`)

**Purpose:** SQLAlchemy ORM models representing database tables

**Current:**
- `base.py` - Base model classes with timestamps

**Future Models:**
- `user.py` - User entity
- `profile.py` - User profile
- `auth.py` - Authentication entities
- Custom business domain models

**Key Features:**
- Automatic `created_at` and `updated_at` timestamps
- Cascading deletes and relationships
- Type hints for IDE support
- Database constraints and indexes

### 3. API Schemas (`app/schemas/`)

**Purpose:** Pydantic models for API request/response validation

**Current:**
- `base.py` - Base schemas for responses

**Future Schemas:**
- `user.py` - User request/response schemas
- `auth.py` - Authentication schemas
- Separate Create, Update, and Read schemas

**Key Features:**
- Type validation
- Serialization/deserialization
- Documentation generation
- Request/response examples

### 4. API Routes (`app/api/`)

**Purpose:** FastAPI routers defining HTTP endpoints

**Current:**
- `health.py` - Health check endpoints

**Future Routes:**
- `auth.py` - Authentication endpoints
- `users.py` - User management endpoints
- `products.py` - Product management
- Other domain-specific endpoints

**Key Features:**
- Modular route organization
- Automatic OpenAPI documentation
- Dependency injection for database access
- Error handling and validation

### 5. Business Services (`app/services/`)

**Purpose:** Business logic layer isolated from API routes

**Future Structure:**
```python
# app/services/user_service.py
class UserService:
    def create_user(self, email: str, name: str) -> User:
        """Create new user."""
        
    def get_user(self, user_id: int) -> User:
        """Get user by ID."""
        
    def update_user(self, user_id: int, data: dict) -> User:
        """Update user."""
```

### 6. Database Migrations (`alembic/`)

**Purpose:** Version control for database schema

**Files:**
- `env.py` - Alembic environment configuration
- `script.py.mako` - Migration template
- `versions/` - Individual migration files
- `alembic.ini` - Main configuration

**Workflow:**
1. Modify models
2. Generate migration: `alembic revision --autogenerate -m "description"`
3. Review migration file
4. Apply migration: `alembic upgrade head`

## Data Flow

### Request Flow

```
HTTP Request
    ↓
FastAPI Router (app/api/*.py)
    ↓
Route Handler
    ├─ Validate input (Pydantic schema)
    ├─ Get database session (Depends(get_db))
    ↓
Service Layer (app/services/*.py)
    ├─ Business logic
    ├─ Validation
    ├─ Orchestration
    ↓
Data Access (app/models/*.py)
    ├─ Query database
    ├─ Create/Update/Delete records
    ↓
SQLAlchemy & PostgreSQL
    ├─ Execute SQL
    ├─ Return result
    ↓
Response Mapping
    ├─ Convert ORM model to schema
    ├─ Serialize to JSON
    ↓
HTTP Response (200, 404, 500, etc.)
```

### Example: Create User

```
1. POST /api/users/ with {"email": "...", "name": "..."}
2. FastAPI validates input against CreateUserSchema
3. Route handler calls UserService.create_user()
4. Service creates User ORM model and saves to database
5. Database returns created user with ID
6. Response converts ORM to UserSchema (JSON)
7. Returns 201 with user data
```

## Database Schema Pattern

All tables follow this pattern:

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_email_unique UNIQUE (email)
);
```

**Standard Columns:**
- `id` - Auto-incrementing primary key
- `created_at` - Creation timestamp (UTC)
- `updated_at` - Last update timestamp (UTC)
- Domain-specific columns

## Configuration Management

### Environment-Based Configuration

```python
# app/core/config.py
class Settings(BaseSettings):
    ENVIRONMENT: str = "development"  # development, staging, production
    DEBUG: bool = True
    DATABASE_URL: str
    DATABASE_ECHO: bool = False
    
    # Auto-loaded from .env file
```

### Configuration Usage

```python
from app.core.config import get_settings

settings = get_settings()  # Cached singleton

# Use in code
engine = create_engine(settings.DATABASE_URL)
if settings.DEBUG:
    enable_debug_mode()
```

## Error Handling Strategy

### Layers of Error Handling

```
Database Errors (SQLAlchemy)
    ↓ Caught in Service
    ↓ Convert to domain error
    ↓ Propagate to Router
    ↓
Router Error Handling
    ↓ Convert to HTTP response
    ↓ Log error with context
    ↓
HTTP Response (400, 404, 500, etc.)
```

### Example

```python
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError

@app.post("/users/")
async def create_user(data: CreateUserSchema, db: Session = Depends(get_db)):
    try:
        user = UserService(db).create_user(**data.dict())
        return UserSchema.from_orm(user)
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail="Email already exists")
    except SQLAlchemyError as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
```

## Security Patterns

### 1. Database Injection Prevention

Using SQLAlchemy ORM automatically prevents SQL injection:

```python
# SAFE - Using ORM
user = db.query(User).filter(User.email == email).first()

# SAFE - Using parameterized queries
db.execute(text("SELECT * FROM users WHERE email = :email"), {"email": email})

# NEVER DO THIS
query = f"SELECT * FROM users WHERE email = '{email}'"  # SQL Injection!
```

### 2. Password Hashing

Future implementation:

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"])

# Hash password
hashed = pwd_context.hash(password)

# Verify password
is_correct = pwd_context.verify(password, hashed)
```

### 3. Authentication & Authorization

To be implemented with:
- JWT tokens
- OAuth2 integration
- Role-based access control (RBAC)
- Middleware for token validation

## Performance Optimization

### Database Optimization

1. **Connection Pooling** (Configured)
   ```python
   pool_size=10        # Connections to keep
   max_overflow=20     # Extra connections allowed
   pool_pre_ping=True  # Test connection before use
   ```

2. **Indexing** (To be added per model)
   ```python
   email: Mapped[str] = mapped_column(String(255), index=True)
   ```

3. **Eager Loading** (For relationships)
   ```python
   from sqlalchemy.orm import joinedload
   users = db.query(User).options(joinedload(User.posts)).all()
   ```

### Query Optimization

```python
# GOOD - Fetch only needed columns
users = db.query(User.id, User.name).all()

# GOOD - Use limit for pagination
users = db.query(User).limit(10).offset(0).all()

# AVOID - N+1 queries
for user in users:
    print(user.posts)  # Query executed per user!
```

## Monitoring & Logging

### Current Setup

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
```

### Future Enhancements

- Structured logging (JSON format)
- Log aggregation
- Performance monitoring
- Database query analysis
- Error tracking (Sentry)
- APM (Application Performance Monitoring)

## Testing Strategy

### Layers of Testing

```
Unit Tests → Integration Tests → End-to-End Tests
```

### Example Structure

```python
# tests/test_api/test_users.py
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_create_user():
    response = client.post("/api/users/", json={
        "email": "test@example.com",
        "name": "Test User"
    })
    assert response.status_code == 201
    assert response.json()["email"] == "test@example.com"
```

## Deployment Considerations

### Docker Deployment

```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0"]
```

### Database Migration on Deploy

```bash
#!/bin/bash
alembic upgrade head
uvicorn main:app --host 0.0.0.0 --workers 4
```

### Environment-Specific Config

```
.env.development  → Development setup
.env.staging      → Staging setup
.env.production   → Production setup (keep secret)
```

## Scalability Path

1. **Current:** Single server with PostgreSQL
2. **Next:** Read replicas for database queries
3. **Advanced:** Microservices with API Gateway
4. **Enterprise:** Distributed systems with message queues

## Roadmap

- [ ] Add business models
- [ ] Implement authentication (JWT)
- [ ] Add CRUD services
- [ ] Implement authorization
- [ ] Add API documentation
- [ ] Write comprehensive tests
- [ ] Setup CI/CD pipeline
- [ ] Implement caching
- [ ] Add monitoring/logging
- [ ] Performance optimization
