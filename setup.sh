#!/usr/bin/env bash
# Plena LMS — ilk kurulum scripti (macOS arm64)
# Kullanım: ./setup.sh
# Idempotenttir: eksik olan adımları yapar, mevcut olanları atlar.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE_VERSION="22.14.0"
NODE_DIR="$ROOT/.tools/node"
PG_DIR="$ROOT/.tools/pg"
PGBIN="$PG_DIR/node_modules/@embedded-postgres/darwin-arm64/native/bin"
PGDATA="$PG_DIR/data"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
  echo "Bu script macOS (Apple Silicon) icindir. Diger platformlar icin README'ye bakin." >&2
  exit 1
fi

# 1) Node.js (gomulu kurulum)
if [ ! -x "$NODE_DIR/bin/node" ]; then
  step "Node.js v$NODE_VERSION indiriliyor (.tools/node)"
  mkdir -p "$ROOT/.tools"
  curl -fsSL -o "$ROOT/.tools/node.tar.gz" \
    "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-darwin-arm64.tar.gz"
  tar -xzf "$ROOT/.tools/node.tar.gz" -C "$ROOT/.tools"
  mv "$ROOT/.tools/node-v$NODE_VERSION-darwin-arm64" "$NODE_DIR"
  rm "$ROOT/.tools/node.tar.gz"
else
  step "Node.js zaten kurulu ($("$NODE_DIR/bin/node" --version))"
fi
export PATH="$NODE_DIR/bin:$PATH"

if ! command -v yarn >/dev/null 2>&1; then
  step "yarn etkinlestiriliyor (corepack)"
  corepack enable
fi

# 2) Gomulu PostgreSQL
if [ ! -x "$PGBIN/pg_ctl" ]; then
  step "Gomulu PostgreSQL indiriliyor (.tools/pg)"
  mkdir -p "$PG_DIR"
  (cd "$PG_DIR" && npm init -y >/dev/null && npm install --no-fund --no-audit @embedded-postgres/darwin-arm64)
else
  step "Gomulu PostgreSQL zaten kurulu"
fi

if [ ! -d "$PGDATA" ]; then
  step "Veritabani dizini olusturuluyor (initdb)"
  "$PGBIN/initdb" -D "$PGDATA" -U marti -A trust -E UTF8 >/dev/null
fi

# 3) Ortam dosyalari
if [ ! -f "$ROOT/backend/.env" ]; then
  step "backend/.env olusturuluyor"
  AUTH_SECRET="$(openssl rand -hex 32)"
  sed "s|^AUTH_SECRET=.*|AUTH_SECRET=\"$AUTH_SECRET\"|" \
    "$ROOT/backend/.env.example" > "$ROOT/backend/.env"
else
  step "backend/.env zaten mevcut"
fi

if [ ! -f "$ROOT/frontend/.env" ]; then
  step "frontend/.env olusturuluyor"
  cp "$ROOT/frontend/.env.example" "$ROOT/frontend/.env"
else
  step "frontend/.env zaten mevcut"
fi

# 4) Bagimliliklar
step "Backend bagimliliklari (npm install)"
(cd "$ROOT/backend" && npm install --no-fund --no-audit)

step "Frontend bagimliliklari (yarn install)"
(cd "$ROOT/frontend" && yarn install --silent 2>/dev/null || yarn install)

# 5) Veritabani semasi + demo veri
if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  step "PostgreSQL zaten calisiyor"
  STARTED_PG=0
else
  step "PostgreSQL baslatiliyor"
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PG_DIR/pg.log" start >/dev/null
  STARTED_PG=1
fi

step "Veritabani semasi ve demo veri yukleniyor (db:setup)"
(cd "$ROOT/backend" && npm run db:setup)

if [ "$STARTED_PG" = "1" ]; then
  "$PGBIN/pg_ctl" -D "$PGDATA" stop >/dev/null
fi

step "Kurulum tamamlandi"
echo
echo "Baslatmak icin : ./start-local.sh"
echo "Arayuz         : http://localhost:3000"
echo "Admin girisi   : admin@marti.demo / Admin123!"
echo "Calisan girisi : kaptan1@marti.demo / Kaptan123!"
