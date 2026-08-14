# Plannerr

A clean, self-hostable assignment tracker. Organize homework by class, track
progress with a snapping slider, keep markdown notes and links per assignment,
and get a polished light/dark experience on desktop and mobile.

## Features (v1)

- **Accounts** — open self-registration, username + password (argon2id with a
  secret pepper), server-side sessions in HttpOnly cookies (30 days).
- **Classes** — per-user classes with a color (10 presets + a color wheel);
  deleting a class previews its assignments and can transfer them to another
  class first.
- **Assignments** — title, class, due date/time (time optional → "All day"),
  markdown notes, optional labeled links, priority flag, and a progress slider
  that snaps to increments of 5. At 100% the assignment is complete.
- **Home** — assignments grouped by day (overdue on top), infinite scroll past
  the first 7-day window, and a hide/show-completed toggle.
- **Theming** — dark mode is a first-class citizen (Tailwind v4 class-based
  variant + semantic tokens), defaults to your OS preference, no flash on load.

## Stack

| Layer    | Tech                                                                    |
| -------- | ----------------------------------------------------------------------- |
| `web/`   | React 19, TypeScript (strict), Vite, Tailwind CSS v4, TanStack Query, react-router, Radix UI, react-markdown, date-fns |
| `server/`| Python 3.14, FastAPI, SQLAlchemy 2.0 (async), Alembic, psycopg 3, pydantic-settings, argon2-cffi, slowapi, managed by `uv` |
| `db/`    | PostgreSQL 18                                                           |
| Deploy   | Single `docker compose` — three services (`web`, `server`, `db`)        |

## Quick start

The same `docker-compose.yml` and Dockerfiles run under **Docker** or
**Podman** (both implement the OCI spec; no engine-specific code or files).

```bash
cp .env.example .env
# 1. Generate a strong pepper and put it in .env:
#    uv run --project server python -c "import secrets; print(secrets.token_urlsafe(32))"
# 2. Set POSTGRES_PASSWORD to something unique.

# Docker (any machine):
docker compose up --build

# Podman (Fedora & friends):
podman-compose up --build
# → http://localhost:8080
```

The `server` container runs `alembic upgrade head` automatically on boot, so
migrations apply before the API starts serving.

### Docker vs. Podman

- One compose file, one pair of Dockerfiles — nothing is engine-specific.
- On Fedora, `podman-compose` (already installed) is the zero-install path.
  For exact `docker compose` feature parity, you can instead install
  `docker-compose` and run `podman compose up --build` — it drives the real
  Docker Compose against Podman's Docker-compatible API socket.
- Podman runs rootless here (no sudo, no daemon), so bind ports must be
  `>= 1024` (`WEB_PORT=8080` already is).

## Local development

Postgres always runs in a container (Podman or Docker); Python and React run
locally.

```bash
# 1. Database (postgres:18, port 5432)
podman-compose up db        # or: docker compose up db

# 2. Server — http://localhost:8000 (auto-reload)
cd server
uv sync
cp ../.env.example .env            # DATABASE_URL points at localhost
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 3. Web — http://localhost:5173 (Vite proxies /api → :8000)
cd web
npm install
npm run dev
```

## Environment variables

| Variable          | Used by | Required | Notes                                             |
| ----------------- | ------- | -------- | ------------------------------------------------- |
| `POSTGRES_USER`   | compose | dev      | DB user (default `plannerr`)                      |
| `POSTGRES_PASSWORD` | compose | **yes** | DB password; compose refuses to start without it  |
| `POSTGRES_DB`     | compose | dev      | DB name (default `plannerr`)                      |
| `DATABASE_URL`    | server  | **yes**  | `postgresql+psycopg://user:pass@host:5432/db`     |
| `PASSWORD_PEPPER` | server  | **yes**  | Secret mixed into password hashing. Never commit. |
| `COOKIE_SECURE`   | server  | no       | `true` over HTTPS (compose sets it); `false` for local http |
| `RATE_LIMIT_AUTH` | server  | no       | Per-IP auth rate limit (default `10/minute`)      |
| `WEB_PORT`        | compose | no       | Host port for the web app (default `8080`)        |

## Testing

```bash
# Server (needs a Postgres; set TEST_DATABASE_URL or use the compose db,
# which creates a `plannerr_test` database):
cd server && uv run pytest

# Web (Vitest unit tests for date grouping, color contrast, progress snapping):
cd web && npm run test
```

## Project layout

```
├── docker-compose.yml     # web + server + db (Postgres 18)
├── .env.example
├── server/                # FastAPI + SQLAlchemy async (uv project)
│   ├── app/               # config, db, models, security, routers
│   ├── alembic/           # async migrations
│   └── tests/             # pytest (auth, classes, assignments)
└── web/                   # React + TS + Vite + Tailwind v4
    └── src/
        ├── lib/           # api client, types, dates, color, progress
        └── features/      # auth, theme, home, assignments, classes
```

## Deployment notes

- Everything behind one host port: `web` (nginx) serves the built SPA and
  reverse-proxies `/api/*` to `server`, so the app is same-origin (no CORS,
  cookies "just work").
- Put a real reverse proxy (Caddy/nginx/Traefik) in front if you want TLS on
  `:443`; set `COOKIE_SECURE=true`.
- Data lives in the `pgdata` volume — back it up.

## Roadmap (v2 ideas)

Settings page (toggle quick-add conveniences), realtime markdown preview,
search/filter/calendar, reminders, sharing/collaborative lists, account
management. The architecture (feature folders, shared form, modular routers)
is designed to make these additive.
