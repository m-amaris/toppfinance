import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { config } from './config.js'
import { prisma } from './db.js'

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function sha256File(filePath: string) {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve())
  })
  return hash.digest('hex')
}

function runPgDump(filePath: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('pg_dump', ['--format=custom', '--file', filePath, config.DATABASE_URL], {
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: false,
    })

    let error = ''
    child.stderr.on('data', chunk => {
      error += String(chunk)
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(error || `pg_dump termino con codigo ${code}`))
    })
  })
}

export async function enforceBackupRetention(backupDir = config.BACKUP_DIR, retentionWeeks = config.BACKUP_RETENTION_WEEKS) {
  const maxAgeMs = retentionWeeks * 7 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const files = await readdir(backupDir).catch(() => [])

  await Promise.all(files
    .filter(file => file.endsWith('.dump'))
    .map(async file => {
      const filePath = path.join(backupDir, file)
      const info = await stat(filePath)
      if (now - info.mtimeMs > maxAgeMs) {
        await unlink(filePath)
      }
    }))
}

export async function runBackup(householdId?: string | null) {
  await mkdir(config.BACKUP_DIR, { recursive: true })
  const filePath = path.resolve(config.BACKUP_DIR, `toppfinance-${timestamp()}.dump`)
  const run = await prisma.backupRun.create({
    data: {
      householdId: householdId ?? null,
      status: 'STARTED',
      filePath,
    },
  })

  try {
    await runPgDump(filePath)
    const info = await stat(filePath)
    const checksum = await sha256File(filePath)
    await enforceBackupRetention()
    return prisma.backupRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCESS',
        sizeBytes: BigInt(info.size),
        checksum,
        finishedAt: new Date(),
      },
    })
  } catch (error) {
    return prisma.backupRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      },
    })
  }
}
