import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { hash } from '@node-rs/argon2'
import { defaultCategories } from '@toppfinance/shared'

const prisma = new PrismaClient()

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Falta ${name} en .env para ejecutar el seed`)
  return value
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'miguel.amaris.martos@gmail.com'
  const memberEmail = process.env.SEED_MEMBER_EMAIL || 'sara.gonzalezperegrina@gmail.com'
  const adminName = process.env.SEED_ADMIN_NAME || 'Miguel'
  const memberName = process.env.SEED_MEMBER_NAME || 'Sara'
  const adminPassword = requireEnv('SEED_ADMIN_PASSWORD')
  const memberPassword = requireEnv('SEED_MEMBER_PASSWORD')

  const household = await prisma.household.upsert({
    where: { id: 'default-household' },
    create: { id: 'default-household', name: 'ToppFinance' },
    update: { name: 'ToppFinance' },
  })

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      householdId: household.id,
      email: adminEmail,
      displayName: adminName,
      role: 'ADMIN',
      passwordHash: await hash(adminPassword),
    },
    update: {
      householdId: household.id,
      displayName: adminName,
      role: 'ADMIN',
      active: true,
    },
  })

  const member = await prisma.user.upsert({
    where: { email: memberEmail },
    create: {
      householdId: household.id,
      email: memberEmail,
      displayName: memberName,
      role: 'MEMBER',
      passwordHash: await hash(memberPassword),
    },
    update: {
      householdId: household.id,
      displayName: memberName,
      role: 'MEMBER',
      active: true,
    },
  })

  for (const category of defaultCategories) {
    await prisma.category.upsert({
      where: {
        householdId_slug: {
          householdId: household.id,
          slug: category.slug,
        },
      },
      create: {
        householdId: household.id,
        type: category.type,
        slug: category.slug,
        name: category.name,
        icon: category.icon,
        color: category.color,
      },
      update: {
        type: category.type,
        name: category.name,
        icon: category.icon,
        color: category.color,
      },
    })
  }

  const accounts = [
    { name: `Cuenta personal ${adminName}`, type: 'PERSONAL' as const, visibility: 'PRIVATE' as const, ownerUserId: admin.id },
    { name: `Cuenta personal ${memberName}`, type: 'PERSONAL' as const, visibility: 'PRIVATE' as const, ownerUserId: member.id },
    { name: 'Cuenta compartida', type: 'SHARED' as const, visibility: 'SHARED' as const, ownerUserId: null },
  ]

  for (const account of accounts) {
    const existing = await prisma.account.findFirst({
      where: {
        householdId: household.id,
        name: account.name,
      },
    })

    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: {
          type: account.type,
          visibility: account.visibility,
          ownerUserId: account.ownerUserId,
          openingBalance: 0,
          currency: 'EUR',
          archived: false,
        },
      })
    } else {
      await prisma.account.create({
        data: {
          householdId: household.id,
          ...account,
          openingBalance: 0,
          currency: 'EUR',
        },
      })
    }
  }

  await prisma.adminSetting.upsert({
    where: { householdId_key: { householdId: household.id, key: 'sharedSplit' } },
    create: { householdId: household.id, key: 'sharedSplit', value: { miguelPercent: 50, saraPercent: 50 } },
    update: {},
  })

  await prisma.adminSetting.upsert({
    where: { householdId_key: { householdId: household.id, key: 'backupPolicy' } },
    create: { householdId: household.id, key: 'backupPolicy', value: { frequency: 'weekly', retentionWeeks: 30, backupDir: './backups' } },
    update: {},
  })

  await prisma.adminSetting.upsert({
    where: { householdId_key: { householdId: household.id, key: 'aiSettings' } },
    create: {
      householdId: household.id,
      key: 'aiSettings',
      value: {
        defaultModel: process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-5-mini',
        fallbackModels: (process.env.OPENROUTER_FALLBACK_MODELS || '').split(',').map(model => model.trim()).filter(Boolean),
        enforceZdr: (process.env.OPENROUTER_ZDR || 'true') === 'true',
        dataCollection: 'deny',
      },
    },
    update: {},
  })

  await prisma.appLog.create({
    data: {
      householdId: household.id,
      level: 'INFO',
      category: 'APPLICATION',
      message: 'Seed inicial ejecutado',
      metadata: { users: [adminEmail, memberEmail], accounts: accounts.map(account => account.name) },
    },
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async error => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
