#!/bin/sh
set -e

case "$1" in
  serve|"")
    exec python -m granian \
      --interface asgi \
      --host 0.0.0.0 \
      --port "${PORT:-8000}" \
      --workers "${WORKERS:-4}" \
      src.backend.app:app
    ;;
  diff)
    shift
    exec python -m src.cli diff "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
