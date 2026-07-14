#!/usr/bin/env tsx
/**
 * Backup restore script
 * Safely restores a PostgreSQL backup with multiple safety checks
 *
 * Usage:
 *   npx tsx scripts/restore-backup.ts <backup-file> [--force] [--target-db=name]
 *
 * Safety features:
 * - Requires explicit confirmation unless --force is used
 * - Creates a pre-restore backup of current database
 * - Validates backup file before restore
 * - Verifies database connectivity after restore
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { config } from '../apps/api/src/config.js'
import { prisma } from '../apps/api/src/db.js'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface RestoreOptions {
  backupFile: string
  force: boolean
  targetDb: string
  skipPreBackup: boolean
  skipValidation: boolean
}

function parseArgs(): RestoreOptions {
  const args = process.argv.slice(2)
  const options: RestoreOptions = {
    backupFile: '',
    force: false,
    targetDb: 'toppfinance',
    skipPreBackup: false,
    skipValidation: false,
  }

  for (const arg of args) {
    if (arg === '--force' || arg === '-f') options.force = true
    else if (arg === '--skip-pre-backup') options.skipPreBackup = true
    else if (arg === '--skip-validation') options.skipValidation = true
    else if (arg.startsWith('--target-db=')) options.targetDb = arg.split('=')[1]
    else if (!options.backupFile) options.backupFile = arg
  }

  return options
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve())
  })
  return hash.digest('hex')
}

async function runCommand(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += String(d) })
    child.stderr.on('data', d => { stderr += String(d) })
    child.on('error', reject)
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

async function validateBackup(filePath: string): Promise<{ valid: boolean; error?: string; tables?: string[] }> {
  const result = await runCommand('pg_restore', ['--list', filePath])
  if (result.code !== 0) {
    return { valid: false, error: result.stderr || `pg_restore exited with code ${result.code}` }
  }
  const tables = result.stdout
    .split('\n')
    .filter(line => line.includes('TABLE DATA'))
    .map(line => {
      const parts = line.trim().split(/\s+/)
      return parts[parts.length - 1]
    })
  return { valid: true, tables }
}

async function createPreRestoreBackup(targetDb: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const preBackupPath = path.resolve(config.BACKUP_DIR, `pre-restore-${timestamp}.dump`)
  console.log(`\n📦 Creating pre-restore backup: ${preBackupPath}`)
  const result = await runCommand('pg_dump', ['--format=custom', '--file', preBackupPath, config.DATABASE_URL])
  if (result.code !== 0) {
    throw new Error(`Pre-restore backup failed: ${result.stderr}`)
  }
  const info = await stat(preBackupPath)
  console.log(`   ✅ Pre-restore backup created (${(info.size / 1024 / 1024).toFixed(2)} MB)`)
  return preBackupPath
}

async function dropAndCreateDatabase(targetDb: string): Promise<void> {
  console.log(`\n🗑️  Dropping database: ${targetDb}`)
  const dropResult = await runCommand('dropdb', ['--if-exists', targetDb], { PGPASSWORD: config.DATABASE_URL.includes('password=') ? config.DATABASE_URL.split('password=')[1].split('@')[0] : undefined })
  if (dropResult.code !== 0 && !dropResult.stderr.includes('does not exist')) {
    throw new Error(`Failed to drop database: ${dropResult.stderr}`)
  }
  console.log('   ✅ Database dropped')

  console.log(`\n🏗️  Creating database: ${targetDb}`)
  const createResult = await runCommand('createdb', [targetDb])
  if (createResult.code !== 0) {
    throw new Error(`Failed to create database: ${createResult.stderr}`)
  }
  console.log('   ✅ Database created')
}

async function restoreBackup(filePath: string, targetDb: string): Promise<void> {
  console.log(`\n🔄 Restoring backup: ${path.basename(filePath)}`)
  const dbUrl = config.DATABASE_URL.replace(/toppfinance\?/, `${targetDb}?`)
  const result = await runCommand('pg_restore', ['--dbname', dbUrl, '--verbose', '--clean', '--no-owner', '--no-privileges', filePath])
  if (result.code !== 0) {
    throw new Error(`Restore failed: ${result.stderr}`)
  }
  console.log('   ✅ Restore completed')
}

async function runMigrations(): Promise<void> {
  console.log('\n🔧 Running Prisma migrations...')
  const result = await runCommand('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: config.DATABASE_URL })
  if (result.code !== 0) {
    throw new Error(`Migration failed: ${result.stderr}`)
  }
  console.log('   ✅ Migrations applied')
}

async function verifyDatabase(): Promise<boolean> {
  console.log('\n✅ Verifying database connectivity...')
  try {
    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`
    await prisma.$disconnect()
    console.log('   ✅ Database connection verified')
    return true
  } catch (error) {
    console.error('   ❌ Database verification failed:', error)
    return false
  }
}

async function promptConfirm(message: string): Promise<boolean> {
  const readline = await import('node:readline/promises')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`${message} [y/N]: `)
  rl.close()
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
}

async function main() {
  const options = parseArgs()

  console.log('=== ToppFinance Backup Restore ===')
  console.log(`Backup directory: ${config.BACKUP_DIR}`)
  console.log(`Target database: ${options.targetDb}`)

  if (!options.backupFile) {
    console.error('\n❌ Error: Backup file required')
    console.log('\nUsage: npx tsx scripts/restore-backup.ts <backup-file> [options]')
    console.log('Options:')
    console.log('  --force              Skip confirmation prompt')
    console.log('  --target-db=name     Target database name (default: toppfinance)')
    console.log('  --skip-pre-backup    Skip creating pre-restore backup')
    console.log('  --skip-validation    Skip backup validation')
    console.log('\nAvailable backups:')
    const { readdir } = await import('node:fs/promises')
    const files = (await readdir(config.BACKUP_DIR)).filter(f => f.endsWith('.dump')).sort().reverse()
    for (const f of files.slice(0, 10)) console.log(`  ${f}`)
    process.exit(1)
  }

  const filePath = path.resolve(config.BACKUP_DIR, options.backupFile)
  const info = await stat(filePath).catch(() => null)
  if (!info) {
    console.error(`\n❌ Backup file not found: ${filePath}`)
    process.exit(1)
  }

  console.log(`\n📁 Selected backup: ${options.backupFile}`)
  console.log(`   Size: ${(info.size / 1024 / 1024).toFixed(2)} MB`)
  console.log(`   Modified: ${info.mtime.toISOString()}`)

  // Validation
  if (!options.skipValidation) {
    console.log('\n🔍 Validating backup...')
    const checksum = await sha256File(filePath)
    console.log(`   SHA256: ${checksum}`)

    const validation = await validateBackup(filePath)
    if (!validation.valid) {
      console.error(`   ❌ Validation failed: ${validation.error}`)
      process.exit(1)
    }
    console.log(`   ✅ Backup structure valid (${validation.tables?.length ?? 0} tables)`)

    // Check against DB record
    const record = await prisma.backupRun.findFirst({ where: { filePath } })
    if (record?.checksum && record.checksum !== checksum) {
      console.error('   ❌ CHECKSUM MISMATCH with database record!')
      console.error(`      Expected: ${record.checksum}`)
      console.error(`      Actual:   ${checksum}`)
      if (!options.force) {
        console.error('   Use --force to override')
        process.exit(1)
      }
      console.warn('   ⚠️  Proceeding due to --force flag')
    } else if (record?.checksum) {
      console.log('   ✅ Checksum matches database record')
    }
  }

  // Safety confirmation
  if (!options.force) {
    console.log('\n⚠️  WARNING: This will DESTROY all data in the target database!')
    console.log(`   Target database: ${options.targetDb}`)
    console.log(`   Backup file: ${options.backupFile}`)
    const confirmed = await promptConfirm('Are you absolutely sure you want to proceed?')
    if (!confirmed) {
      console.log('Aborted.')
      process.exit(0)
    }
  }

  // Pre-restore backup
  let preBackupPath: string | null = null
  if (!options.skipPreBackup) {
    try {
      preBackupPath = await createPreRestoreBackup(options.targetDb)
    } catch (error) {
      console.error('❌ Pre-restore backup failed:', error)
      if (!options.force) {
        console.error('Use --skip-pre-backup or --force to proceed anyway')
        process.exit(1)
      }
      console.warn('⚠️  Proceeding without pre-restore backup due to --force')
    }
  }

  try {
    // Drop and recreate database
    await dropAndCreateDatabase(options.targetDb)

    // Restore
    await restoreBackup(filePath, options.targetDb)

    // Run migrations
    await runMigrations()

    // Verify
    const verified = await verifyDatabase()
    if (!verified) {
      throw new Error('Post-restore verification failed')
    }

    console.log('\n🎉 Restore completed successfully!')
    console.log(`   Target database: ${options.targetDb}`)
    console.log(`   Restored from: ${options.backupFile}`)
    if (preBackupPath) {
      console.log(`   Pre-restore backup: ${path.basename(preBackupPath)}`)
    }
  } catch (error) {
    console.error('\n❌ Restore failed:', error)
    if (preBackupPath) {
      console.log(`\n🔄 You can restore the pre-restore backup with:`)
      console.log(`   npx tsx scripts/restore-backup.ts ${path.basename(preBackupPath)} --target-db=${options.targetDb}`)
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})