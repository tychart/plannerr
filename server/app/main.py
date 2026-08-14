"""Plannerr API — application factory and entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import json

from fastapi import FastAPI, Request, Response
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.ratelimit import limiter
from app.routers import assignments, auth, classes

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Startup/shutdown hooks (reserved for future needs)."""
    yield


def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Return a JSON 429 instead of slowapi's plain-text default."""
    return Response(
        content=json.dumps({"detail": "Too many requests. Please try again later."}),
        status_code=429,
        media_type="application/json",
    )


def create_app() -> FastAPI:
    app = FastAPI(title="Plannerr API", version="0.1.0", lifespan=lifespan)

    # Rate limiting on auth endpoints.
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)

    app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["auth"])
    app.include_router(classes.router, prefix=f"{API_PREFIX}/classes", tags=["classes"])
    app.include_router(assignments.router, prefix=f"{API_PREFIX}/assignments", tags=["assignments"])

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
