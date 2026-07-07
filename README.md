# ToppFinance

Webapp mobile-first y PWA para gestionar finanzas de pareja.

Estado actual:

- Monorepo con `apps/web`, `apps/api` y `packages/shared`.
- Backend Fastify + Prisma + PostgreSQL.
- Sesiones persistentes con cookie HttpOnly.
- Modelo inicial de usuarios, cuentas, categorias, movimientos, splits, logs, backups e IA.
- Frontend React/Vite conectado al API real para login, sesion, cuentas, categorias y movimientos.
- Importacion CSV con preview/commit, avisos por fila y duplicados no bloqueantes.

Documentacion:

- `docs/development.md`
- `docs/deployment.md`
- `docs/backups.md`
- `docs/ai-privacy.md`
- `docs/csv-import.md`
