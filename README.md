# Plannerr

A clean, self-hostable planner for schoolwork. Track assignments with a
snapping progress slider and keep quizzes and exams alongside them — each with
markdown notes and links — organized by class, in a polished light/dark
experience on desktop and mobile. Installable as a PWA with offline caching,
plus optional AI-written daily push summaries.

## Features (v1)

- **Accounts** — open self-registration, username + password (argon2id with a
  secret pepper), server-side sessions in HttpOnly cookies (30 days).
- **Classes** — per-user classes with a color (10 presets + a color wheel);
  deleting a class previews its items and can transfer them (assignments,
  quizzes, and exams alike) to another class first.
- **Assignments, Quizzes & Exams** — one shared model of trackable *items*
  (a `kind` column). Assignments add a title, due date/time, markdown notes,
  optional labeled links, priority flag, and a progress slider that snaps to
  increments of 5 (at 100% the assignment is complete). Quizzes and exams are
  dated events with a name, date/time, notes, links, and priority — no
  progress, no completion.
- **Home dashboard** — the week's active assignments (overdue + next 7 days)
  take the bulk of the space; a sidebar lists **Upcoming quizzes** and
  **Upcoming exams** in separate sections, today-onward, capped at 10 each.
- **Per-type pages** — top-bar pages for Assignments, Quizzes, and Exams hold
  *all* items of that type with server-side search (title/notes), class
  filter, and due-date/completion filters; every item kind also has a
  focus-mode detail page (`/assignments/:id`, `/quizzes/:id`, `/exams/:id`).
- **Responsive navigation** — on phones and narrow windows (< 768px) the
  top-bar links fold into a slide-out menu (hamburger → right-hand sheet)
  with comfortable 44px touch targets; the theme toggle stays one tap away
  while your username and log-out move into the sheet. Tablets and desktops
  keep the full inline nav — both views render from one shared list, so new
  pages appear everywhere automatically.
- **Notifications** — an AI-written daily summary of what's due, delivered as a
  push notification (Web Push). Settings can **schedule a daily send time**
  (only fires on days something is due), send one now with **Send today's
  summary**, or send a **custom AI notification**. Configured with VAPID keys +
  any OpenAI-compatible LLM endpoint.
- **Backups** — Settings → **Backup & restore** downloads everything (classes,
  assignments, quizzes, exams) as a versioned JSON file and imports one back.
  Imports are additive and duplicate-safe (same kind + class + name + date are
  skipped), match or create classes by name, accept hand-written files with
  `YYYY-MM-DD` dates, and report skipped rows per line.
- **PWA / offline** — installable to your home screen (standalone, notch-safe),
  with a service worker that caches the app shell and last-seen data; an
  offline banner appears when disconnected.
- **Theming** — dark mode is a first-class citizen (Tailwind v4 class-based
  variant + semantic tokens), defaults to your OS preference, no flash on load.

## Stack

| Layer    | Tech                                                                    |
| -------- | ----------------------------------------------------------------------- |
| `web/`   | React 19, TypeScript (strict), Vite, Tailwind CSS v4, TanStack Query, react-router, Radix UI, react-markdown, date-fns, vite-plugin-pwa (Workbox) |
| `server/`| Python 3.14, FastAPI, SQLAlchemy 2.0 (async), Alembic, psycopg 3, pydantic-settings, argon2-cffi, slowapi, pywebpush, httpx, managed by `uv` |
| `db/`    | PostgreSQL 18                                                           |
| Deploy   | Single `docker compose` — three services (`web`, `server`, `db`)        |

## Quick start

The same `compose.yml` and two `Containerfile`s run under **Docker** or
**Podman** — both implement the OCI spec, and `compose.yml` / `Containerfile`
are the neutral file names both engines accept (Docker Compose v2 and
`podman-compose` auto-detect `compose.yml`; the compose `build:` blocks name
the `Containerfile` explicitly so Docker Compose finds it too).

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

```bash
# 3. (Optional) Push notifications — generate VAPID keys and add to .env:
#    uv run --project server python -m app.vapid_keys
#    Then set LLM_BASE_URL to any OpenAI-compatible endpoint (see below).
```

### Docker vs. Podman

- One compose file, one pair of Containerfiles — nothing is engine-specific.
- The build-ignore files stay named `.dockerignore` on purpose: Docker reads
  only that name, and Podman reads it too, so it is the engine-neutral choice
  (a `.containerignore` rename would make `docker compose build` silently
  include `node_modules`/`.venv` in build contexts).
- Engine-neutral names: `compose.yml` at the repo root and a `Containerfile`
  in each of `web/` and `server/`. Podman's tooling prefers these names and
  Docker Compose v2 reads them too. Building a service directly (outside
  compose): `podman build ./web` just works; with Docker run
  `docker build -f web/Containerfile ./web`.
- On Fedora, `podman-compose` (already installed) is the zero-install path.
  For exact `docker compose` feature parity, you can instead install the
  Docker Compose v2 binary and run `podman compose up --build` — it drives
  real Docker Compose against Podman's Docker-compatible API socket.
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
| `RATE_LIMIT_NOTIFICATIONS` | server | no | Per-IP limit on the test-notification endpoint (default `6/minute`) |
| `NOTIFICATION_CHECK_SECONDS` | server | no | How often the daily-send scheduler scans for due sends (default `30`) |
| `VAPID_PUBLIC_KEY` | server | no | Web Push public key (base64url). Empty ⇒ notifications disabled. Generate with `uv run --project server python -m app.vapid_keys` |
| `VAPID_PRIVATE_KEY` | server | no | Web Push private key (base64url). Keep secret.   |
| `VAPID_SUBJECT`  | server | no       | Contact for push services (`mailto:…` or `https:…`). Default `mailto:plannerr@localhost` |
| `LLM_BASE_URL`   | server | no       | OpenAI-compatible chat-completions base URL (LiteLLM `http://host:4000/v1`, Ollama `http://host:11434/v1`, OpenAI `https://api.openai.com/v1`…). Empty ⇒ deterministic fallback summary |
| `LLM_API_KEY`    | server | no       | Optional bearer token for the LLM endpoint (Ollama / keyless LiteLLM: leave empty) |
| `LLM_MODEL`      | server | no       | Model name served by the endpoint (default `gpt-4o-mini`) |
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
├── compose.yml            # web + server + db (Postgres 18)
├── .env.example
├── server/                # FastAPI + SQLAlchemy async (uv project)
│   ├── Containerfile      # uv-based production image (Docker/Podman)
│   ├── entrypoint.sh      # alembic upgrade head, then exec uvicorn
│   ├── app/               # config, db, models (items/classes/users), routers
│   ├── alembic/           # async migrations
│   └── tests/             # pytest (auth, classes, items, notifications)
└── web/                   # React + TS + Vite + Tailwind v4
    ├── Containerfile      # multi-stage: node build → nginx
    ├── nginx.conf         # SPA fallback + /api reverse proxy
    └── src/
        ├── lib/           # api client, types, items, dates, color, progress, push, backup
        ├── components/    # app shell + mobile menu; shared ui primitives (Button, Modal, …)
        └── features/      # auth, theme, home, items, classes, notifications, settings
```

## Push notifications (PWA)

Plannerr is an installable PWA. The **Settings → Daily notifications** section
enables push on the current device and has a **Send test notification** button
that generates today's summary and pushes it to every device you've enrolled.
The notification body is written by an LLM (1–3 short sentences); if the LLM is
unconfigured or unreachable, a built-in deterministic summary is used instead.

**Settings → Custom AI notification** is a second test button: type anything and
the LLM rewrites it into a friendly push notification. It requires the LLM to be
configured — otherwise the button is greyed out with the reason shown.

**Settings → Daily schedule** sends the summary automatically every day at a
**time you choose** (in your timezone), but **only on days when something is
due or overdue** — quiet days get nothing. It runs in-process via APScheduler
(30-second tick); each user stores their own time + IANA timezone, and the
once-per-day guard prevents duplicates.

Setup is two optional env blocks (see the table above):

```bash
# VAPID keys — one-time generation:
uv run --project server python -m app.vapid_keys
# → paste VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY into .env, set VAPID_SUBJECT

# LLM endpoint — any OpenAI-compatible chat-completions server:
LLM_BASE_URL=http://localhost:11434/v1   # Ollama (local dev, outside containers)
# In the compose stack the server runs in a container: "localhost" there is the
# container itself. Use the host alias instead:
#   LLM_BASE_URL=http://host.containers.internal:11434/v1   # Podman/Docker host
# LLM_BASE_URL=http://localhost:4000/v1  # LiteLLM proxy
LLM_API_KEY=                             # optional (Ollama/keyless LiteLLM)
LLM_MODEL=llama3.1                       # any model the endpoint serves
```

Things to know:

- **HTTPS is required** for service workers and push on real devices (localhost
  is exempt). Put your reverse proxy in front of the web container and set
  `COOKIE_SECURE=true`.
- **LLM reachability**: the server runs in a container, so `localhost` in
  `LLM_BASE_URL` points at the container itself. Point it at the host with
  `http://host.containers.internal:11434/v1` (Podman/Docker host alias), the
  host's LAN IP, or run the LLM as a compose service.
- **Thinking models**: models like `*-thinking` spend tokens on reasoning before
  answering. The server retries once with a larger token budget when the first
  response is empty, but very slow models make the button take several seconds.
- **iOS (Safari ≥ 16.4)** only delivers push to *installed* PWAs — the user must
  tap Share → “Add to Home Screen” first. Settings shows a hint when needed.
- **Offline**: the app shell is precached and `GET /api/*` responses are cached
  (network-first, 7-day expiry). When disconnected you still see your last-seen
  data plus an offline banner; edits require a connection.
- Clicking a notification opens the app (focusing an open tab if there is one).

## Backups (export / import JSON)

Settings → **Backup & restore**. The exported file is a complete, deterministic
snapshot:

```json
{
  "format": "plannerr-backup",
  "version": 1,
  "exported_at": "2026-09-02T12:00:00.000Z",
  "classes": [{ "name": "Math", "color": "#ff0000" }],
  "items": [
    {
      "kind": "assignment",
      "title": "Problem set 3",
      "notes": "",
      "due_at": "2026-09-15T23:59:59.000Z",
      "progress": 35,
      "is_priority": true,
      "class": "Math",
      "links": [{ "url": "https://canvas.example.com/ps3", "label": "Canvas" }]
    }
  ]
}
```

Importing is an **additive merge** — nothing existing is deleted or overwritten.
Classes are matched by name (case-insensitive) and created with their stored
color when missing; rows whose `kind + class + title + due date` already exist
are skipped (so re-importing a file never duplicates). Hand-written files are
welcome: only `kind`, `title`, `class`, and `due_at` are required; dates accept
`YYYY-MM-DD` (all-day) or ISO date-times; `notes`, `links`, `is_priority`, and
assignment `progress` are optional. Every skipped row is reported with its line
number and reason while the rest import.

## Deployment notes

- Everything behind one host port: `web` (nginx) serves the built SPA and
  reverse-proxies `/api/*` to `server`, so the app is same-origin (no CORS,
  cookies "just work").
- Put a real reverse proxy (Caddy/nginx/Traefik) in front if you want TLS on
  `:443`; set `COOKIE_SECURE=true`.
- Data lives in the `pgdata` volume — back it up.

## Roadmap (v2 ideas)

Realtime markdown preview, search/filter/calendar, sharing/collaborative lists,
account management. The architecture (feature folders, shared form, modular
routers) is designed to make these additive.
