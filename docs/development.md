# Desarrollo

## Objetivo

Este documento define el flujo estándar de desarrollo local para ToppFinance y sirve como referencia única para onboarding técnico.

## Requisitos

- Node.js 20+
- npm 10+
- Docker opcional
- Acceso a la base de datos usada por Prisma

## Primer arranque

1. Clona el repositorio.
2. Ejecuta `npm install`.
3. Copia `.env.example` a `.env`.
4. Ejecuta `npm run db:generate`.
5. Ejecuta `npm run db:migrate`.
6. Si necesitas datos base, ejecuta `npm run db:seed`.
7. Inicia el desarrollo con `npm run dev`.

## Comandos de trabajo

- `npm run dev`: levanta API y web en paralelo.
- `npm run dev:api`: ejecuta solo backend.
- `npm run dev:web`: ejecuta solo frontend.
- `npm run lint`: ejecuta lint de todos los workspaces.
- `npm run check`: ejecuta chequeos definidos por workspace.
- `npm run test`: ejecuta tests definidos por workspace.
- `npm run build`: compila shared, API y web.

## Flujo de cambios recomendado

1. Actualiza contratos compartidos en `packages/shared` si afectan a más de una capa.
2. Implementa backend y frontend manteniendo compatibilidad de tipos.
3. Ejecuta `npm run lint`, `npm run check` y `npm run test` antes de abrir PR.
4. Ejecuta `npm run build` antes de publicar o desplegar.

## Prisma

- `npm run db:generate`: regenera el cliente Prisma.
- `npm run db:migrate`: aplica migraciones en desarrollo.
- `npm run db:deploy`: aplica migraciones para despliegue.
- `npm run db:seed`: carga datos iniciales.

## Qué revisar cuando algo falla

- Variables `.env` incompletas o inconsistentes.
- Base de datos inaccesible o sin migraciones aplicadas.
- Desajustes entre `packages/shared`, API y web.
- Build roto en alguno de los workspaces.
