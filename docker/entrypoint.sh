#!/bin/sh
set -e

npx prisma migrate deploy
exec node apps/api/dist/server.js
