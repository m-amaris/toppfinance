# ToppFinance

ToppFinance es un monorepo para una aplicación financiera con backend, frontend web y un paquete compartido de contratos y utilidades. Este baseline deja el proyecto alineado para onboarding, desarrollo local, validación básica y operación controlada.

## Mapa del repositorio

```text
.
├── apps/
│   ├── api/              # Backend
│   └── web/              # Frontend Vite/React
├── packages/
│   └── shared/           # Tipos, utilidades y contratos compartidos
├── prisma/               # Esquema, migraciones y seed
├── scripts/              # Automatizaciones y mantenimiento
├── docker/               # Entrypoints y soporte de contenedores
├── docs/                 # Documentación operativa y técnica
├── backups/              # Carpeta de backups
├── package.json          # Scripts raíz del monorepo
└── docker-compose.yml    # Levantado local con contenedores
```

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.
- Base de datos accesible para Prisma.
- Docker y Docker Compose si vas a usar el flujo contenedorizado.

## Inicio rápido

1. Instala dependencias.
2. Copia la configuración de entorno.
3. Genera Prisma y aplica migraciones.
4. Si hace falta, carga seed.
5. Arranca el entorno de desarrollo.

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Scripts raíz

- `dev`: `concurrently -n api,web -c cyan,green "npm run dev -w @toppfinance/api" "npm run dev -w @toppfinance/web"`
- `dev:api`: `npm run dev -w @toppfinance/api`
- `dev:web`: `npm run dev -w @toppfinance/web`
- `build`: `npm run build -w @toppfinance/shared && npm run build -w @toppfinance/api && npm run build -w @toppfinance/web`
- `test`: `npm run test --workspaces --if-present`
- `check`: `npm run check --workspaces --if-present`
- `lint`: `npm run lint --workspaces --if-present`
- `db:generate`: `prisma generate`
- `db:migrate`: `prisma migrate dev`
- `db:deploy`: `prisma migrate deploy`
- `db:seed`: `npm run build -w @toppfinance/shared && tsx prisma/seed.ts`
- `backup`: `npm run build -w @toppfinance/shared && npm run build -w @toppfinance/api && tsx scripts/backup.ts`
- `preview`: `npm run preview -w @toppfinance/web`

## Workspaces

### apps/api
- `dev`: `npm run build -w @toppfinance/shared && tsx watch src/server.ts`
- `build`: `tsc -p tsconfig.json`
- `start`: `node dist/server.js`
- `test`: `vitest run --passWithNoTests`
- `check`: `npm run build -w @toppfinance/shared && tsc -p tsconfig.json --noEmit`

### apps/web
- `dev`: `vite --host 0.0.0.0 --port 5175`
- `build`: `vite build`
- `preview`: `vite preview --host 0.0.0.0 --port 4175`
- `test`: `vitest run`
- `check`: `vite build`

### packages/shared
- `build`: `tsc -p tsconfig.json`
- `check`: `tsc -p tsconfig.json --noEmit`

## Variables de entorno

Variables declaradas en `.env.example`:

- `NODE_ENV`
- `APP_NAME`
- `APP_URL`
- `PORT`
- `DATABASE_URL`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_DAYS`
- `COOKIE_SECURE`
- `CORS_ORIGIN`
- `BACKUP_DIR`
- `BACKUP_RETENTION_WEEKS`
- `BACKUP_SCHEDULE_CRON`
- `OPENROUTER_API_KEY`
- `OPENROUTER_DEFAULT_MODEL`
- `OPENROUTER_FALLBACK_MODELS`
- `OPENROUTER_ZDR`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_NAME`
- `SEED_ADMIN_PASSWORD`
- `SEED_MEMBER_EMAIL`
- `SEED_MEMBER_NAME`
- `SEED_MEMBER_PASSWORD`

Consulta `docs/environment.md` para la descripción operativa y `docs/development.md` para el flujo de arranque.

## Flujo de validación

Antes de abrir una PR o desplegar, ejecuta este bloque como mínimo:

```bash
npm run lint
npm run check
npm run test
npm run build
```

## Docker

Para levantar el stack con contenedores:

```bash
docker compose up --build
```

## Documentación

- `docs/architecture.md`
- `docs/development.md`
- `docs/deployment.md`
- `docs/environment.md`
- `docs/runbook.md`
- `docs/backups.md`
- `docs/csv-import.md`
- `docs/ai-privacy.md`
