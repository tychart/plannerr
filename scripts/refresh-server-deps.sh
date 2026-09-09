#!/usr/bin/env bash
#
# Plannerr — refresh server Python dependencies within pyproject ranges.
#
# Unlike the web app (whose deps auto-update at image build), the server keeps
# uv.lock committed as the source of truth and freezes it in the image
# (`uv sync --frozen` in server/Containerfile). That split exists because
# server ranges are unbounded (`>=`) and the API holds auth + runs migrations
# against your real database at boot — silent dep drift is not acceptable.
#
# This script is the deliberate update ritual. Run it when you want newer
# dependencies (e.g. before a release), review the uv.lock diff, then commit:
#
#   scripts/refresh-server-deps.sh [--skip-tests]
#
# What it does:
#   1. `uv lock --upgrade`  — re-resolve the newest versions the ranges in
#      server/pyproject.toml allow (majors never change on their own).
#   2. `uv sync`            — install the new resolution into server/.venv.
#   3. tests                — `uv run pytest` (needs Postgres on :5432, e.g.
#      scripts/dev.sh; skipped with a warning if the db is down).
#   4. show the uv.lock diff stat so you can review before committing.
#
# After committing uv.lock, rebuild the image with a plain
# `podman-compose build server` — the install layer re-runs automatically
# because uv.lock is a COPY input to the build.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/server"

if [[ -t 1 ]]; then
  GRN=$'\e[32m'; YEL=$'\e[33m'; RED=$'\e[31m'; OFF=$'\e[0m'
else
  GRN=; YEL=; RED=; OFF=
fi
info() { printf '%s\n' "${GRN}==>${OFF} $*"; }
warn() { printf '%s\n' "${YEL}warning:${OFF} $*" >&2; }

skip_tests=0
if [[ "${1:-}" == "--skip-tests" ]]; then skip_tests=1; elif [[ -n "${1:-}" ]]; then
  printf '%s\n' "unknown argument '$1' — usage: scripts/refresh-server-deps.sh [--skip-tests]" >&2
  exit 1
fi

command -v uv >/dev/null 2>&1 || { printf '%s\n' "error: uv is required — https://docs.astral.sh/uv/" >&2; exit 1; }

info "re-resolving dependencies within pyproject.toml ranges (uv lock --upgrade)…"
uv lock --upgrade

if git diff --quiet -- uv.lock; then
  info "uv.lock unchanged — dependencies are already at the newest versions your ranges allow."
else
  echo
  info "uv.lock changed — review before committing:"
  git diff --stat -- uv.lock
fi

info "syncing server/.venv to the lockfile…"
uv sync

if ((skip_tests)); then
  info "skipping tests (--skip-tests)."
else
  if (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
    exec 3>&- 3<&- 2>/dev/null || true
    info "running tests: uv run pytest"
    uv run pytest || {
      printf '%s\n' "${RED}error:${OFF} tests failed — revert the lock with 'git checkout -- server/uv.lock'" >&2
      exit 1
    }
  else
    warn "no database on :5432 — skipping tests (start one: scripts/dev.sh, or podman-compose up db)."
  fi
fi

echo
info "done. Next steps:"
info "  1. review the uv.lock diff:  git diff server/uv.lock"
info "  2. commit it:                git add server/uv.lock && git commit"
info "  3. rebuild the image:        podman-compose build server   (no --no-cache needed —"
info "                                the lockfile change invalidates the install layer)"
