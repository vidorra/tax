#!/bin/sh
set -e
echo "Starting ibcalculator..."
if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  npx tsx scripts/migrate.ts || echo "Migration failed; continuing so the public calculator stays up"
fi
exec npm start
