#!/usr/bin/env bash
#
# Plannerr — refresh web dependencies within package.json ranges.
#
# bun.lock is committed and the web image builds it frozen
# (`bun install --frozen-lockfile` in web/Containerfile), so dependency
# updates land deliberately rather than silently at rebuild time. This script
# is that ritual — the web counterpart of scripts/refresh-server-deps.sh:
#
#   scripts/refresh-web-deps.sh [--skip-tests]
#
# What it does:
#   1. `bun update`     — re-resolve the newest versions the ^ ranges in
#      web/package.json allow (majors never change on their own). To add a
#      dependency use `bun add <pkg>` instead, which updates both files.
#   2. tests            — `bun run test` (Vitest unit tests, no services
#      needed); skipped with --skip-tests.
#   3. show the bun.lock diff stat so you can review before committing.
#
# After committing bun.lock, rebuild the image with a plain
# `podman-compose build web` — the install layer re-runs automatically
# because bun.lock is a COPY input to the build.
#
# Requires bun (the repo's package manager; npm is only a fallback for
# contributors and never maintains the committed lock).
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/web"

if [[ -t 1 ]]; then
  GRN=$'\e[32m'; YEL=$'\e[33m'; RED=$'\e[31m'; OFF=$'\e[0m'
else
  GRN=; YEL=; RED=; OFF=
fi
info() { printf '%s\n' "${GRN}==>${OFF} $*"; }

skip_tests=0
if [[ "${1:-}" == "--skip-tests" ]]; then skip_tests=1; elif [[ -n "${1:-}" ]]; then
  printf '%s\n' "unknown argument '$1' — usage: scripts/refresh-web-deps.sh [--skip-tests]" >&2
  exit 1
fi

command -v bun >/dev/null 2>&1 || {
  printf '%s\n' "error: bun is required to maintain the committed lockfile — https://bun.sh/docs/installation" >&2
  exit 1
}

info "re-resolving dependencies within package.json ranges (bun update)…"
bun update

if git diff --quiet -- web/bun.lock; then
  info "bun.lock unchanged — dependencies are already at the newest versions your ranges allow."
else
  echo
  info "bun.lock changed — review before committing:"
  git diff --stat -- web/bun.lock
fi

if ((skip_tests)); then
  info "skipping tests (--skip-tests)."
else
  info "running tests: bun run test"
  bun run test || {
    printf '%s\n' "${RED}error:${OFF} tests failed — revert the lock with 'git checkout -- web/bun.lock'" >&2
    exit 1
  }
fi

echo
info "done. Next steps:"
info "  1. review the bun.lock diff:  git diff web/bun.lock"
info "  2. commit it:                 git add web/bun.lock && git commit"
info "  3. rebuild the image:         podman-compose build web   (no --no-cache needed —"
info "                                 the lockfile change invalidates the install layer)"
