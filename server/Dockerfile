# syntax=docker/dockerfile:1
# Plannerr API server — uv-native, production image.
#
# Official astral uv image with Python 3.14 pre-installed (Debian trixie-slim).
# The floating tag rolls uv forward on rebuild; pin to a version tag like
# 0.12.4-python3.14-trixie-slim for fully reproducible builds.
# Works identically under Docker and Podman.
FROM ghcr.io/astral-sh/uv:python3.14-trixie-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first (layer caching: only re-run on lock changes).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy the application.
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

EXPOSE 8000

# Migrations run automatically on boot, then the API starts.
CMD ["sh", "-c", "uv run --no-sync alembic upgrade head && uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port 8000"]
