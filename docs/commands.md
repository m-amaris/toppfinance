# Comandos

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

## apps/api

- `dev`: `npm run build -w @toppfinance/shared && tsx watch src/server.ts`
- `build`: `tsc -p tsconfig.json`
- `start`: `node dist/server.js`
- `test`: `vitest run --passWithNoTests`
- `check`: `npm run build -w @toppfinance/shared && tsc -p tsconfig.json --noEmit`

## apps/web

- `dev`: `vite --host 0.0.0.0 --port 5175`
- `build`: `vite build`
- `preview`: `vite preview --host 0.0.0.0 --port 4175`
- `test`: `vitest run`
- `check`: `vite build`

## packages/shared

- `build`: `tsc -p tsconfig.json`
- `check`: `tsc -p tsconfig.json --noEmit`

## Secuencias recomendadas

### Onboarding base

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

### Onboarding con datos iniciales

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

### Validación local

```bash
npm run check
npm run test
npm run build
```

Si los workspaces definen `lint`, añade también `npm run lint`.

### Flujo Prisma en desarrollo

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

### Flujo Prisma en despliegue

```bash
npm run build
npm run db:deploy
```

### Operación de base de datos

```bash
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:seed
```

## Notas

- `db:migrate` está pensado para desarrollo local.
- `db:deploy` aplica migraciones versionadas en entornos desplegados.
- `backup` compila `shared` y `api` antes de lanzar la tarea de copia.
- `preview` solo aplica a `apps/web`.
