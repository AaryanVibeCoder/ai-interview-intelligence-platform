"""
ElevateIQ FastAPI Application.
Production-grade backend API with SQLAlchemy and PostgreSQL.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.api.health import router as health_router
from app.api.me import router as me_router
from app.api.protected_example import router as protected_example_router
from app.core.config import get_settings
from app.core.database import close_db, init_db

from app.api import resume
from app.api import interview
from app.api import interview_mock
from app.api import coding
from app.api import nim_enrich

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Get settings
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifecycle.
    Startup: Initialize database
    Shutdown: Close database connection
    """
    # Startup
    logger.info("Starting up application...")
    try:
        await init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.warning(f"Database initialization warning: {e}")

    # Start the NIM ASR background queue worker
    from app.services.nim_queue import start_queue_worker
    start_queue_worker()

    # Emit Parakeet API key expiry / config warnings so they appear in startup logs
    for warning_msg in settings.get_startup_warnings():
        logger.warning(warning_msg)



    yield

    # Shutdown
    logger.info("Shutting down application...")
    try:
        await close_db()
        logger.info("Database connection closed")
    except Exception as e:
        logger.warning(f"Database closure warning: {e}")


from app.core.rate_limit import limiter



# Create FastAPI application
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description=settings.API_DESCRIPTION,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

# Attach SlowAPI limiter state and its exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.cors_methods_list,
    allow_headers=settings.cors_headers_list,
)

# Include routers
app.include_router(health_router)
app.include_router(me_router)
app.include_router(protected_example_router)


@app.get("/", tags=["root"])
async def root():
    """
    Root endpoint.

    Returns:
        dict: Welcome message with links
    """
    return {
        "message": "Welcome to ElevateIQ Backend API",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "health": "/health",
        "version": settings.API_VERSION,
    }


# Helper to dynamically retrieve and set CORS headers for error paths
def _get_cors_headers(request: Request) -> dict[str, str]:
    origin = request.headers.get("origin")
    headers = {}
    if origin:
        origins = settings.cors_origins_list
        if origin in origins or "*" in origins:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
            headers["Access-Control-Allow-Methods"] = "*"
            headers["Access-Control-Allow-Headers"] = "*"
    else:
        # Fallback to first origin in settings
        origins = settings.cors_origins_list
        if origins and origins[0] != "*":
            headers["Access-Control-Allow-Origin"] = origins[0]
            headers["Access-Control-Allow-Credentials"] = "true"
            headers["Access-Control-Allow-Methods"] = "*"
            headers["Access-Control-Allow-Headers"] = "*"
    return headers


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Structured JSON for expected HTTP errors (4xx/5xx with a real message)."""
    cors_headers = _get_cors_headers(request)
    exc_headers = getattr(exc, "headers", None) or {}
    response_headers = {**cors_headers, **exc_headers}
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=response_headers,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Structured JSON 500 for any unhandled exception — never a crash dump."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    cors_headers = _get_cors_headers(request)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
        headers=cors_headers,
    )



if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="info",
    )
# Include routers
app.include_router(health_router)
app.include_router(me_router)
app.include_router(protected_example_router)
app.include_router(resume.router)
app.include_router(interview.router)
app.include_router(interview_mock.router)
app.include_router(coding.router)
app.include_router(nim_enrich.router)




