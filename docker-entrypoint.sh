#!/bin/sh
set -e

DB_PATH="${DB_PATH:-/app/data/skybook.db}"

# On first run, seed the database from the bundled copy
if [ ! -f "$DB_PATH" ]; then
  echo "🗄️  First run detected — seeding database..."
  if [ -f "/app/src/backend/skybook.db" ]; then
    cp /app/src/backend/skybook.db "$DB_PATH"
    echo "✅ Database seeded from bundled copy."
  else
    echo "⚠️  No seed database found — a fresh empty DB will be created by the app."
  fi
fi

exec "$@"
