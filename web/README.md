# Plannerr web

React 19 + TypeScript (strict) + Vite + Tailwind CSS v4 SPA.

**Package manager:** bun is the primary workflow. Dependency policy matches
the rest of the stack: **`bun.lock` is committed** and the image builds it
frozen (`bun install --frozen-lockfile` in `Containerfile`). To update, add
with `bun add <pkg>` or refresh everything within the `^` ranges with
`scripts/refresh-web-deps.sh`, review the lock diff, and commit. npm works for
node users (`npm install` / `npm run …`) — it derives its own gitignored
`package-lock.json`, so it never touches the committed lock.

## Development

Run the whole app from the repo root with `scripts/dev.sh` (db + API + web),
or just this half:

```bash
bun install                # or: npm install
bun run dev                # http://localhost:5173, proxies /api → http://localhost:8000
```

> The dev server never registers the service worker (`devOptions.enabled:
> false`), so hot reload is free of PWA/offline caching — that only exists in
> production builds.

## Scripts

| Command          | npm equivalent  | What it does                    |
| ---------------- | --------------- | ------------------------------- |
| `bun run dev`    | `npm run dev`   | Vite dev server (hot reload)    |
| `bun run build`  | `npm run build` | `tsc -b` + production build     |
| `bun run lint`   | `npm run lint`  | oxlint                          |
| `bun run test`   | `npm run test`  | Vitest unit tests (lib helpers) |
| `bun run format` | `npm run format`| Prettier (write)                |

## Structure

- `src/lib/` — API client, shared types, date/color/progress helpers
- `src/features/` — auth, theme, home, assignments, classes (one folder per domain)
- `src/components/` — small shared UI primitives (Button, Modal, Switch, …)

Theming: `src/index.css` defines semantic tokens (light + dark) mapped into
Tailwind via `@theme inline`; the `dark` variant is class-based
(`@custom-variant dark`), so one `.dark` class on `<html>` flips the whole app.
