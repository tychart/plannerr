# Plannerr — agent guide

Self-hostable schoolwork planner: track assignments, quizzes & exams per class
(progress sliders, markdown notes, links), light/dark PWA with offline caching,
and optional LLM-written daily push summaries.

Monorepo: `web/` (React SPA) + `server/` (FastAPI) + Postgres 18 in compose.
Compose file is `compose.yml`; images are built from `web/Containerfile` and
`server/Containerfile` (engine-neutral names — see README "Docker vs. Podman");
`compose.dev.yml` is a dev-only overlay that opens the db on `127.0.0.1:5432` for
host-side dev/tests — a plain `docker compose up` (production) never publishes a db port.
Product docs live in `README.md`; design/plan records in `plans/` (read the
newest `*-approved.md` before large changes). This file is the working guide
for code changes — keep it current.

## Stack

| Layer    | Tech |
| -------- | ---- |
| `web/`   | React 19, TypeScript (strict), Vite 8, Tailwind CSS v4 (class-based dark), react-router v8, TanStack Query v5, Radix UI, lucide-react, date-fns, react-markdown, vite-plugin-pwa (Workbox) |
| `server/`| Python 3.14, FastAPI, SQLAlchemy 2 async + Alembic + psycopg 3, pydantic-settings, argon2-cffi, slowapi, APScheduler, pywebpush, httpx (`uv`-managed) |
| Deploy   | `docker compose` — web (nginx serves SPA + same-origin `/api` proxy), server, db |

## Commands

### Local dev — full stack, one terminal
`scripts/dev.sh` starts the db container (detached, `127.0.0.1:5432`), applies
Alembic migrations, then runs uvicorn (:8000, --reload) + the Vite dev server
(:5173) in the background and follows their logs — Ctrl-C stops the dev servers,
the db keeps running. Subcommands: `logs | stop | down | status`. Skips via
`DEV_NO_DB|DEV_NO_SERVER|DEV_NO_WEB=1`; web runner is **bun** when present else
npm (`PM=bun|npm` to force). Logs in `.dev-logs/`.

### Web (`cd web`; **bun primary**, `npm run …` works too for node users)
- `bun run dev` — Vite on :5173; proxies `/api` → http://localhost:8000 (**API must run on 8000**)
- `bun run build` — `tsc -b && vite build` (run before declaring a change done)
- `bun run lint` — oxlint (rules in `.oxlintrc.json`)
- `bun run format` (prettier --write .) / `bun run format:check` — Prettier: `printWidth: 100`, semicolons, double quotes, trailing commas
- `bun run test` — Vitest, pure unit tests only (see Tests)
- Dependency changes: `bun add <pkg>` to add (updates package.json + bun.lock) or `scripts/refresh-web-deps.sh` to refresh everything within the `^` ranges — review the `bun.lock` diff, commit. `bun.lock` is the committed lockfile (image builds it frozen); `package-lock.json` is gitignored (npm fallback only)

### Server (`cd server`, Python 3.14 via `uv`)
- `uv sync` — install dependencies
- `uv run alembic upgrade head` — apply migrations (server also does this on boot in compose)
- `uv run uvicorn app.main:app --reload --port 8000` — API for local web dev
- `uv run pytest` — needs a reachable Postgres (see Tests)
- `scripts/refresh-server-deps.sh` — deliberate dep-update ritual: re-resolves within `pyproject.toml` ranges, syncs `.venv`, runs tests, shows the `uv.lock` diff. Both apps commit their lockfile and build images frozen; server ranges are unbounded `>=` (vs web's `^`) and it runs migrations on boot, so its ritual matters more

### Local data & full stack
- `docker compose up db` — Postgres, private to the compose network (prod posture: no host port)
- `docker compose -f compose.yml -f compose.dev.yml up db` — the dev/tests variant:
  publishes on 127.0.0.1:5432 (loopback only), creates `plannerr` + `plannerr_test`
- `docker compose up --build` — full stack at http://localhost:8080
  (Podman: `podman-compose up --build`; same files — scripts/dev.sh adds the overlay for you)
- Only the dev overlay publishes 5432, loopback only: the compose `server` ignores the mapping
  and reaches the db via the internal network; host uvicorn/pytest need `compose.dev.yml`

## Layout

```
web/src/
  lib/          api client, types, items, dates, color, progress, push, backup, cn; tests colocated (*.test.ts)
  features/     one folder per domain: auth, theme, home, items, classes, settings, notifications
                (assignments/ is an empty leftover — item UI lives in items/)
  components/   AppShell (header + shell), MobileNavMenu (mobile sheet), nav.ts, OfflineBanner,
                ClassBadge, EmptyState; ui/ reusable primitives: Button, Modal, Field, Input,
                Select, Switch, Spinner
  App.tsx       react-router v8: AppShell (auth-gated) wraps all pages; /assignments|quizzes|exams/:id
                are lazy detail routes (react-markdown stays out of the main chunk)
  index.css     Tailwind v4 entry: semantic tokens, class-based dark variant, custom @keyframes

server/app/
  routers/      auth, classes, items, data, notifications — mounted under /api/v1
  models.py     ONE Item model with a kind column ('assignment' | 'quiz' | 'exam'); Class; User;
                sessions; notification schedules — do not fork per kind
  services/     summary.py (LLM or deterministic fallback), schedule.py (daily sends), backup.py
  config.py     pydantic-settings (env / .env); alembic/ holds async migrations
```

## Conventions

### Theming & styling (Tailwind v4)
- Dark mode is class-based: `.dark` on `<html>` flips semantic tokens defined in `index.css`
  (`--background`, `--foreground`, `--surface(-2)`, `--muted`, `--border`, `--primary(-soft|-foreground)`,
  `--danger(-soft)`, `--success`, `--warning`, `--ring`), mapped via `@theme inline`.
- **Never put raw hex/oklch colors in components** — always use tokens (`bg-background`, `text-muted`, …).
- Custom animations: declare `--animate-*` tokens + nested `@keyframes` in an `@theme` block in `index.css`
  (see `--animate-sheet-in/out`, `--animate-overlay-in/out` used by the mobile nav sheet).

### Navigation & mobile
- Nav destinations are defined **once** in `components/nav.ts` (`NAV_ITEMS`). AppShell renders them inline
  at `md+`; `MobileNavMenu` (Radix Dialog right-side sheet) renders them below `md`. Add new top-level
  pages only there.
- Tailwind `md:` = 48rem = 768px. When JS needs the breakpoint, mirror it:
  `matchMedia("(min-width: 48rem)")` — see `MD_QUERY` in `MobileNavMenu` (keeps the sheet from getting
  stuck open across a resize).
- PWA/iOS: `viewport-fit=cover`; clear the notch/gesture bar with `env(safe-area-inset-top|bottom)`
  padding (AppShell and the sheet both do this).

### Components & accessibility
- Feature UI in `features/<domain>/`; only genuinely reusable pieces in `components/`.
- Buttons go through `components/ui/Button` (`variant`: primary|secondary|ghost|danger; `size`: sm|md|lg)
  rather than raw `<button>`.
- Use Radix primitives for dialog/modal/sheet/switch/slider/select — focus trap, scroll lock, Esc
  dismissal and focus restore come for free.
- `aria-label` on icon-only controls; decorative icons get `aria-hidden`; focus-visible rings use `ring-ring`.
- Conditional classes go through `cn()` (clsx + tailwind-merge); twMerge resolves conflicts, so put
  override utilities last.

### TypeScript / React
- Strict + `verbatimModuleSyntax` + `erasableSyntaxOnly`: use `import type`, no enums/namespaces/param
  properties. oxlint enforces rules-of-hooks.
- Server state goes through TanStack Query (single `queryClient` in `lib/`); features own their hooks
  (`useItems`, `useClasses`, `useAuth`, `useTheme`).

### Server & data
- Assignments/quizzes/exams share one `items` table + one router — never introduce a per-kind table.
- Config is pydantic-settings from env or `server/.env` (copy `../.env.example`). Gotcha: exported shell
  env vars **override** `.env` — `unset` stale ones when debugging DB/URL issues.
- Schema changes are additive Alembic migrations; the compose server applies them on boot.

### PWA / offline
- Installability is a feature, not an afterthought: keep vite-plugin-pwa (injectManifest) healthy; the SW
  precaches the app shell and caches `GET /api/*` network-first (7-day). Real devices need HTTPS for SW +
  push; set `COOKIE_SECURE=true` behind TLS.

## Tests

- **Web** — Vitest unit tests in `lib/` (dates, color contrast, progress snapping, item grouping, backup
  merge, push payload). No DOM/testing-library setup exists: keep logic extractable to `lib/` and verify
  UI/visual changes manually or via a headless browser.
- **Server** — pytest + pytest-asyncio against `plannerr_test`; start the DB with `docker compose -f compose.yml -f compose.dev.yml up db` (Podman: `podman-compose -f compose.yml -f compose.dev.yml up db`).

## Definition of done

Web change: `bun run format && bun run lint && bun run test && bun run build` (npm equivalents fine) all green, PWA build intact.
Server change: `uv run pytest` green against a fresh migration.
