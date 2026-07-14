#!/usr/bin/env tsx
/**
 * Secrets utility script
 * Generate secure values, validate environment files, audit git history
 */

import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

interface EnvVar {
  key: string
  description: string
  required: boolean
  secret: boolean
  validator?: (value: string) => boolean
  generator?: () => string
}

const SCHEMA: EnvVar[] = [
  { key: 'NODE_ENV', description: 'Runtime environment', required: true, secret: false, validator: v => ['development', 'test', 'production'].includes(v) },
  { key: 'APP_NAME', description: 'Application display name', required: true, secret: false, generator: () => 'ToppFinance' },
  { key: 'APP_URL', description: 'Public application URL', required: true, secret: false, validator: v => v.startsWith('http') },
  { key: 'PORT', description: 'API port', required: true, secret: false, validator: v => !isNaN(Number(v)) && Number(v) > 0, generator: () => '3000' },
  { key: 'DATABASE_URL', description: 'PostgreSQL connection string', required: true, secret: true, validator: v => v.startsWith('postgresql://') },
  { key: 'SESSION_COOKIE_NAME', description: 'Session cookie name', required: true, secret: false, generator: () => 'toppfinance_session' },
  { key: 'SESSION_TTL_DAYS', description: 'Session lifetime in days', required: true, secret: false, validator: v => !isNaN(Number(v)) && Number(v) > 0, generator: () => '365' },
  { key: 'COOKIE_SECURE', description: 'Secure cookies (HTTPS only)', required: true, secret: false, validator: v => ['true', 'false'].includes(v), generator: () => 'true' },
  { key: 'CORS_ORIGIN', description: 'Allowed CORS origins (comma-separated)', required: true, secret: false },
  { key: 'BACKUP_DIR', description: 'Backup output directory', required: true, secret: false, generator: () => './backups' },
  { key: 'BACKUP_RETENTION_WEEKS', description: 'Backup retention in weeks', required: true, secret: false, validator: v => !isNaN(Number(v)) && Number(v) > 0, generator: () => '30' },
  { key: 'BACKUP_SCHEDULE_CRON', description: 'Backup schedule (cron)', required: false, secret: false, generator: () => '0 3 * * 0' },
  { key: 'OPENROUTER_API_KEY', description: 'OpenRouter API key', required: false, secret: true },
  { key: 'OPENROUTER_DEFAULT_MODEL', description: 'Default AI model', required: false, secret: false, generator: () => 'openai/gpt-5-mini' },
  { key: 'OPENROUTER_FALLBACK_MODELS', description: 'Fallback models (comma-separated)', required: false, secret: false, generator: () => 'anthropic/claude-sonnet-4.5,google/gemini-3-flash-preview' },
  { key: 'OPENROUTER_ZDR', description: 'Zero Data Retention', required: false, secret: false, validator: v => ['true', 'false'].includes(v), generator: () => 'true' },
  { key: 'RATE_LIMIT_MAX', description: 'Max requests per window', required: false, secret: false, validator: v => !isNaN(Number(v)), generator: () => '1000' },
  { key: 'RATE_LIMIT_WINDOW_MS', description: 'Rate limit window (ms)', required: false, secret: false, validator: v => !isNaN(Number(v)), generator: () => '60000' },
  { key: 'RATE_LIMIT_ALLOWLIST', description: 'Allowlisted IPs (comma-separated)', required: false, secret: false },
  { key: 'RATE_LIMIT_BAN_DURATION_MS', description: 'Ban duration (ms)', required: false, secret: false, validator: v => !isNaN(Number(v)), generator: () => '0' },
  { key: 'RATE_LIMIT_CACHE_SIZE', description: 'Rate limit cache size', required: false, secret: false, validator: v => !isNaN(Number(v)), generator: () => '5000' },
  { key: 'SEED_ADMIN_EMAIL', description: 'Initial admin email', required: false, secret: false },
  { key: 'SEED_ADMIN_NAME', description: 'Initial admin name', required: false, secret: false },
  { key: 'SEED_ADMIN_PASSWORD', description: 'Initial admin password', required: false, secret: true, generator: () => generatePassword() },
  { key: 'SEED_MEMBER_EMAIL', description: 'Initial member email', required: false, secret: false },
  { key: 'SEED_MEMBER_NAME', description: 'Initial member name', required: false, secret: false },
  { key: 'SEED_MEMBER_PASSWORD', description: 'Initial member password', required: false, secret: true, generator: () => generatePassword() },
]

function generatePassword(length = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const bytes = randomBytes(length)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

function generateSecret(length = 32): string {
  return randomBytes(length).toString('base64url')
}

function loadEnv(filePath: string): Record<string, string> {
  const env: Record<string, string> = {}
  if (!existsSync(filePath)) return env

  const content = readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...rest] = trimmed.split('=')
    if (key && rest.length > 0) {
      env[key.trim()] = rest.join('=').trim()
    }
  }
  return env
}

function maskValue(key: string, value: string): string {
  if (!value) return '(empty)'
  if (key.includes('PASSWORD') || key.includes('SECRET') || key.includes('KEY') || key.includes('TOKEN')) {
    return value.length > 8 ? value.slice(0, 4) + '••••' + value.slice(-4) : '••••'
  }
  return value
}

function validateEnv(env: Record<string, string>, schema: EnvVar[]): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  for (const item of schema) {
    const value = env[item.key]

    if (item.required && !value) {
      errors.push(`Missing required variable: ${item.key} (${item.description})`)
      continue
    }

    if (value && item.validator && !item.validator(value)) {
      errors.push(`Invalid value for ${item.key}: ${item.description}`)
    }

    if (!value && item.generator && item.required) {
      warnings.push(`Missing ${item.key} - can be generated: ${item.generator()}`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

async function cmdGenerate(args: string[]) {
  const type = args[0] || 'password'
  const length = parseInt(args[1] || '24', 10)

  switch (type) {
    case 'password':
      console.log(generatePassword(length))
      break
    case 'secret':
      console.log(generateSecret(length))
      break
    case 'cookie-secret':
      console.log(randomBytes(32).toString('base64'))
      break
    default:
      console.error(`Unknown type: ${type}. Use: password, secret, cookie-secret`)
      process.exit(1)
  }
}

async function cmdValidate(args: string[]) {
  const file = args[0] || '.env'
  const filePath = path.resolve(ROOT_DIR, file)

  console.log(`=== Validating ${file} ===`)
  const env = loadEnv(filePath)

  if (Object.keys(env).length === 0) {
    console.log('File not found or empty')
    process.exit(1)
  }

  const result = validateEnv(env, SCHEMA)

  for (const item of SCHEMA) {
    const val = env[item.key]
    console.log(`  ${item.key}=${maskValue(item.key, val || '(empty)')} ${item.required ? '[REQUIRED]' : '[optional]'}`)
  }

  if (result.warnings.length) {
    console.log('\n⚠️  Warnings:')
    for (const w of result.warnings) console.log(`  - ${w}`)
  }

  if (result.errors.length) {
    console.log('\n❌ Errors:')
    for (const e of result.errors) console.log(`  - ${e}`)
    process.exit(1)
  } else {
    console.log('\n✅ Environment valid')
  }
}

async function cmdCheckGitignore() {
  const gitignorePath = path.join(ROOT_DIR, '.gitignore')
  if (!existsSync(gitignorePath)) {
    console.log('❌ No .gitignore found')
    process.exit(1)
  }

  const content = readFileSync(gitignorePath, 'utf-8')
  const checks = [
    { pattern: /^\.env$/, desc: 'ignores .env', shouldMatch: true },
    { pattern: /^\.env\.\*$/, desc: 'ignores .env.*', shouldMatch: true },
    { pattern: /^!\.env\.example$/, desc: 'allows .env.example', shouldMatch: true },
  ]

  let allPass = true
  for (const check of checks) {
    const matched = content.split('\n').some(line => check.pattern.test(line.trim()))
    if (matched === check.shouldMatch) {
      console.log(`  ✅ ${check.desc}`)
    } else {
      console.log(`  ❌ ${check.desc}`)
      allPass = false
    }
  }

  if (!allPass) {
    console.log('\n❌ .gitignore needs fixes')
    process.exit(1)
  }
  console.log('\n✅ .gitignore OK')
}

async function cmdAuditHistory() {
  console.log('=== Auditing git history for secrets ===\n')

  const secretPatterns = [
    /postgresql:\/\/[^:]+:[^@]+@/,  // DATABASE_URL with password
    /sk-or-[a-zA-Z0-9_-]+/,          // OpenRouter key
    /sk-[a-zA-Z0-9]{32,}/,           // Generic API keys
    /password\s*=\s*['"][^'"]+['"]/,  // password = "xxx"
    /secret\s*=\s*['"][^'"]+['"]/,    // secret = "xxx"
  ]

  let found = false

  // Check tracked files
  try {
    const files = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim().split('\n')
    for (const file of files) {
      if (!file) continue
      const fullPath = path.join(ROOT_DIR, file)
      if (!existsSync(fullPath)) continue
      const content = readFileSync(fullPath, 'utf-8')
      for (const pattern of secretPatterns) {
        const matches = content.match(pattern)
        if (matches) {
          console.log(`⚠️  Potential secret in ${file}: ${matches[0].slice(0, 50)}...`)
          found = true
        }
      }
    }
  } catch {
    console.log('Could not check tracked files')
  }

  // Check history for .env files
  try {
    const history = execSync('git log --all --full-history --oneline -- .env .env.production .env.preview', { cwd: ROOT_DIR, encoding: 'utf-8' })
    if (history.trim()) {
      console.log('\n⚠️  .env files found in git history:')
      console.log(history.slice(0, 500))
      found = true
    }
  } catch {
    // ignore
  }

  if (!found) {
    console.log('✅ No secrets detected in tracked files or history')
  }
}

async function cmdCreateEnv(args: string[]) {
  const template = args[0] || 'development'
  const examplePath = path.join(ROOT_DIR, '.env.example')
  const targetPath = path.join(ROOT_DIR, template === 'production' ? '.env.production' : template === 'preview' ? '.env.preview' : '.env')

  if (existsSync(targetPath)) {
    console.log(`❌ ${targetPath} already exists`)
    process.exit(1)
  }

  const example = loadEnv(examplePath)
  const output: string[] = [
    '# Generated by secrets utility',
    `# Environment: ${template}`,
    `# Date: ${new Date().toISOString()}`,
    '',
  ]

  for (const item of SCHEMA) {
    let value = example[item.key] || ''
    if (!value && item.generator) {
      value = item.generator()
    }
    if (value) {
      output.push(`${item.key}=${value}`)
    } else {
      output.push(`${item.key}=`)
    }
  }

  writeFileSync(targetPath, output.join('\n') + '\n')
  console.log(`✅ Created ${targetPath}`)
  console.log('⚠️  Edit with real values before use!')
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'help'

  switch (command) {
    case 'generate':
      await cmdGenerate(args.slice(1))
      break
    case 'validate':
      await cmdValidate(args.slice(1))
      break
    case 'check-gitignore':
      await cmdCheckGitignore()
      break
    case 'audit-history':
      await cmdAuditHistory()
      break
    case 'create-env':
      await cmdCreateEnv(args.slice(1))
      break
    default:
      console.log(`
Secrets Utility for ToppFinance

Usage:
  npm run secrets generate [password|secret|cookie-secret] [length]
  npm run secrets validate [.env|.env.production|.env.preview]
  npm run secrets check-gitignore
  npm run secrets audit-history
  npm run secrets create-env [development|production|preview]

Examples:
  npm run secrets generate password 32
  npm run secrets validate .env.production
  npm run secrets create-env production
      `)
  }
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})