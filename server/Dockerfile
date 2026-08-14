# syntax=docker/dockerfile:1
# Plannerr API server — uv-native, production image.
#
# Base off the official python:3.14-slim image and copy the standalone uv
# binary from ghcr.io/astral-sh/uv. The astral-sh/uv image has no python3.14
# tag yet, and this pattern works identically under Docker and Podman.
FROM python:3.14-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    UV_PYTHON=/usr/local/bin/python

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
