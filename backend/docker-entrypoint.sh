#!/bin/sh
set -e
echo "Waiting for database and applying migrations..."
npx prisma migrate deploy
if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding demo data..."
  npx tsx prisma/seed.ts || echo "Seed skipped or already applied"
fi
exec npx next start -H 0.0.0.0 -p 3000
