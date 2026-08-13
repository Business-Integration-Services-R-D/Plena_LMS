#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="$ROOT/.tools/node/bin:$PATH"

PGBIN="$ROOT/edu_module/.tools/pg/node_modules/@embedded-postgres/darwin-arm64/native/bin"
PGDATA="$ROOT/edu_module/.tools/pg/data"

if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  echo "PostgreSQL zaten calisiyor (:5432)"
else
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$ROOT/edu_module/.tools/pg/pg.log" start
  echo "PostgreSQL basladi (:5432)"
fi

echo "API basliyor (:3001) ..."
(
  cd "$ROOT/edu_module/apps/web"
  npm run dev -- -p 3001
) &

echo "Arayuz basliyor (:3000) ..."
(
  cd "$ROOT/frontend"
  BROWSER=none yarn start
) &

wait
