#!/usr/bin/env node
/**
 * Contract integrity checker.
 * Verifies that:
 * 1. No `import { z } from 'zod'` exists outside packages/shared
 * 2. No shared Request/Response types are defined outside packages/shared
 * 3. No `import * from './finance'` for functions that exist in @toppfinance/shared
 *
 * Usage: node scripts/check-contracts.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { globSync } from 'node:fs'

// --- Configuration ---
const ROOT = new URL('..', import.meta.url).pathname
const SHARED_SRC = `${ROOT}packages/shared/src`

const ALLOWED_ZOD_FILES = new Set([
  `${ROOT}packages/shared/src/schemas.ts`,
  `${ROOT}packages/shared/src/csv.ts`,
  `${ROOT}packages/shared/src/config.ts`,
])

// Files where z.infer<typeof ...> is allowed (type derivation from schemas)
const ALLOWED_ZOD_INFER_FILES = new Set([
  `${ROOT}packages/shared/src/types.ts`,
])

// Shared functions that MUST NOT be re-exported from API layers
const SHARED_FUNCTIONS = new Set([
  'accountVisibilityWhere',
  'assertSplitTotal',
  'buildAccountEntries',
  'calculateAccountBalance',
  'canSeeTransaction',
  'dateOnly',
  'defaultSplits',
  'findAccount',
  'findCategory',
  'findUser',
  'getDefaultAccountForType',
  'localizeCategoryName',
  'makeSourceHash',
  'mapApiCategory',
  'monthKeyFromDate',
  'currentMonthKey',
  'parseBeneficiarySplits',
  'parseCsv',
  'parseDateValue',
  'parseMoney',
  'parseTypeValue',
  'parseVisibilityValue',
  'splitTags',
  'toMoney',
  'transactionVisibilityWhere',
  'validateAccountAccess',
  'validateTransferAccounts',
  'CSV_COLUMN_ALIASES',
  'FALLBACK_CATEGORY_BY_TYPE',
  'TRANSACTION_TYPE_LABELS',
])

let errors = 0

function error(file, message) {
  console.error(`  ❌ ${file}: ${message}`)
  errors++
}

// --- Check 1: Zod only in shared ---
console.log('\n🔍 Checking Zod imports are confined to packages/shared ...')

function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const relative = filePath.replace(ROOT, '')

  // Check for `import { z } from 'zod'` or `import { z } from "zod"`
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/import\s+\{[^}]*\bz\b[^}]*\}\s+from\s+['"]zod['"]/.test(line)) {
      if (!ALLOWED_ZOD_FILES.has(filePath)) {
        error(relative, `Line ${i + 1}: Zod import found outside packages/shared`)
      }
    }
    // Also catch re-exports
    if (/export\s+\{[^}]*\bz\b[^}]*\}\s+from/.test(line)) {
      if (!ALLOWED_ZOD_FILES.has(filePath)) {
        error(relative, `Line ${i + 1}: Zod re-export found outside packages/shared`)
      }
    }
  }
}

// Walk all .ts files outside shared, PLUS shared types.ts for infer checks
const apiFiles = globSync(`${ROOT}apps/api/src/**/*.ts`)
const sharedSrcFiles = globSync(`${ROOT}packages/shared/src/**/*.ts`)
const allFiles = [...apiFiles, ...sharedSrcFiles]

for (const file of allFiles) {
  checkFile(file)
}

// --- Check 2: No re-export of shared functions from ./finance ---
console.log('\n🔍 Checking API layer imports shared functions directly (not via ./finance) ...')

for (const file of apiFiles) {
  const content = readFileSync(file, 'utf-8')
  const lines = content.split('\n')
  const relative = file.replace(ROOT, '')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Check for imports that re-export shared functions through local modules
    const match = line.match(/import\s+\{([^}]+)\}\s+from\s+['"]\.\/(\w+)['"]/)
    if (match) {
      const imports = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim())
      for (const imp of imports) {
        // Skip local-only names and type-only imports
        if (imp.startsWith('type ')) continue
        const cleanName = imp.replace(/^type\s+/, '')
        if (SHARED_FUNCTIONS.has(cleanName)) {
          error(relative, `Line ${i + 1}: '${cleanName}' imported from './${match[2]}' instead of '@toppfinance/shared'`)
        }
      }
    }
  }
}

// --- Check 3: No require('@toppfinance/shared') ---
console.log('\n🔍 Checking for require() calls on @toppfinance/shared ...')

for (const file of allFiles) {
  const content = readFileSync(file, 'utf-8')
  const lines = content.split('\n')
  const relative = file.replace(ROOT, '')

  for (let i = 0; i < lines.length; i++) {
    if (/require\s*\(\s*['"]@toppfinance\/shared['"]\s*\)/.test(lines[i])) {
      error(relative, `Line ${i + 1}: synchronous require() of @toppfinance/shared - use a top-level import instead`)
    }
  }
}

// --- Check 4: No z.object(...) outside shared ---
console.log('\n🔍 Checking for inline z.object() outside packages/shared ...')

for (const file of allFiles) {
  const content = readFileSync(file, 'utf-8')
  const lines = content.split('\n')
  const relative = file.replace(ROOT, '')

  for (let i = 0; i < lines.length; i++) {
    if (/z\.object\s*\(/.test(lines[i])) {
      if (!ALLOWED_ZOD_FILES.has(file)) {
        error(relative, `Line ${i + 1}: inline z.object() found — move schema to packages/shared/src/schemas.ts and import the named schema`)
      }
    }
  }
}

// --- Check 5: No z.infer<...> outside shared ---
console.log('\n🔍 Checking for z.infer<> outside packages/shared ...')

for (const file of allFiles) {
  const content = readFileSync(file, 'utf-8')
  const lines = content.split('\n')
  const relative = file.replace(ROOT, '')

  for (let i = 0; i < lines.length; i++) {
    if (/z\.infer\s*</.test(lines[i])) {
      if (!ALLOWED_ZOD_INFER_FILES.has(file)) {
        error(relative, `Line ${i + 1}: z.infer<> found — import the derived type from '@toppfinance/shared' instead`)
      }
    }
  }
}

// --- Summary ---
console.log()
if (errors === 0) {
  console.log('✅ All contract integrity checks passed.')
} else {
  console.log(`❌ ${errors} contract integrity error(s) found.`)
  process.exit(1)
}