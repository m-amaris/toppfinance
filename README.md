# ToppFinance

ToppFinance es un monorepo para una aplicación financiera con backend, frontend web y un paquete compartido de contratos y utilidades. Este baseline deja el proyecto alineado para onboarding, desarrollo local, validación básica y operación controlada.

## Mapa del repositorio

```text
.
├── apps/
│   ├── api/              # Backend Fastify + Prisma
│   └── web/              # Frontend Vite/React
├── packages/
│   └── shared/           # Tipos, utilidades y contratos compartidos
├── prisma/               # Esquema, migraciones y seed
├── scripts/              # Automatizaciones y mantenimiento
├── docker/               # Entrypoints y soporte de contenedores
├── docs/                 # Documentación operativa y técnica
├── backups/              # Carpeta de backups generados en host
├── Dockerfile            # Imagen de aplicación para despliegue
├── docker-compose.yml    # Stack local con app + postgres
├── package.json          # Scripts raíz del monorepo
└── .env.example          # Plantilla de configuración local
```

## Arquitectura lógica

Flujo principal de la aplicación:

```text
apps/web -> apps/api -> packages/shared -> prisma -> PostgreSQL
```

- `apps/web` consume la API y reutiliza contratos compartidos.
- `apps/api` centraliza autenticación, reglas de negocio, acceso a datos y tareas operativas.
- `packages/shared` evita duplicidad de tipos, esquemas y helpers entre frontend y backend.
- `prisma` contiene el esquema, las migraciones y el seed inicial.

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.
- Base de datos accesible para Prisma.
- Docker y Docker Compose si vas a usar el flujo contenedorizado.

## Inicio rápido

1. Instala dependencias.
2. Copia la configuración de entorno.
3. Genera Prisma y aplica migraciones.
4. Carga seed si necesitas usuarios iniciales o datos de ejemplo.
5. Arranca el entorno de desarrollo.

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Si no necesitas datos iniciales, puedes omitir `npm run db:seed`.

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
- `check:contracts`: `node scripts/check-contracts.mjs`

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

| Variable | Ámbito | Obligatoria | Descripción breve |
| --- | --- | --- | --- |
| `NODE_ENV` | App | Sí | Modo de ejecución. |
| `APP_NAME` | App | Sí | Nombre visible de la aplicación. |
| `APP_URL` | App/Web | Sí | URL pública base usada por la app. |
| `PORT` | API | Sí | Puerto HTTP del backend. |
| `DATABASE_URL` | API/Prisma | Sí | Conexión principal a PostgreSQL. |
| `SESSION_COOKIE_NAME` | API | Sí | Nombre de la cookie de sesión. |
| `SESSION_TTL_DAYS` | API | Sí | Duración de sesión. |
| `COOKIE_SECURE` | API | Sí | Cookies seguras en entornos HTTPS. |
| `CORS_ORIGIN` | API | Sí | Lista de orígenes permitidos para frontend. |
| `BACKUP_DIR` | Operación | Sí | Directorio de salida de backups. |
| `BACKUP_RETENTION_WEEKS` | Operación | Sí | Retención de copias. |
| `BACKUP_SCHEDULE_CRON` | Operación | No | Expresión CRON si hay scheduler externo. |
| `OPENROUTER_API_KEY` | Integraciones | No | Clave para OpenRouter. |
| `OPENROUTER_DEFAULT_MODEL` | Integraciones | No | Modelo principal por defecto. |
| `OPENROUTER_FALLBACK_MODELS` | Integraciones | No | Modelos alternativos. |
| `OPENROUTER_ZDR` | Integraciones | No | Política/flag de tratamiento de datos. |
| `SEED_ADMIN_EMAIL` | Seed | No | Email del admin inicial. |
| `SEED_ADMIN_NAME` | Seed | No | Nombre del admin inicial. |
| `SEED_ADMIN_PASSWORD` | Seed | No | Password del admin inicial. |
| `SEED_MEMBER_EMAIL` | Seed | No | Email del miembro inicial. |
| `SEED_MEMBER_NAME` | Seed | No | Nombre del miembro inicial. |
| `SEED_MEMBER_PASSWORD` | Seed | No | Password del miembro inicial. |

Consulta `docs/environment.md` para el detalle operativo completo.

## Flujo Prisma

### Desarrollo local

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

- Usa `db:generate` cuando cambie el esquema o el cliente de Prisma.
- Usa `db:migrate` para crear/aplicar migraciones en desarrollo.
- Usa `db:seed` solo cuando necesites datos iniciales.

### Despliegue

```bash
npm run build
npm run db:deploy
```

- `db:deploy` aplica migraciones ya versionadas.
- No uses `db:migrate` en producción.
- Ejecuta un backup antes de desplegar cambios de esquema.

## Flujo de validación

Antes de abrir una PR o desplegar, ejecuta este bloque como mínimo:

```bash
npm run check:contracts
npm run check
npm run test
npm run build
```

Si cada workspace incorpora `lint`, añade también `npm run lint` al bloque de validación.

## Contratos compartidos

ToppFinance sigue una regla estricta de contratos: **Zod, tipos Request/Response, enums, helpers monetarios y de fechas compartidos viven exclusivamente en `packages/shared/src/`**.

- Los esquemas Zod se definen en `packages/shared/src/schemas.ts` (o módulos de dominio en shared).
- Los tipos se derivan de los esquemas en `packages/shared/src/types.ts`.
- Las capas de aplicación (`apps/api`, `apps/web`) importan desde `@toppfinance/shared`.
- El script `npm run check:contracts` verifica automáticamente el cumplimiento.
- Consulta `docs/architecture.md` para el detalle completo.

## Docker

Servicios definidos en `docker-compose.yml`:

| Servicio | Rol | Puerto host | Persistencia |
| --- | --- | --- | --- |
| `postgres` | Base de datos PostgreSQL 16 | `5432` | Volumen `postgres-data` |
| `app` | API + frontend servido por backend | `3000` | Bind mount `./backups:/app/backups` |

Arranque base:

```bash
docker compose up --build
```

Notas de operación:

- `app` usa variables desde `.env` y fuerza valores de producción necesarios para el contenedor.
- El entrypoint ejecuta `prisma migrate deploy` antes de arrancar la app.
- Los backups generados dentro del contenedor se guardan en `./backups` del host.

## Backups

Comando manual desde host:

```bash
npm run backup
```

Comando manual en Docker:

```bash
docker compose exec app npm run backup
```

Antes de restaurar o desplegar migraciones importantes, genera y verifica una copia reciente. Consulta `docs/backups.md` para política, formato y restauración.

## Despliegue

Secuencia mínima recomendada:

```bash
npm install
npm run build
npm run db:deploy
```

Después del despliegue, valida al menos healthcheck, login y flujos críticos de negocio. Consulta `docs/deployment.md` y `docs/runbook.md` para checklist completo y rollback.

## Documentación

- `docs/README.md`
- `docs/architecture.md`
- `docs/commands.md`
- `docs/development.md`
- `docs/deployment.md`
- `docs/environment.md`
- `docs/runbook.md`
- `docs/backups.md`
- `docs/csv-import.md`
- `docs/ai-privacy.md`
