#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="$ROOT/.tools/node/bin:$ROOT/.tools/mongodb/bin:$PATH"

mkdir -p "$ROOT/.tools/mongo-data" "$ROOT/.tools/mongo-logs"

if ! pgrep -x mongod >/dev/null; then
  mongod --dbpath "$ROOT/.tools/mongo-data" --port 27017 --bind_ip 127.0.0.1 \
    --logpath "$ROOT/.tools/mongo-logs/mongod.log" --fork
  echo "MongoDB started on :27017"
else
  echo "MongoDB already running"
fi

echo "Starting backend on :8000 ..."
(
  cd "$ROOT/backend"
  # shellcheck disable=SC1091
  source .venv/bin/activate
  uvicorn server:app --host 0.0.0.0 --port 8000 --reload
) &

echo "Starting frontend on :3000 ..."
(
  cd "$ROOT/frontend"
  BROWSER=none yarn start
) &

wait
