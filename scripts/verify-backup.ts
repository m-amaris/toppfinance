#!/usr/bin/env tsx
/**
 * Backup verification script
 * Validates backup files for integrity, checksums, and restorability
 */

import { readdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { config } from '../apps/api/src/config.js'
import { prisma } from '../apps/api/src/db.js'

function runCommand(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += String(d) })
    child.stderr.on('data', d => { stderr += String(d) })
    child.on('error', reject)
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }))
  })
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

async function validateBackupStructure(filePath: string): Promise<{ valid: boolean; tables?: string[]; error?: string }> {
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

async function testRestore(filePath: string, targetDb: string): Promise<{ success: boolean; error?: string }> {
  const dbUrl = config.DATABASE_URL.replace(/toppfinance\?/, `${targetDb}?`)
  const result = await runCommand('pg_restore', [
    '--dbname', dbUrl,
    '--clean', '--no-owner', '--no-privileges',
    filePath
  ])
  if (result.code !== 0) {
    return { success: false, error: result.stderr }
  }
  return { success: true }
}

interface BackupReport {
  file: string
  sizeBytes: number
  modified: Date
  checksum: string
  structureValid: boolean
  tablesCount: number
  dbRecord: {
    exists: boolean
    status: string
    checksumMatch: boolean
    finishedAt: Date | null
  }
  testRestore: {
    attempted: boolean
    success: boolean
    error?: string
  }
}

async function main() {
  const args = process.argv.slice(2)
  const options = {
    file: args.find(a => !a.startsWith('--')),
    testRestore: args.includes('--test-restore'),
    targetDb: args.find(a => a.startsWith('--target-db='))?.split('=')[1] ?? 'toppfinance_verify',
    verbose: args.includes('--verbose'),
    all: args.includes('--all'),
  }

  console.log('=== ToppFinance Backup Verification ===')
  console.log(`Backup directory: ${config.BACKUP_DIR}`)
  if (options.testRestore) console.log(`Test restore target: ${options.targetDb}`)

  const files = (await readdir(config.BACKUP_DIR).catch(() => []))
    .filter(f => f.endsWith('.dump'))
    .sort((a, b) => b.localeCompare(a))

  if (files.length === 0) {
    console.log('\nNo backup files found.')
    return
  }

  const targetFiles = options.file
    ? files.filter(f => f === options.file)
    : options.all
      ? files
      : files.slice(0, 10)

  if (targetFiles.length === 0 && options.file) {
    console.log(`\nBackup file not found: ${options.file}`)
    return
  }

  const reports: BackupReport[] = []

  for (const file of targetFiles) {
    const filePath = path.resolve(config.BACKUP_DIR, file)
    const info = await stat(filePath)

    console.log(`\n📁 Verifying: ${file}`)
    console.log(`   Size: ${(info.size / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Modified: ${info.mtime.toISOString()}`)

    // Checksum
    const checksum = await sha256File(filePath)
    console.log(`   SHA256: ${checksum}`)

    // Database record
    const dbRecord = await prisma.backupRun.findFirst({ where: { filePath } })
    let checksumMatch = false
    if (dbRecord) {
      checksumMatch = dbRecord.checksum === checksum
      console.log(`   DB Record: ${dbRecord.status} (${dbRecord.finishedAt?.toISOString() ?? 'N/A'})`)
      console.log(`   Checksum match: ${checksumMatch ? '✅' : '❌ MISMATCH!'}`)
    } else {
      console.log('   DB Record: Not found')
    }

    // Structure validation
    console.log('   Validating structure...')
    const structure = await validateBackupStructure(filePath)
    if (structure.valid) {
      console.log(`   ✅ Structure valid (${structure.tables?.length ?? 0} tables)`)
    } else {
      console.log(`   ❌ Structure invalid: ${structure.error}`)
    }

    // Test restore (optional, creates temporary DB)
    let testRestoreResult = { attempted: false, success: false }
    if (options.testRestore && structure.valid) {
      console.log(`   Testing restore to ${options.targetDb}...`)
      // Create test DB
      await runCommand('dropdb', ['--if-exists', options.targetDb])
      await runCommand('createdb', [options.targetDb])
      testRestoreResult = await testRestore(filePath, options.targetDb)
      if (testRestoreResult.success) {
        console.log('   ✅ Test restore successful')
      } else {
        console.log(`   ❌ Test restore failed: ${testRestoreResult.error}`)
      }
      // Cleanup
      await runCommand('dropdb', ['--if-exists', options.targetDb])
    }

    reports.push({
      file,
      sizeBytes: info.size,
      modified: info.mtime,
      checksum,
      structureValid: structure.valid,
      tablesCount: structure.tables?.length ?? 0,
      dbRecord: {
        exists: !!dbRecord,
        status: dbRecord?.status ?? 'N/A',
        checksumMatch,
        finishedAt: dbRecord?.finishedAt ?? null,
      },
      testRestore: testRestoreResult,
    })
  }

  // Summary
  console.log('\n=== SUMMARY ===')
  const total = reports.length
  const valid = reports.filter(r => r.structureValid).length
  const withDbRecord = reports.filter(r => r.dbRecord.exists).length
  const checksumOk = reports.filter(r => r.dbRecord.checksumMatch).length
  const testRestoreOk = reports.filter(r => r.testRestore.success).length

  console.log(`Total verified: ${total}`)
  console.log(`Structure valid: ${valid}/${total}`)
  console.log(`DB records found: ${withDbRecord}/${total}`)
  console.log(`Checksums match: ${checksumOk}/${withDbRecord}`)
  if (options.testRestore) {
    console.log(`Test restores successful: ${testRestoreOk}/${reports.filter(r => r.testRestore.attempted).length}`)
  }

  // Warnings
  const warnings: string[] = []
  for (const r of reports) {
    if (!r.structureValid) warnings.push(`${r.file}: Invalid backup structure`)
    if (r.dbRecord.exists && !r.dbRecord.checksumMatch) warnings.push(`${r.file}: Checksum mismatch with DB record`)
    if (!r.dbRecord.exists) warnings.push(`${r.file}: No database record (untracked backup)`)
    if (options.testRestore && r.testRestore.attempted && !r.testRestore.success) warnings.push(`${r.file}: Test restore failed`)
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:')
    for (const w of warnings) console.log(`  - ${w}`)
    process.exit(1)
  } else {
    console.log('\n✅ All backups verified successfully')
  }
}

main()
  .catch(err => {
    console.error('Verification failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())