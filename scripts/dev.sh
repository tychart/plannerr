#!/usr/bin/env bash
#
# Plannerr — one-command local dev environment.
#
# Brings up the full stack from one terminal, no image builds, all hot reload:
#   db      Postgres 18 in a detached container (long-lived across sessions)
#   server  FastAPI  on http://localhost:8000  (uvicorn --reload, server/.env)
#   web     Vite    on http://localhost:5173  (HMR, /api proxied to :8000)
#
#   The web dev server runs under bun when available (preferred), otherwise
#   npm — both execute the same local `vite` from package.json scripts.
#
# Usage:
#   scripts/dev.sh [start]   start db + server + web, then follow the logs.
#                            Ctrl-C stops server + web; the db keeps running.
#   scripts/dev.sh logs      tail server/web logs without starting anything
#   scripts/dev.sh stop      stop server + web processes started here (db stays up)
#   scripts/dev.sh down      stop server + web and the db container
#   scripts/dev.sh status    show what is up
#   scripts/dev.sh help
#
# Log streams are color-coded while following on a terminal:
#   db (blue) · server/API (green) · web/Vite (magenta) — set NO_COLOR=1 to
#   disable. When the db is compose-managed its container logs are mirrored
#   to .dev-logs/db.log so they join the follower too.
#
# Skips / tweaks (export before running):
#   DEV_NO_DB=1 | DEV_NO_SERVER=1 | DEV_NO_WEB=1   skip that piece
#   PM=bun | PM=npm                                force the web package manager
#   COMPOSE_CMD="docker compose"                   compose binary (default: podman-compose)
#   DEV_NO_FOLLOW=1                                don't tail logs after starting
#   NO_COLOR=1                                     disable ANSI colors entirely
#
# Notes:
#   * Missing .env / server/.env are seeded from .env.example with throwaway
#     local credentials (both are gitignored — safe for local dev only).
#   * Keep .env (read by compose for the db) and server/.env (read by the
#     local API) in sync if you change the DB password.
#   * Exported env vars override .env for the API (pydantic-settings). If the
#     server can't reach the DB, check for stale exports: `unset DATABASE_URL`.
#   * Logs live in .dev-logs/ (gitignored).
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/.dev-logs"
SERVER_LOG="$LOG_DIR/server.log"
WEB_LOG="$LOG_DIR/web.log"
DB_LOG="$LOG_DIR/db.log"            # mirror of the db container's logs
DB_MIRROR_PID="$LOG_DIR/db-mirror.pid"
PID_FILE="$LOG_DIR/dev.pids"

# --- colors (only when stdout is a terminal and NO_COLOR is unset) ----------
if [[ -t 1 && -z ${NO_COLOR:-} ]]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; GRN=$'\e[32m'; YEL=$'\e[33m'; RED=$'\e[31m'; OFF=$'\e[0m'
  C_DB=$'\e[1;34m'     # database log stream
  C_SERVER=$'\e[1;32m' # API server log stream
  C_WEB=$'\e[1;35m'    # web / Vite log stream
else
  BOLD=; DIM=; GRN=; YEL=; RED=; OFF=; C_DB=; C_SERVER=; C_WEB=
fi
info() { printf '%s\n' "${GRN}==>${OFF} $*"; }
warn() { printf '%s\n' "${YEL}warning:${OFF} $*" >&2; }
die() { printf '%s\n' "${RED}error:${OFF} $*" >&2; exit 1; }

# --- discovery ---------------------------------------------------------------
detect_pm() {
  if [[ -n "${PM:-}" ]]; then
    case "$PM" in bun|npm) return 0 ;; *) die "PM must be 'bun' or 'npm' (got '$PM')" ;; esac
  fi
  if command -v bun >/dev/null 2>&1; then PM=bun; else PM=npm; fi
}
detect_compose() {
  [[ -n "${COMPOSE_CMD:-}" ]] && return 0
  if command -v podman-compose >/dev/null 2>&1; then COMPOSE_CMD=podman-compose; return 0; fi
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
    return 0
  fi
  return 1
}
run_compose() { # word-split COMPOSE_CMD on purpose (may be "docker compose")
  # shellcheck disable=SC2086
  $COMPOSE_CMD "$@"
}

# --- helpers -----------------------------------------------------------------
port_open() { # $1 host $2 port
  (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null && { exec 3>&- 3<&- 2>/dev/null || true; return 0; }
  return 1
}
wait_for_port() { # $1 host $2 port $3 tries $4 label ; returns 1 on timeout
  local host=$1 port=$2 tries=$3 label=$4 i
  for ((i = 0; i < tries; i++)); do
    port_open "$host" "$port" && { info "$label is up on $host:$port"; return 0; }
    sleep 1
  done
  warn "$label not reachable on $host:$port after ${tries}s"
  return 1
}

ensure_env_files() {
  if [[ ! -f .env && -f .env.example ]]; then
    cp .env.example .env
    info "seeded .env from .env.example (throwaway local credentials, gitignored)."
  fi
  if [[ ! -f server/.env && -f .env.example ]]; then
    cp .env.example server/.env
    info "seeded server/.env from .env.example (throwaway local credentials, gitignored)."
  fi
}

# --- pieces ------------------------------------------------------------------
start_db() {
  [[ ${DEV_NO_DB:-0} == 1 ]] && { info "skipping db (DEV_NO_DB=1)"; return 0; }
  if port_open 127.0.0.1 5432; then
    info "Postgres already up on :5432 — reusing it."
    return 0
  fi
  detect_compose || die "no podman-compose / docker found — start Postgres yourself and export DEV_NO_DB=1"
  info "starting database container: $COMPOSE_CMD up -d db"
  run_compose up -d db
  if wait_for_port 127.0.0.1 5432 20 "database"; then return 0; fi
  # A pre-existing container (e.g. from before compose.yml published :5432)
  # won't be reconfigured by a plain `up -d` — recreate it once.
  info "db container not publishing :5432 — recreating it to apply the port mapping"
  run_compose up -d --force-recreate db
  wait_for_port 127.0.0.1 5432 45 "database" || die "database container is up but :5432 is unreachable"
}

migrate() {
  [[ ${DEV_NO_SERVER:-0} == 1 ]] && return 0
  command -v uv >/dev/null 2>&1 || return 0 # server start will explain if uv is missing
  port_open 127.0.0.1 5432 || { warn "no database on :5432 — skipping migrations"; return 0; }
  info "applying migrations: uv run alembic upgrade head"
  (cd server && uv run alembic upgrade head)
}

start_server() {
  [[ ${DEV_NO_SERVER:-0} == 1 ]] && { info "skipping server (DEV_NO_SERVER=1)"; return 0; }
  if port_open 127.0.0.1 8000; then
    warn "something already listens on :8000 — leaving it alone (DEV_NO_SERVER=1 to silence)."
    return 0
  fi
  command -v uv >/dev/null 2>&1 \
    || die "uv is required for the API (manages server/.venv) — https://docs.astral.sh/uv/"
  info "starting API on http://localhost:8000 → log: .dev-logs/server.log"
  (cd server && exec uv run uvicorn app.main:app --reload --port 8000) >"$SERVER_LOG" 2>&1 &
  pids+=("$!")
}

start_web() {
  [[ ${DEV_NO_WEB:-0} == 1 ]] && { info "skipping web (DEV_NO_WEB=1)"; return 0; }
  if port_open 127.0.0.1 5173; then
    warn "something already listens on :5173 — leaving it alone (DEV_NO_WEB=1 to silence)."
    return 0
  fi
  detect_pm
  if [[ ! -x web/node_modules/.bin/vite ]]; then
    info "web dependencies missing — running '$PM install' (one-time)…"
    (cd web && "$PM" install)
  fi
  info "starting web on http://localhost:5173 ($PM run dev) → log: .dev-logs/web.log"
  (cd web && exec "$PM" run dev) >"$WEB_LOG" 2>&1 &
  pids+=("$!")
}

# --- colored log following ----------------------------------------------------
container_engine() {
  # Underlying engine binary (podman/docker) for the chosen compose command.
  detect_compose 2>/dev/null || return 1
  local e
  e="${COMPOSE_CMD%% *}"
  case "$e" in
    podman-compose) printf 'podman' ;;
    docker-compose) printf 'docker' ;;
    *) printf '%s' "$e" ;;
  esac
}

db_container_id() {
  # Id of the running compose db container (empty if not running/compose-managed).
  # podman-compose lacks `ps -q db`, so match on the compose labels both
  # engines attach (com.docker.compose.project / .service).
  local engine project
  engine="$(container_engine)" || return 0
  project="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT")}"
  "$engine" ps \
    --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.service=db" \
    --format '{{.ID}}' 2>/dev/null | head -n1
}

start_db_log_mirror() {
  # Mirror the db container's logs into $DB_LOG so they join the follower.
  if [[ ${DEV_NO_DB:-0} == 1 ]]; then
    rm -f "$DB_LOG" # not compose-managed here — drop any stale stream
    return 0
  fi
  if [[ -s $DB_MIRROR_PID ]] && kill -0 "$(<$DB_MIRROR_PID)" 2>/dev/null; then
    return 0 # already mirroring
  fi
  local engine cid
  engine="$(container_engine)" || { info "no compose tool — db log stream skipped."; return 0; }
  cid="$(db_container_id)"
  if [[ -z "$cid" ]]; then
    rm -f "$DB_LOG" # container not running — drop any stale stream
    info "no compose-managed db container — db log stream skipped."
    return 0
  fi
  : >"$DB_LOG"
  ( "$engine" logs --tail 100 -f "$cid" ) >"$DB_LOG" 2>&1 &
  echo "$!" >"$DB_MIRROR_PID"
  info "mirroring db container logs → .dev-logs/db.log"
}

stop_db_log_mirror() {
  [[ -s $DB_MIRROR_PID ]] || return 0
  local pid
  pid="$(<$DB_MIRROR_PID)"
  rm -f "$DB_MIRROR_PID"
  kill -TERM "$pid" 2>/dev/null || true
}

# Reads `tail -F` multi-file output and colorizes each stream. GNU tail emits
# a "==> <file> <==" header whenever it switches files, which tells us which
# service the following lines belong to.
_stream_reader() {
  local line file tag color
  while IFS= read -r line; do
    if [[ $line == "==> "*" <==" ]]; then
      file=${line#"==> "}
      file=${file%" <=="}
      case "$file" in
        */server.log) tag=server; color=$C_SERVER ;;
        */web.log) tag=web; color=$C_WEB ;;
        */db.log) tag=db; color=$C_DB ;;
        *) tag=; color= ;;
      esac
      if [[ -n $tag ]]; then
        printf '%s\n' "${color}${DIM}──── ${tag} ────${OFF}"
      else
        printf '%s\n' "$line"
      fi
      continue
    fi
    if [[ -n $tag ]]; then
      printf '%s\n' "${color}[${tag}] ${line}${OFF}"
    else
      printf '%s\n' "$line"
    fi
  done
}

follow() {
  # Tail server/web (and db when mirrored) logs — color-coded per stream on a
  # terminal, plain multi-file tail otherwise.
  local logs=("$SERVER_LOG" "$WEB_LOG")
  [[ -f $DB_LOG ]] && logs+=("$DB_LOG")
  if [[ -n $GRN ]]; then
    tail -n +1 -F "${logs[@]}" | _stream_reader
  else
    tail -n +1 -F "${logs[@]}"
  fi
}

# --- lifecycle ----------------------------------------------------------------
pids=()
cleanup() {
  trap - INT TERM EXIT
  local p
  for p in "${pids[@]:-}"; do kill -TERM "$p" 2>/dev/null || true; done
  stop_db_log_mirror
  rm -f "$PID_FILE"
  wait 2>/dev/null || true
}

start() {
  mkdir -p "$LOG_DIR"
  ensure_env_files
  start_db
  migrate
  start_server
  start_web

  if ((${#pids[@]} == 0)); then
    info "nothing started — run 'scripts/dev.sh status' to see what is up."
    exit 0
  fi
  printf '%s\n' "${pids[@]}" >"$PID_FILE"

  if [[ ! -t 1 || ${DEV_NO_FOLLOW:-0} == 1 ]]; then
    info "started in the background (no TTY or DEV_NO_FOLLOW=1). Logs:"
    printf '    server  %s\n    web     %s\n' "$SERVER_LOG" "$WEB_LOG"
    info "stop it later with: scripts/dev.sh stop"
    return 0
  fi

  trap cleanup INT TERM EXIT
  start_db_log_mirror
  info "following logs — Ctrl-C stops server + web (the db container keeps running)."
  if [[ -n $GRN ]]; then
    info "stream colors: ${C_DB}db${OFF}  ${C_SERVER}server${OFF}  ${C_WEB}web${OFF}  (NO_COLOR=1 disables)"
  fi
  info "other commands: scripts/dev.sh {logs,stop,down,status}"
  follow
}

stop_dev() {
  stop_db_log_mirror
  if [[ ! -f $PID_FILE ]]; then
    info "no tracked dev processes (no $PID_FILE)."
    warn "if something still listens on :8000/:5173, kill it manually (pgrep -af 'uvicorn|vite')."
    return 0
  fi
  local pid alive=()
  while read -r pid; do [[ -n "$pid" ]] && alive+=("$pid"); done <"$PID_FILE"
  rm -f "$PID_FILE"
  ((${#alive[@]} == 0)) && return 0

  info "stopping tracked processes: ${alive[*]}"
  for pid in "${alive[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  sleep 2
  for pid in "${alive[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      warn "pid $pid still alive — sending SIGKILL"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  info "stopped. (If a stray uvicorn/vite remains: pgrep -af 'uvicorn|vite')"
}

down() {
  stop_dev
  if detect_compose; then
    info "stopping the database container: $COMPOSE_CMD down"
    run_compose down || warn "compose down failed (was the db running?)"
    info "done — data stays in the pgdata volume for next time."
  fi
}

status() {
  local w a d
  port_open 127.0.0.1 5173 && w=up || w=down
  port_open 127.0.0.1 8000 && a=up || a=down
  port_open 127.0.0.1 5432 && d=up || d=down
  printf '%-9s %s   %-8s %s   %-8s %s\n' 'web :5173' "$w" 'api :8000' "$a" 'db :5432' "$d"
  if detect_compose; then
    echo
    info "compose:"
    run_compose ps 2>&1 || true
  else
    warn "no compose tool found to show containers."
  fi
}

logs() {
  mkdir -p "$LOG_DIR"
  if [[ ! -f $SERVER_LOG && ! -f $WEB_LOG ]]; then
    die "no logs yet — run 'scripts/dev.sh start' first"
  fi
  if [[ -n $GRN ]]; then
    info "tailing logs — Ctrl-C to stop"
    start_db_log_mirror
    follow
  else
    info "not a terminal — showing the last lines of each log (use 'start' for live follow):"
    for f in "$SERVER_LOG" "$WEB_LOG" "$DB_LOG"; do
      [[ -f $f ]] || continue
      echo "── $f ──"
      tail -n 40 "$f"
    done
  fi
}

usage() {
  # Print the leading #-comment block (the header) of this file.
  awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
  exit 0
}

# --- dispatch -----------------------------------------------------------------
case "${1:-start}" in
  start | up) start ;;
  stop) stop_dev ;;
  down) down ;;
  status) status ;;
  logs) logs ;;
  help | -h | --help) usage ;;
  *) die "unknown command '$1' — try 'scripts/dev.sh help'" ;;
esac
