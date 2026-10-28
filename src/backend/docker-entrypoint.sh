#!/bin/sh
# SkyBook backend entrypoint (MySQL edition).
# Waits for the MySQL/MariaDB host to accept connections, then starts the API.
set -e

DB_HOST="${MYSQL_HOST:-db}"
DB_PORT="${MYSQL_PORT:-3306}"
RETRIES="${DB_WAIT_RETRIES:-60}"
export DB_HOST DB_PORT

echo "⏳ Waiting for MySQL at ${DB_HOST}:${DB_PORT}..."
i=0
while [ "$i" -lt "$RETRIES" ]; do
  if node -e "
    const net = require('net');
    const s = net.connect(Number(process.env.DB_PORT), process.env.DB_HOST);
    s.on('connect', () => { s.destroy(); process.exit(0); });
    s.on('error', () => process.exit(1));
  " 2>/dev/null; then
    echo "✅ MySQL is reachable — preparing SkyBook."
    if [ "${SKYBOOK_PREPARE_USERS:-true}" = "true" ]; then
      node src/backend/prepare-deployment-users.js
    fi
    exec "$@"
  fi
  i=$((i + 1))
  sleep 1
done

echo "❌ MySQL at ${DB_HOST}:${DB_PORT} did not become reachable after ${RETRIES}s." >&2
exit 1
