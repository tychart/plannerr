# Plannerr server

FastAPI backend for Plannerr — SQLAlchemy 2.0 (async) + Alembic + psycopg 3,
managed with `uv`.

## Development

```bash
uv sync
cp ../.env.example .env       # DATABASE_URL → local Postgres
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

## Tests

Needs a reachable Postgres on :5432. The suite runs against `plannerr_test`. Use the
dev overlay to publish the compose db to the host (a plain `up db` keeps it private):

```bash
docker compose -f compose.yml -f compose.dev.yml up db   # creates plannerr + plannerr_test
uv run pytest
```

## Layout

- `app/config.py` — pydantic-settings (env vars, `.env`)
- `app/db.py` — async engine + session factory
- `app/models.py` — ORM models (users, sessions, classes, assignments, links)
- `app/security.py` — argon2id + pepper, token hashing, password policy
- `app/routers/` — auth, classes, assignments (REST under `/api/v1`)
- `alembic/` — async migrations (run automatically on container boot)
