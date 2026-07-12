// One-off DB verification helper for the Phase 3 idempotency migration.
// Confirms the `Transaction` table has externalId/fingerprint columns + unique indexes.
// Safe to delete after verification.
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient({ log: [] });
try {
  const cols = await p.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY column_name`,
    'Transaction',
  );
  console.log('COLUMNS on Transaction:');
  for (const c of cols) console.log('  ' + c.column_name);

  const idx = await p.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE tablename = $1 ORDER BY indexname`,
    'Transaction',
  );
  console.log('INDEXES on Transaction:');
  for (const i of idx) console.log('  ' + i.indexname);
} catch (e) {
  console.error('QUERY ERROR:', e.code || e.name, String(e.message).slice(0, 200));
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
