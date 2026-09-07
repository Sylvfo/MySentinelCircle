#!/usr/bin/env bash
# One-time (idempotent) setup: creates the mysentinelcircle_test database
# on the existing mariadb container and grants the app user access to it.
# Safe to re-run (CREATE DATABASE IF NOT EXISTS).
set -euo pipefail
cd "$(dirname "$0")/../.."   # repo root
set -a; source .env; set +a  # MARIADB_ROOT_PASSWORD / MARIADB_USER

docker exec -i mysentinelcircle-db mariadb -uroot -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS mysentinelcircle_test;
GRANT ALL PRIVILEGES ON mysentinelcircle_test.* TO '${MARIADB_USER}'@'%';
FLUSH PRIVILEGES;
SQL
echo "mysentinelcircle_test ready, granted to ${MARIADB_USER}."
