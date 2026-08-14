# Plannerr — v1 Architecture Plan

## Context

Greenfield self-hostable assignment-tracker web app ("Plannerr"). The repo currently contains only a placeholder `uv` project (`main.py`, empty `pyproject.toml`, no commits). We are building v1 from scratch: a clean, minimal, **easily maintainable and extendable** monorepo with three docker-compose services — React frontend, FastAPI backend, Postgres 18.

**Stack (locked by user):** React + TypeScript + Vite + Tailwind CSS v4 · Python + FastAPI managed by `uv` · Postgres 18 · single `docker compose` with exactly 3 services · dark mode as a first-class citizen.

---

## Locked-in decisions (from Q&A)

| Area | Decision |
|---|---|
| Accounts | Open self-registration, username-only (no email), 3–32 chars `[a-zA-Z0-9_]`, password ≥ 8 chars |
| Sessions | Server-side sessions in DB, random token in HttpOnly cookie, 30-day expiry |
| Time | Store UTC (`timestamptz`), render browser-local |
| Data visibility | Strictly personal — every query scoped to logged-in user |
| Primary keys | UUID everywhere (classes are editable incl. name; avoids URL/ID churn) |
| Completion | **Derived**: `progress == 100` ⇒ complete. No separate status field |
| Priority | Simple boolean flag |
| Class deletion | Cascade delete **with confirmation dialog** listing affected assignments + optional **transfer to another class** first |
| Default class | Auto-created "Default" on signup; `class_id` NOT NULL |
| Class colors | Store hex string `#RRGGBB`; render-time contrast computation; UI = 8–10 swatches + native `<input type="color">` wheel |
| Home list | Continuous list sorted by `due_at` ASC, day headers, **"Overdue" group at top**; completed stay in date position, styled complete, hide/show toggle |
| Loading more | True infinite scroll, cursor (keyset) pagination, IntersectionObserver sentinel |
| 7-day window | First page = everything due within next 7 days (incl. overdue); scrolling loads older |
| Assignment editing | Quick-add **modal on Home** + dedicated **route** `/assignments/:id` (full editing, markdown notes, links) — same shared form component |
| Notes | Markdown-lite, rendered via `react-markdown` + `remark-gfm` + `rehype-sanitize`; raw markdown stored |
| Links | Per-assignment URLs with **optional label**, multiple allowed → `assignment_links` table |
| First run | Auto-create "Default" class; friendly guided empty state |
| Testing | Backend pytest (auth + assignments + classes); frontend a few Vitest unit tests |
| Docker | Frontend = nginx serving static build + `/api` reverse proxy → backend; exposed on **8080**. Backend + DB internal only |

---

## Architecture overview

```
Browser ── :8080 ──► frontend (nginx:alpine)
                        │  /api/*  (reverse proxy, same-origin → cookies "just work")
                        ▼
                     backend (uvicorn :8000)   ── SQLAlchemy 2.0 async ──► db (postgres:18)
```

- **Same-origin** via nginx proxy ⇒ no CORS, no CSRF token ceremony (SameSite=Lax cookie). Keep it that way.
- Backend container runs `alembic upgrade head` before starting uvicorn (migrations run automatically on boot).
- Three services only: `frontend`, `backend`, `db`.

### Repository layout (monorepo)

```
plannerr/
├── docker-compose.yml
├── .env.example                  # compose + backend secrets
├── .gitignore
├── README.md                     # setup + dev instructions
├── backend/
│   ├── pyproject.toml            # uv project (moved from repo root)
│   ├── uv.lock
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py                # async engine
│   │   └── versions/0001_create_tables.py
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # app factory, lifespan, router mount
│   │   ├── config.py             # pydantic-settings (reads .env)
│   │   ├── db.py                 # async engine, session factory, get_db
│   │   ├── models.py             # SQLAlchemy 2.0 declarative models
│   │   ├── schemas.py            # Pydantic v2 schemas
│   │   ├── security.py           # argon2 + pepper, token gen, password rules
│   │   ├── deps.py               # get_current_user dependency
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── auth.py
│   │       ├── classes.py
│   │       └── assignments.py
│   └── tests/
│       ├── conftest.py
│       ├── test_auth.py
│       ├── test_classes.py
│       └── test_assignments.py
└── frontend/
    ├── package.json
    ├── vite.config.ts            # @tailwindcss/vite + /api dev proxy → :8000
    ├── tsconfig.json
    ├── index.html
    ├── Dockerfile                # node build → nginx:alpine (multi-stage)
    ├── nginx.conf
    ├── .dockerignore
    └── src/
        ├── main.tsx
        ├── App.tsx               # providers + router
        ├── index.css             # @import "tailwindcss"; @custom-variant dark; @theme tokens
        ├── lib/
        │   ├── api.ts            # typed fetch wrapper (credentials, errors)
        │   ├── queryClient.ts
        │   ├── types.ts          # mirrors backend schemas
        │   ├── dates.ts          # day grouping, date-only handling, formatting
        │   └── color.ts          # contrast/readability helpers for class hex
        ├── features/
        │   ├── auth/  (LoginPage, RegisterPage, AuthProvider, useAuth)
        │   ├── theme/ (ThemeProvider, useTheme)   # system + localStorage + .dark class
        │   ├── home/  (HomePage, AssignmentList, DayGroup, OverdueGroup, LoadMoreSentinel)
        │   ├── assignments/
        │   │   ├── AssignmentCard.tsx
        │   │   ├── AssignmentDialog.tsx     # quick-add + edit modal
        │   │   ├── AssignmentPage.tsx       # /assignments/:id (opens from dialog)
        │   │   ├── AssignmentForm.tsx       # SHARED by dialog + page
        │   │   ├── ProgressSlider.tsx       # Radix Slider, step 5, snaps; 100 ⇒ complete
        │   │   ├── AssignmentLinks.tsx      # url + optional label list/editor
        │   │   ├── NotesEditor.tsx          # textarea (markdown-lite)
        │   │   └── NotesView.tsx            # react-markdown render
        │   │   └── useAssignments.ts        # useInfiniteQuery
        │   └── classes/
        │       ├── ClassConfigPage.tsx
        │       ├── ClassForm.tsx            # name + color
        │       ├── ColorPicker.tsx          # swatches + <input type="color">
        │       ├── ClassDeleteDialog.tsx    # preview + transfer-or-delete
        │       └── useClasses.ts
        ├── components/            # small shared UI primitives (Button, Modal, Badge, EmptyState, Spinner, Switch)
        └── routes.tsx
```

**Cleanup:** the placeholder root `main.py`, `pyproject.toml`, `uv.lock`, `.python-version`, `.venv` are absorbed into `backend/` (delete stubs, `uv init --app backend`-style structure). Repo root becomes compose + docs only.

---

## Database schema (Postgres 18)

All `id` columns: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`. All timestamps `TIMESTAMPTZ`. All FKs `ON DELETE CASCADE`.

### `users`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| username | VARCHAR(32) NOT NULL | unique **case-insensitive** → `UNIQUE INDEX (LOWER(username))` |
| password_hash | TEXT NOT NULL | argon2id hash of `pepper + password` |
| created_at | TIMESTAMPTZ NOT NULL | `DEFAULT now()` |

### `sessions`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID NOT NULL → users.id | CASCADE |
| token_hash | TEXT NOT NULL | SHA-256 of random 32-byte token (never store raw token) |
| expires_at | TIMESTAMPTZ NOT NULL | 30 days |
| created_at | TIMESTAMPTZ NOT NULL | |

Unique index on `token_hash`; index on `user_id`. Periodic purge of expired sessions (simple `DELETE ... WHERE expires_at < now()` on login, or a lazy check).

### `classes`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID NOT NULL → users.id | CASCADE |
| name | VARCHAR(64) NOT NULL | editable; uniqueness on `(user_id, LOWER(name))` via functional unique index |
| color | CHAR(7) NOT NULL | hex `#RRGGBB`, validated `^#[0-9a-fA-F]{6}$` |
| created_at / updated_at | TIMESTAMPTZ | |

"Default" class auto-created in the same transaction as user signup.

### `assignments`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID NOT NULL → users.id | CASCADE (denormalized owner for easy scoping) |
| class_id | UUID NOT NULL → classes.id | CASCADE (class delete cascades, with confirm/transfer flow in UI) |
| title | VARCHAR(200) NOT NULL | |
| notes | TEXT NOT NULL DEFAULT '' | raw markdown |
| due_at | TIMESTAMPTZ NOT NULL | date-only assignments stored at 23:59:59 **in the user's browser-local zone, converted to UTC client-side** |
| progress | SMALLINT NOT NULL DEFAULT 0 | `CHECK (progress BETWEEN 0 AND 100)` **and** `CHECK (progress % 5 = 0)` |
| is_priority | BOOLEAN NOT NULL DEFAULT FALSE | |
| created_at / updated_at | TIMESTAMPTZ | |

Indexes: `(user_id, due_at, id)` for the home keyset query; partial index `(user_id, due_at, id) WHERE progress < 100` for the "hide completed" fast path.

**Derived, never stored:** `is_complete` (`progress == 100`). Client derives it from `progress`.

### `assignment_links`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| assignment_id | UUID NOT NULL → assignments.id | CASCADE |
| url | TEXT NOT NULL | validated `http(s)://` |
| label | VARCHAR(100) NULL | optional, e.g. "Canvas page" |
| position | SMALLINT NOT NULL DEFAULT 0 | display order |
| created_at | TIMESTAMPTZ | |

Index on `assignment_id`.

---

## Backend design

### Stack
- **FastAPI** + **Pydantic v2** + **SQLAlchemy 2.0 async** (declarative) + **Alembic** (async migrations) + **psycopg 3** async driver (`postgresql+psycopg://`) — SQLAlchemy's currently recommended async driver.
- **argon2-cffi** (`PasswordHasher`, argon2id defaults) — hash input is `PASSWORD_PEPPER + password`; pepper comes from `.env` (`PASSWORD_PEPPER`), never committed.
- **pydantic-settings** for config: `DATABASE_URL`, `PASSWORD_PEPPER`, `SESSION_TTL_DAYS=30`, `COOKIE_SECURE` (true in prod compose, false in dev), `COOKIE_NAME=plannerr_session`.
- **slowapi** (optional, cheap) rate-limit on `/auth/login` + `/auth/register` — note per-process in multi-worker, acceptable for v1.

### Auth flow
1. `POST /api/v1/auth/register` — validate username/password rules → create user + "Default" class → create session → `Set-Cookie`.
2. `POST /api/v1/auth/login` — lookup by `LOWER(username)`, verify argon2 → new session row → `Set-Cookie`.
3. `POST /api/v1/auth/logout` — delete session row + clear cookie.
4. `GET /api/v1/auth/me` — returns current user (drives app boot).
- Cookie: `HttpOnly; SameSite=Lax; Path=/; Secure` (prod) + `Max-Age=30d`. Token: `secrets.token_urlsafe(32)`; DB stores `sha256(token)`.
- `get_current_user` dependency: read cookie → hash → lookup session (join user) → check expiry. All data routes depend on it; every query additionally filters `user_id == current_user.id` (defense in depth).

### REST API (`/api/v1`)
| Method & path | Notes |
|---|---|
| POST `/auth/register` | `{username, password}` → user + cookie |
| POST `/auth/login` | `{username, password}` → user + cookie |
| POST `/auth/logout` | |
| GET `/auth/me` | |
| GET `/classes` | own classes, ordered by name |
| POST `/classes` | `{name, color}` |
| PATCH `/classes/{id}` | editable name/color |
| GET `/classes/{id}/delete-preview` | `{assignment_count, assignments:[{id,title,due_at,progress}]}` for confirm dialog |
| DELETE `/classes/{id}` | body/query `transfer_to_class_id?`; transfers those assignments, then deletes rest |
| GET `/assignments` | `?include_completed&cursor&limit` — see pagination |
| POST `/assignments` | full payload incl. `links[]` |
| GET `/assignments/{id}` | + nested class + links |
| PATCH `/assignments/{id}` | partial update, links replace-all-in-one payload |
| DELETE `/assignments/{id}` | |

Pydantic validation: title 1–200 chars, progress multiple of 5 in 0–100, color regex, url `AnyHttpUrl`, links max ~5, class must belong to the user (404 otherwise — never leak other users' existence).

### Home pagination (keyset / cursor)
- **No cursor** → return ALL assignments where `progress < 100 OR include_completed` **and** `due_at < now + 7 days` (overdue included automatically by `due_at < now`), ordered `due_at ASC, id ASC`. (Safety cap e.g. 500.)
- **With cursor** → `WHERE (due_at, id) < (cursor_due, cursor_id)` (keyset), same ordering, `LIMIT 25`, return `next_cursor` (`base64("due_at|id")`) or `null`.
- Response: `{items: [...], next_cursor: string|null}`.
- Completed assignments stay in the list at their date position; client styles them; "hide completed" toggle is a query param + UI state.

---

## Frontend design

### Stack
- **Vite** + **React 19** + **TypeScript** (strict) + **Tailwind v4** (`@tailwindcss/vite`).
- **react-router v7** (library mode), **@tanstack/react-query v5** (`useInfiniteQuery` for Home).
- **Radix UI primitives** (Dialog, Slider, Switch) for accessible behavior; styled by hand with Tailwind — clean look without a heavy kit.
- **react-hook-form + zod** for forms; **date-fns** for dates; **lucide-react** icons; **react-markdown + remark-gfm + rehype-sanitize** for notes.
- **ESLint (typescript-eslint flat config) + Prettier**, `tsc --noEmit` in CI-ish scripts.

### Dark mode (first-class, Tailwind v4)
1. `src/index.css`: `@import "tailwindcss";` then `@custom-variant dark (&:where(.dark, .dark *));` → `dark:` utilities become class-driven (system-preference default is overridden by this line — by design).
2. **Semantic tokens**: define CSS variables (light values) in `:root`, dark values in `.dark`, mapped into Tailwind via `@theme inline { --color-background: var(--bg); ... }`. Components use `bg-background`, `text-foreground`, `bg-surface`, `text-muted`, `border-border`, `bg-primary`, etc. — they flip automatically with one `.dark` class, no per-component `dark:` sprinkling.
3. **ThemeProvider**: `localStorage.theme ∈ {light, dark, system}` (default `system` via `matchMedia('(prefers-color-scheme: dark)')`); applies/removes `.dark` on `document.documentElement`; listens to system changes while in `system` mode; toggle in the app header. A tiny inline script in `index.html` applies the saved class pre-paint to avoid a flash (FOUC).

### Home page
- **Overdue group** (due < start of today, not complete) → **day groups** (Today, Tomorrow, …, sorted ASC) → load-more sentinel at bottom (IntersectionObserver → `fetchNextPage`).
- Each assignment card: class color badge, title, due time (or "All day" for date-only), priority indicator (⚑), progress bar + % text, complete style (strikethrough/dim + checkmark) when `progress == 100`. Toggle "show completed".
- **Quick-add modal** (`AssignmentDialog`) opens from a prominent "+" button; on submit → "Create & add another" (same class) / "Create & add another (same date)" / "Create & open" convenience actions, stored as UI-state booleans now (v1), with a `SettingsProvider` stub so future settings toggles wire in cleanly.
- Card click → full `AssignmentDialog` (edit) → "Open in page" link → `/assignments/:id` (shares `AssignmentForm`).

### Progress slider
- Radix Slider: `min=0 max=100 step=5`, custom value label shows actual %, live. At 100 the card/assignment flips to complete styling. Server enforces the same rule (Pydantic `multiple_of=5`).

### Class Configuration page
- List of classes: color swatch, name, assignment count; inline add/edit via `ClassForm` (name input + `ColorPicker`).
- **ColorPicker**: 8–10 predefined swatches + native `<input type="color">` wheel; both write the same hex value. Stored as hex string. Text contrast for badges computed at render from hex luminance (`lib/color.ts`) — no per-color contrast data in DB.
- **Delete flow**: opens `ClassDeleteDialog` → fetches `delete-preview` (lists affected assignments) → choice: "Transfer to [class select]" then delete, or "Delete all N assignments" → confirm → `DELETE /classes/{id}?transfer_to_class_id=...`.

### State/data layer
- `lib/api.ts`: thin typed `fetch` wrapper (same-origin, `credentials: 'include'`, JSON, normalized error objects).
- React Query keys: `['me']`, `['classes']`, `['assignments', {cursor, includeCompleted}]` (infinite). Optimistic updates for progress slider + priority toggle + hide/show completed where cheap.

---

## Docker + uv

### `backend/Dockerfile` (multi-stage, uv-native)
- Stage 1: `ghcr.io/astral-sh/uv:python3.14-slim` — copy `pyproject.toml` + `uv.lock`, `uv sync --frozen --no-dev --no-install-project`, copy app.
- Final: slim image, `uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`.

### `frontend/Dockerfile` (multi-stage)
- Stage 1: `node:22-alpine`, `npm ci`, `npm run build`.
- Stage 2: `nginx:alpine`, copy `dist/` + `nginx.conf`.

### `nginx.conf` essentials
- Serve static from `/usr/share/nginx/html`, SPA fallback to `index.html`.
- `location /api/ { proxy_pass http://backend:8000; }` (+ websocket not needed in v1).

### `docker-compose.yml`
```yaml
services:
  db:
    image: postgres:18
    environment: { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB }
    volumes: [pgdata:/var/lib/postgresql]   # Postgres 18 moved PGDATA under /var/lib/postgresql/18/docker
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"], interval: 5s, retries: 10 }
  backend:
    build: ./backend
    env_file: .env                          # DATABASE_URL, PASSWORD_PEPPER, COOKIE_SECURE=true
    environment: { DATABASE_URL: postgresql+psycopg://...@db:5432/plannerr }
    depends_on: { db: { condition: service_healthy } }
    expose: ["8000"]                        # internal only
  frontend:
    build: ./frontend
    ports: ["8080:80"]
    depends_on: [backend]
volumes: { pgdata: }
```
- Root `.env.example` documents `POSTGRES_*`, `DATABASE_URL`, `PASSWORD_PEPPER` (required secret), `COOKIE_SECURE`.
- **Local dev** (no Docker): `uv run uvicorn ... --reload` (backend, `DATABASE_URL` → local Postgres or `docker compose up db`), `npm run dev` (frontend, Vite proxies `/api` → `:8000`).

---

## Reuse / dependencies (curated, no duplication)

- **Backend:** FastAPI, SQLAlchemy 2.0 + psycopg3, Alembic, argon2-cffi, pydantic + pydantic-settings, slowapi. Dev/test: pytest, pytest-asyncio, httpx.
- **Frontend:** Vite, React 19, react-router, TanStack Query, Radix (Dialog/Slider/Switch), react-hook-form + zod, react-markdown + remark-gfm + rehype-sanitize, date-fns, lucide-react, Tailwind v4.
- One shared `AssignmentForm` (dialog + page), one `AssignmentCard`, one `ColorPicker` — no duplicated form/card logic.

---

## Steps (implementation checklist)

- [ ] **Repo restructure** — delete placeholder root `main.py`/`pyproject.toml`/`uv.lock`/`.python-version`; scaffold `backend/` with `uv init --app`; add `.gitignore`, `README.md`, `.env.example`.
- [ ] **Backend skeleton** — `pyproject.toml` deps; `config.py` (pydantic-settings); `db.py` (async engine/session); `main.py` app factory.
- [ ] **Models + migration** — `models.py` (users, sessions, classes, assignments, assignment_links as specced); Alembic async env; `0001_create_tables`.
- [ ] **Security + auth** — `security.py` (argon2 + pepper, token gen/hash, password policy); sessions; `routers/auth.py`; `deps.get_current_user`; register auto-creates "Default" class.
- [ ] **Classes API** — CRUD + `delete-preview` + transfer-on-delete; scoped to user; validation (hex, name, uniqueness).
- [ ] **Assignments API** — CRUD incl. nested `links[]`; cursor pagination; progress `% 5` validation; `include_completed` filter.
- [ ] **Backend tests** — pytest-asyncio against a test Postgres DB (alembic-upgraded); auth (register/login/logout/me/rate-limit), classes (CRUD, transfer/delete), assignments (CRUD, pagination, progress rules).
- [ ] **Frontend scaffold** — Vite + React + TS strict + Tailwind v4 (`@custom-variant dark`, semantic tokens, `@theme inline`); ESLint/Prettier; `lib/api.ts`, `lib/types.ts`.
- [ ] **Theme + auth UI** — ThemeProvider (+ anti-FOUC script), header toggle; Login/Register pages; AuthProvider + route guards; `/auth/me` boot.
- [ ] **Classes UI** — ClassConfigPage, ClassForm, ColorPicker (swatches + wheel), ClassDeleteDialog with transfer-or-delete.
- [ ] **Assignments UI** — HomePage (overdue group, day groups, infinite scroll sentinel, hide/show completed), AssignmentCard, ProgressSlider (step 5), AssignmentDialog (quick-add + edit + convenience buttons), AssignmentPage + shared AssignmentForm, NotesEditor/NotesView (markdown), AssignmentLinks.
- [ ] **Frontend tests** — Vitest: `dates.ts` grouping/date-only logic, `color.ts` contrast, progress snapping helper.
- [ ] **Docker** — backend Dockerfile (uv), frontend Dockerfile + nginx.conf, docker-compose.yml (3 services, healthcheck, volume), `.env.example`.
- [ ] **Polish + docs** — empty states, responsive/mobile pass, README (setup, dev, deploy, env vars), final end-to-end verification.

---

## Verification

1. `docker compose up --build` → open `http://localhost:8080`.
2. Register a new account → "Default" class auto-created, guided empty state visible.
3. Create classes with custom colors (swatch + wheel); verify badges show readable text in light **and** dark.
4. Create assignments (quick-add modal; test all three convenience actions), set due dates/times, add notes (markdown renders), add a labeled link, toggle priority.
5. Slide progress — verify it snaps to 5s, and at 100 the assignment flips to complete styling; toggle hide/show completed.
6. Home: overdue group at top, day groups in order, infinite scroll loads older items beyond the 7-day window; refresh keeps state.
7. Dark mode: toggle in header persists across reload (localStorage); with `system` it follows OS; no white flash on load.
8. Delete a class with assignments → dialog lists them → transfer to another class works; deleting without transfer cascades.
9. Logout → cookie cleared, protected routes redirect to login; expired/unknown session → 401 → redirect.
10. Backend: `uv run pytest` green. Frontend: `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` green.
11. Mobile pass: responsive layout, usable slider + modals on a narrow viewport.

---

## v2 ideas (architected for, not built now)

- **Settings page** — toggles for quick-add convenience buttons, default list window, "hide completed" default (backed by `SettingsProvider` stub).
- **Realtime markdown preview** — split-pane editor (NotesEditor already isolated; renderer is a separate component).
- Search/filter/sort, calendar view, drag-to-reorder, reminders/notifications, per-assignment subtasks.
- Account management (change password, delete account), password reset.
- Sharing/collaborative lists (requires new invite/sharing model — deliberately out of v1).
- Better CSRF hardening (double-submit token) and multi-worker rate limiting (Redis-backed) if we ever scale beyond one box.
