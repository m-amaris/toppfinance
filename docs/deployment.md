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

## Preview deployments (PR/feature branches)

Para entornos de preview (PRs, ramas feature):

```bash
# 1. Build
npm run build

# 2. Desplegar a entorno de preview (ejemplo con docker-compose)
# Requiere variables de entorno específicas para preview
PREVIEW_DB_URL=postgresql://... \
PREVIEW_APP_URL=https://preview-xyz.toppfinance.app \
docker compose -f docker-compose.yml -f docker-compose.preview.yml up --build -d

# 3. Ejecutar migraciones
docker compose -f docker-compose.yml -f docker-compose.preview.yml exec app npx prisma migrate deploy

# 4. Healthcheck
curl https://preview-xyz.toppfinance.app/api/v1/health/ready

# 5. Limpieza al cerrar PR
docker compose -f docker-compose.yml -f docker-compose.preview.yml down -v
```

Variables específicas de preview (`.env.preview`):
- `DATABASE_URL`: Base de datos aislada por PR
- `APP_URL`: URL pública del preview
- `CORS_ORIGIN`: Origen del preview frontend
- `SESSION_COOKIE_NAME`: Cookie única por preview (ej. `toppfinance_session_pr_123`)
- `BACKUP_DIR`: Directorio aislado (ej. `/app/backups/preview-123`)

## Checklist de release

- [ ] `npm run check` en verde.
- [ ] `npm run test` en verde.
- [ ] `npm run build` en verde.
- [ ] Migraciones revisadas y entendidas.
- [ ] Seed revisado si afecta a entornos nuevos.
- [ ] Rollback definido.
- [ ] Backup verificado (`npm run backup:verify`).
- [ ] Variables de entorno del destino revisadas.
- [ ] Secrets inyectados correctamente (ver `docs/secrets.md`).

Si cada workspace define `lint`, añade `npm run lint` al checklist.

## Validación posterior al despliegue

- [ ] La app responde en el puerto esperado.
- [ ] El login funciona.
- [ ] Los endpoints críticos responden (`/api/v1/health/ready`).
- [ ] La conexión a base de datos es estable.
- [ ] No hay errores de Prisma por migraciones pendientes.
- [ ] Si hubo cambios de esquema, se validan lectura y escritura sobre entidades afectadas.
- [ ] Backups programados funcionando (`npm run backup` manual de prueba).

## Rollback

Ante una incidencia grave:

1. Detén el despliegue.
2. Revierte a la versión anterior de aplicación.
3. Evalúa si hace falta rollback de datos o restauración desde backup.
4. Documenta el incidente y el impacto.

### Rollback de aplicación (Docker)

```bash
# Etiquetar imagen actual como backup
docker tag toppfinance-app:latest toppfinance-app:backup-$(date +%s)

# Desplegar versión anterior
docker compose pull  # si usas registry
docker compose up -d --force-recreate
```

### Rollback de base de datos (restaurar backup)

```bash
# 1. Detener app
docker compose stop app

# 2. Restaurar backup verificado
npm run backup:restore -- backup-file.dump --target-db=toppfinance

# 3. Arrancar app (ejecutará migraciones si hace falta)
docker compose start app

# 4. Verificar
curl http://localhost:3000/api/v1/health/ready
```

## Variables de entorno por entorno

| Variable | Local | Preview | Producción |
|----------|-------|---------|------------|
| `NODE_ENV` | development | production | production |
| `DATABASE_URL` | local postgres | preview DB | prod DB |
| `APP_URL` | http://localhost:3000 | https://pr-123.app | https://app.toppfinance.com |
| `CORS_ORIGIN` | localhost:3000,localhost:5175 | preview URL | prod URL |
| `SESSION_COOKIE_NAME` | toppfinance_session | toppfinance_session_pr_123 | toppfinance_session |
| `COOKIE_SECURE` | false | true | true |
| `BACKUP_DIR` | ./backups | /app/backups/preview-123 | /app/backups |
| `OPENROUTER_API_KEY` | (opcional) | (opcional) | **requerido** |
| `SEED_*_PASSWORD` | solo seed local | no | no |

## Backup antes de deploy con cambios de esquema

```bash
# 1. Backup manual verificado
npm run backup
npm run backup:verify -- latest

# 2. Deploy
npm run build
npm run db:deploy

# 3. Validación post-deploy
curl https://app.toppfinance.com/api/v1/health/ready
```

## Healthchecks

| Endpoint | Uso | Esperado |
|----------|-----|----------|
| `GET /api/v1/health` | Liveness (k8s livenessProbe) | 200 OK, `{ok: true}` |
| `GET /api/v1/health/ready` | Readiness (k8s readinessProbe, LB) | 200 OK si todo sano, 503 si degradado |

Ejemplo k8s:
```yaml
livenessProbe:
  httpGet:
    path: /api/v1/health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /api/v1/health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Secrets management

Ver `docs/secrets.md` para:
- Generación de secrets
- Inyección en CI/CD (GitHub Actions, GitLab CI)
- Rotación de claves
- Auditoría de secretos en historial git