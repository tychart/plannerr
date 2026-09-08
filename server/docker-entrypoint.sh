#!/bin/sh
set -e

/app/.venv/bin/alembic upgrade head
exec "$@"
