# CLAUDE.md

This file provides repository-specific guidance to Claude Code when working on ToppFinance.

## Project Overview

ToppFinance is a mobile-first web application for personal and couple finance management. It is designed for exactly two fixed users who need to manage private and shared finances with clear privacy boundaries.

The product goal is to help both users:
- register and manage financial movements,
- control monthly budgets,
- understand financial evolution,
- support the future transition from separate accounts to a shared account,
- receive useful AI-powered insights without overcomplicating the MVP.

This repository is partially implemented. Do not assume the current architecture or data model is final or correct. Analyze what already exists, reuse what is good, and challenge what is weak, inconsistent, unfinished, or overengineered.

## Product Rules

### Users and privacy
- There are exactly two fixed users.
- Each user has basic authentication with email and password.
- Each user can see:
  - their own private data,
  - shared data.
- Each user must not see the other user's private data.

### Financial scope
The core movement types are:
- EXPENSE
- INCOME
- SAVING
- TRANSFER
- ADJUSTMENT

The app must support:
- manual transaction creation,
- CSV import,
- transaction editing,
- recategorization,
- deletion,
- account balance tracking,
- monthly budgets,
- analytics.

The app must support both:
- current scenario: separate personal accounts,
- future scenario: a shared account for common expenses.

### Shared expense logic
Shared expenses are not always split 50/50.
They must support configurable proportional splits based on each user's configured contribution percentage.
Do not hardcode the split logic. Review current implementation first.

### Budgets
The product must support three monthly budgets:
- user A personal budget,
- user B personal budget,
- shared budget.

Budgets group spending categories.

### Categories and metadata
Categories are editable from the app.
They belong to the main financial domains and may already exist in the current project.
Support:
- tags,
- merchants / frequent merchants,
- notes,
- useful filtering.

Do not prioritize receipt/file attachment support in the MVP.

## MVP Priorities

Prioritize a functional MVP over feature breadth.

High priority:
- authentication,
- privacy rules,
- accounts and balances,
- manual transaction CRUD,
- CSV import,
- categories,
- monthly budgets,
- dashboards and core analytics,
- basic settings,
- backup configuration,
- log viewing,
- OpenRouter integration for real AI-assisted insights.

Lower priority:
- advanced forecasting,
- polished AI chat,
- extra automation,
- non-essential visual effects,
- attachment management.

Avoid adding features that increase complexity without strong MVP value.

## AI Integration

AI must be implemented through OpenRouter, not mocked.

Expected AI capabilities:
- recategorization suggestions,
- spending insights,
- alerts,
- anomaly detection,
- forecasting,
- savings recommendations,
- chat over movements.

Requirements:
- anonymize data before sending to the provider whenever reasonable,
- keep API keys and sensitive config server-side,
- allow configurable default model and fallback models,
- avoid vendor lock-in to a single model.

## UX and Product Expectations

This app must be:
- mobile-first,
- installable as a PWA,
- fast,
- simple,
- modern,
- practical.

Do not design for offline-first unless explicitly required later.
Do not assume local-device data storage is part of the functional model.
The primary use case is an installed-feeling webapp with persistent login and strong online UX.

## Operational Requirements

The app is expected to run:
- locally during development,
- in a homelab in production.

Access is expected through Tailscale, not a public domain.

The app must include:
- configurable backup policy from admin settings,
- log viewing from the app,
- filtering by log type/category,
- maintainable Docker-based deployment,
- good internal documentation,
- tests and validation checks.

Default backup idea:
- weekly backups,
- 30 retained copies,
but make it configurable from admin settings rather than hardcoded.

## Development Workflow Rules

When working in this repository, follow these rules:

1. Analyze before changing.
2. Do not assume incomplete code is correct.
3. Reuse existing code where it is solid.
4. Challenge bad architecture or weak abstractions.
5. Ask questions only when the missing detail materially changes architecture, security, permissions, persistence, or UX.
6. If a detail does not materially change the outcome, proceed with a clearly stated assumption.
7. Before large refactors or broad implementation changes, present:
   - current-state analysis,
   - proposed architecture,
   - critical open questions,
   - implementation plan.
8. Prefer small, reviewable changes over large rewrites.
9. Keep the project working as you iterate.
10. Do not introduce secrets into the codebase.

## Repository Structure

This is a monorepo with npm workspaces.

```text
/
├── apps/
│   ├── api/              # Fastify + TypeScript backend
│   └── web/              # React + Vite frontend
├── packages/
│   └── shared/           # Shared schemas, types, contracts
├── prisma/               # Prisma schema, migrations, seed
├── scripts/              # Utility scripts
└── package.json
```

## Main Tech Stack

- Frontend: React 18 + Vite + Tailwind CSS
- Backend: Fastify + TypeScript
- Database: Prisma
- Shared contracts: Zod + TypeScript
- Charts: Recharts
- Icons: Lucide React

Do not replace core stack choices casually unless there is a strong architectural reason.

## Common Commands

### Development
- `npm run dev` - start API and web
- `npm run dev:api` - start API only
- `npm run dev:web` - start web only
- `npm run build` - build all packages
- `npm run test` - run tests
- `npm run lint` - run lint
- `npm run check` - run TypeScript checks

### Database
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:deploy`
- `npm run db:seed`

### Operations
- `npm run backup`

## Implementation Guidelines

### Backend
- Validate all input with shared Zod schemas.
- Enforce authorization consistently.
- Use transactions for multi-step financial writes.
- Audit important actions.
- Keep secrets and provider integrations server-side.
- Return safe error messages to clients.

### Frontend
- Keep UI mobile-first.
- Prefer clear flows over dense dashboards.
- Handle loading, empty, and error states properly.
- Use existing shared types/contracts.
- Keep interactions fast and practical.

### Data and money
- Be careful with money precision and date handling.
- Never introduce fragile float-based money logic.
- Preserve consistency between transactions, balances, and derived analytics.

### CSV import
- CSV import is manual and controlled.
- Define a clean, maintainable CSV format.
- Warn on likely duplicates, but do not hard-block import.
- Imported data must remain editable.

## Quality Bar

A task is not complete unless relevant checks pass.

Before considering work done:
- run tests relevant to the change,
- run lint,
- run type checks,
- confirm the changed flow works end-to-end when feasible,
- update documentation if architecture, setup, or behavior changed.

## What to Avoid

- Do not overengineer the MVP.
- Do not rewrite large areas without justification.
- Do not assume the current implementation fully matches the intended product.
- Do not optimize for theoretical scale at the cost of simplicity.
- Do not add offline-first complexity unless explicitly requested.
- Do not add attachment/file-management complexity in the MVP unless explicitly required.
- Do not leak private user data across visibility boundaries.

## Expected Claude Behavior

In a new or ambiguous task, first focus on:
1. understanding the current code,
2. identifying gaps against the product goals,
3. proposing a safe plan,
4. asking only the critical unresolved questions,
5. then implementing in small validated steps.

If there is tension between the current codebase and the best product direction, explain the trade-off clearly instead of silently following the current implementation.