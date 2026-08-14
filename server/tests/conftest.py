"""Pytest configuration.

Environment is configured BEFORE importing the app so that settings and the
module-level engine point at the dedicated test database.
"""

import os
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://plannerr:plannerr@localhost:5432/plannerr_test",
)

os.environ.setdefault("DATABASE_URL", TEST_DATABASE_URL)
os.environ.setdefault("PASSWORD_PEPPER", "test-pepper")
os.environ.setdefault("RATE_LIMIT_AUTH", "10000/minute")
os.environ.setdefault("COOKIE_SECURE", "false")

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool  # noqa: E402

from app.db import get_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _migrated_database() -> None:
    """Apply all migrations to the test database once per session."""
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVER_DIR / "alembic"))
    command.upgrade(cfg, "head")


@pytest.fixture
async def client() -> AsyncClient:
    """HTTP client against the ASGI app with a fresh, per-loop engine.

    A per-test engine (NullPool) avoids cross-event-loop connection reuse,
    which trips up async SQLAlchemy under pytest-asyncio.
    """
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables(client: AsyncClient) -> None:
    """Wipe all rows after each test (cascades handle FKs)."""
    yield
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE users CASCADE"))
    await engine.dispose()
