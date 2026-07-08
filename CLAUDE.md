# CLAUDE.md
See @README.md for project overview.

## Propósito

Este documento resume cómo trabajar en **toppfinance** desde Claude Code y mantiene alineada la documentación operativa con el README. Debe actualizarse cuando cambien la arquitectura del monorepo, los scripts, las variables de entorno, Prisma, Docker o el flujo de despliegue.

## Arquitectura del monorepo

- Gestor de paquetes detectado: **npm**.
- Workspaces declarados en la raíz: **['apps/*', 'packages/*']**.
- La raíz centraliza dependencias compartidas y orquesta tareas globales; cada app o paquete conserva sus scripts propios en su `package.json`.

### Scripts de la raíz

- `dev`: `concurrently -n api,web -c cyan,green "npm run dev -w @toppfinance/api" "npm run dev -w @toppfinance/web"`
- `dev:api`: `npm run dev -w @toppfinance/api`
- `dev:web`: `npm run dev -w @toppfinance/web`
- `build`: `npm run build -w @toppfinance/shared && npm run build -w @toppfinance/api && npm run build -w @toppfinance/web`
- `test`: `npm run test --workspaces --if-present`
- `check`: `npm run check --workspaces --if-present`
- `lint`: `npm run lint --workspaces --if-present`
- `check:contracts`: `node scripts/check-contracts.mjs`
- `db:generate`: `prisma generate`
- `db:migrate`: `prisma migrate dev`
- `db:deploy`: `prisma migrate deploy`
- `db:seed`: `npm run build -w @toppfinance/shared && tsx prisma/seed.ts`
- `backup`: `npm run build -w @toppfinance/shared && npm run build -w @toppfinance/api && tsx scripts/backup.ts`
- `preview`: `npm run preview -w @toppfinance/web`

### Workspaces detectados

| Ruta | Nombre del paquete | Scripts |
|---|---|---|
| `apps/api` | `@toppfinance/api` | dev, build, start, test, check |
| `apps/web` | `@toppfinance/web` | dev, build, preview, test, check |
| `packages/shared` | `@toppfinance/shared` | build, check |

## Regla de contratos compartidos

**Zod, tipos Request/Response, enums, helpers monetarios y de fechas compartidos viven exclusivamente en `packages/shared/src/`.**

- Todo esquema Zod que valide datos entre API y frontend se define en `packages/shared/src/schemas.ts` (o un módulo de dominio en shared).
- `zod` no se importa directamente en `apps/api/` o `apps/web/` salvo para `z.object({...})` inline en parámetros de ruta.
- Los tipos `*Input`, `*Response`, `*Body` se definen en `packages/shared/src/types.ts`.
- Toda lógica monetaria reutilizable (redondeo, formato, aritmética) sale de `packages/shared/src/money.ts`.
- Toda lógica de fechas reutilizable sale de `packages/shared/src/date.ts`.
- Las capas de aplicación importan desde `@toppfinance/shared`, no duplican ni re-exportan desde módulos locales.
- El script `scripts/check-contracts.mjs` verifica automáticamente estas reglas (`npm run check:contracts`).
- Consulta `docs/architecture.md` para el detalle completo de la regla.

## Flujo de trabajo

1. Instalar dependencias desde la raíz con el gestor de paquetes del repositorio.
2. Ejecutar desde la raíz los scripts agregados del monorepo cuando afecten a varios workspaces.
3. Ejecutar en el workspace correspondiente los comandos específicos de cada aplicación o paquete.
4. Antes de fusionar cambios, validar como mínimo lint, typecheck, tests y build en los workspaces afectados.

## Variables de entorno

Archivos `.env.example` detectados:
- `.env.example`

Reglas:
- Nunca añadir secretos reales al repositorio.
- Mantener un `.env.example` actualizado por cada app o servicio que dependa de configuración.
- Documentar en README y en este archivo cualquier variable nueva, indicando si aplica a local, Docker, CI o producción.
- Mantener consistencia entre variables de aplicación, Prisma, contenedores y despliegue.

## Prisma

Esquemas detectados:
- `prisma/schema.prisma`

Flujo recomendado:
1. Editar el `schema.prisma` en el workspace afectado.
2. Crear migraciones de desarrollo con `prisma migrate dev` o con el script equivalente del workspace.
3. Regenerar el cliente con `prisma generate` si el flujo del workspace no lo hace automáticamente.
4. Aplicar en despliegue con `prisma migrate deploy`.
5. No modificar migraciones ya ejecutadas en entornos compartidos salvo estrategia explícita de rollback.

## Docker

Ficheros Docker detectados:
- `Dockerfile`
- `docker-compose.yml`

Pautas:
- Levantar servicios desde la raíz cuando exista dependencia entre apps, base de datos o volúmenes compartidos.
- Alinear puertos, redes, volúmenes y variables de entorno con lo documentado en README.
- Si una imagen depende de artefactos compilados, ejecutar install/build antes de construirla.
- Evitar duplicar configuración entre entorno local y Docker sin dejar trazabilidad en la documentación.

## Backup

Buenas prácticas:
- Definir qué se respalda: bases de datos, adjuntos, exports y cualquier estado persistente.
- Ejecutar backup antes de migraciones destructivas o cambios relevantes de infraestructura.
- Versionar scripts de backup y restauración si forman parte del proyecto.
- Probar restauraciones de forma periódica.

## Despliegue

Checklist mínima:
1. Instalar dependencias limpias.
2. Ejecutar lint, typecheck, tests y build en la raíz y en los workspaces afectados.
3. Aplicar migraciones de base de datos de manera controlada.
4. Construir imágenes o artefactos finales.
5. Desplegar al entorno objetivo.
6. Verificar healthchecks, logs, conectividad y tareas post-deploy.

## Reglas para asistentes

- Revisar siempre el `package.json` del workspace antes de proponer comandos.
- Revisar impacto de datos antes de tocar Prisma o migraciones.
- Revisar dependencias cruzadas antes de tocar Docker o despliegue.
- Reflejar en README y en este archivo cualquier cambio de arquitectura, scripts o variables.
- Priorizar cambios pequeños, reversibles y fáciles de validar.
