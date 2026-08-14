"""Plannerr API — application factory and entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import json
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request, Response
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.ratelimit import limiter
from app.routers import assignments, auth, classes, notifications

API_PREFIX = "/api/v1"

_LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def _configure_logging() -> None:
    """Surface app INFO logs (e.g. scheduled sends) alongside uvicorn's."""
    logging.basicConfig(level=logging.INFO, format=_LOG_FORMAT)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Start the daily-notification scheduler; stop it cleanly on shutdown."""
    from app.services.schedule import check_and_send_due

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        check_and_send_due,
        "interval",
        seconds=get_settings().notification_check_seconds,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=60,
    )
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Return a JSON 429 instead of slowapi's plain-text default."""
    return Response(
        content=json.dumps({"detail": "Too many requests. Please try again later."}),
        status_code=429,
        media_type="application/json",
    )


def create_app() -> FastAPI:
    _configure_logging()
    app = FastAPI(title="Plannerr API", version="0.1.0", lifespan=lifespan)

    # Rate limiting on auth endpoints.
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)

    app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["auth"])
    app.include_router(classes.router, prefix=f"{API_PREFIX}/classes", tags=["classes"])
    app.include_router(assignments.router, prefix=f"{API_PREFIX}/assignments", tags=["assignments"])
    app.include_router(
        notifications.router, prefix=f"{API_PREFIX}/notifications", tags=["notifications"]
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
