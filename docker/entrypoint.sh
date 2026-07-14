#!/bin/sh
set -e

echo "🚀 Starting ToppFinance container..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
max_retries=30
retry=0
until pg_isready -h postgres -p 5432 -U toppfinance -d toppfinance > /dev/null 2>&1; do
  retry=$((retry + 1))
  if [ $retry -ge $max_retries ]; then
    echo "❌ Database not ready after $max_retries attempts"
    exit 1
  fi
  sleep 2
done
echo "✅ Database is ready"

# Run Prisma migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

# Verify database connectivity
echo "🔍 Verifying database connectivity..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$queryRaw\`SELECT 1\`
  .then(() => { console.log('✅ Database connection verified'); process.exit(0); })
  .catch(err => { console.error('❌ Database connection failed:', err.message); process.exit(1); })
  .finally(() => prisma.\$disconnect());
"

# Start the application
echo "🌐 Starting ToppFinance API..."
exec node apps/api/dist/server.js