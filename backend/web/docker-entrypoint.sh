#!/bin/sh
set -e
echo "Waiting for database and applying schema..."
npx prisma db push --skip-generate
if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding demo data..."
  npx tsx prisma/seed.ts || echo "Seed skipped or already applied"
fi
exec npx next start -H 0.0.0.0 -p 3000
