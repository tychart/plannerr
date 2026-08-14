# Plannerr web

React 19 + TypeScript (strict) + Vite + Tailwind CSS v4 SPA.

## Development

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api → http://localhost:8000
```

## Scripts

| Command            | What it does                    |
| ------------------ | ------------------------------- |
| `npm run dev`      | Vite dev server (hot reload)    |
| `npm run build`    | `tsc -b` + production build     |
| `npm run lint`     | oxlint                          |
| `npm run test`     | Vitest unit tests (lib helpers) |
| `npm run format`   | Prettier (write)                |

## Structure

- `src/lib/` — API client, shared types, date/color/progress helpers
- `src/features/` — auth, theme, home, assignments, classes (one folder per domain)
- `src/components/` — small shared UI primitives (Button, Modal, Switch, …)

Theming: `src/index.css` defines semantic tokens (light + dark) mapped into
Tailwind via `@theme inline`; the `dark` variant is class-based
(`@custom-variant dark`), so one `.dark` class on `<html>` flips the whole app.
