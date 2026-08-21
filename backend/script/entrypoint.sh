#!/bin/sh
set -e
echo "Generating Prisma client"
npx prisma generate
echo "Applying pending migrations"
npx prisma migrate deploy
echo "Starting NestJS"
exec "$@"
