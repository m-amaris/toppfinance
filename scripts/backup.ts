import '../apps/api/dist/config.js'
import { runBackup } from '../apps/api/dist/backup.js'
import { prisma } from '../apps/api/dist/db.js'

const backup = await runBackup(null)
console.log(JSON.stringify({
  id: backup.id,
  status: backup.status,
  filePath: backup.filePath,
  sizeBytes: backup.sizeBytes?.toString() ?? null,
  checksum: backup.checksum,
  error: backup.error,
}, null, 2))

await prisma.$disconnect()
