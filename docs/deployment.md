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

## Checklist de release

- `npm run lint` en verde.
- `npm run check` en verde.
- `npm run test` en verde.
- `npm run build` en verde.
- Migraciones revisadas y entendidas.
- Seed revisado si afecta a entornos nuevos.
- Rollback definido.
- Backup verificado.

## Rollback

Ante una incidencia grave:

1. Detén el despliegue.
2. Revierte a la versión anterior de aplicación.
3. Evalúa si hace falta rollback de datos o restauración desde backup.
4. Documenta el incidente y el impacto.

## Notas

Si usas Docker, el comando de arranque base es `docker compose up --build`. Ajusta puertos, secretos y persistencia según el entorno real.
