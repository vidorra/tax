#!/bin/sh
# Start van de container: migraties tegen het databasebestand, daarna de server.
#
# De container start als root, alleen om de map van de database (de Persistent Directory /app/data) aan de
# gebruiker node te geven. Een volume van CapRover of een map op de host is meestal van root; zonder deze stap kan
# de app er niet in schrijven. Daarna draait alles als node, ook de migraties, zodat de bestanden van node blijven.
# Zonder root of zonder su-exec (buiten de container, zoals een proef met de uitgepakte deploy.tar) slaat het script
# die stap over en draait alles als de huidige gebruiker.
set -e
cd "$(dirname "$0")"

DB_PAD="${DATABASE_PATH:-/app/data/ibcalculator.db}"
DB_MAP="$(dirname "$DB_PAD")"

if [ "$(id -u)" = "0" ] && command -v su-exec >/dev/null 2>&1 && id node >/dev/null 2>&1; then
  mkdir -p "$DB_MAP"
  if [ "$DB_MAP" != "/" ]; then
    chown -R node:node "$DB_MAP"
  fi
  exec su-exec node "$0" "$@"
fi

echo "Starting ibcalculator..."
echo "Running database migrations..."
if ! ./node_modules/.bin/tsx scripts/migrate.ts; then
  echo "Migration failed; starting anyway so the public calculator stays up (the dossier reports the database error)."
fi
exec npm start
