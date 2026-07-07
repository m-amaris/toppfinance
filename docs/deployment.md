# Despliegue

## Objetivo

Este documento resume el flujo mínimo de despliegue para ToppFinance y actúa como checklist operativo.

## Requisitos previos

- Variables de entorno configuradas en el entorno de destino.
- Base de datos accesible desde la API.
- Build local validada con `npm run build`.
- Migraciones Prisma revisadas.
- Backup reciente disponible antes de cambios de esquema.

## Secuencia mínima

1. Instala dependencias.
2. Configura variables de entorno.
3. Ejecuta `npm run build`.
4. Ejecuta `npm run db:deploy`.
5. Arranca o reinicia servicios.
6. Comprueba healthcheck, login y flujos críticos.

## Flujo recomendado fuera de Docker

```bash
npm install
npm run check
npm run test
npm run build
npm run db:deploy
```

Notas:

- `db:deploy` aplica migraciones ya versionadas.
- No uses `npm run db:migrate` en producción.
- Ejecuta `npm run db:seed` solo si estás preparando un entorno nuevo y sabes qué datos iniciales deben existir.

## Flujo recomendado con Docker Compose

```bash
docker compose up --build -d
```

Notas:

- El contenedor `app` ejecuta `prisma migrate deploy` en el entrypoint.
- `postgres` mantiene su persistencia en el volumen `postgres-data`.
- Los backups quedan accesibles desde `./backups` del host.

## Checklist de release

- `npm run check` en verde.
- `npm run test` en verde.
- `npm run build` en verde.
- Migraciones revisadas y entendidas.
- Seed revisado si afecta a entornos nuevos.
- Rollback definido.
- Backup verificado.
- Variables de entorno del destino revisadas.

Si cada workspace define `lint`, añade `npm run lint` al checklist.

## Validación posterior al despliegue

- La app responde en el puerto esperado.
- El login funciona.
- Los endpoints críticos responden.
- La conexión a base de datos es estable.
- No hay errores de Prisma por migraciones pendientes.
- Si hubo cambios de esquema, se validan lectura y escritura sobre entidades afectadas.

## Rollback

Ante una incidencia grave:

1. Detén el despliegue.
2. Revierte a la versión anterior de aplicación.
3. Evalúa si hace falta rollback de datos o restauración desde backup.
4. Documenta el incidente y el impacto.

## Notas

Usa `docs/backups.md` junto a este documento cuando el despliegue incluya cambios de esquema, importaciones masivas o tareas que afecten a datos persistidos.
