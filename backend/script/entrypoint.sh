#!/bin/sh
set -e
echo "Generating Prisma client"
npx --no-install prisma generate
echo "Applying pending migrations"
npx --no-install prisma migrate deploy
echo "Starting NestJS"
exec "$@"
