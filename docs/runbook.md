# Runbook Operativo

## Checklist diario de desarrollo

- [ ] `npm install` actualizado si hubo cambios en dependencias.
- [ ] `.env` alineado con `.env.example`.
- [ ] `npm run dev` levanta API y web correctamente.
- [ ] No hay errores pendientes de migraciones Prisma.
- [ ] Si cambió el esquema, se ha ejecutado `npm run db:generate`.

## Checklist antes de merge

- [ ] `npm run check` en verde.
- [ ] `npm run test` en verde.
- [ ] `npm run build` en verde.
- [ ] Documentación actualizada si cambian scripts, arquitectura o variables.

Si cada workspace define `lint`, añade `npm run lint`.

## Checklist antes de despliegue

- [ ] Backup reciente y verificable (`npm run backup && npm run backup:verify -- latest`).
- [ ] Variables del entorno objetivo revisadas.
- [ ] `npm run db:deploy` planificado.
- [ ] Procedimiento de rollback claro.
- [ ] Validación posterior al despliegue definida.
- [ ] Cambios de esquema revisados con impacto funcional conocido.
- [ ] Secrets inyectados correctamente (ver `docs/secrets.md`).

## Preview Deployments (PRs)

Para cada PR, se crea un entorno preview aislado:

```bash
# 1. Build
npm run build

# 2. Desplegar preview con base de datos aislada
PREVIEW_DB_URL=postgresql://preview:pass@preview-db:5432/toppfinance_pr_123 \
PREVIEW_APP_URL=https://pr-123.preview.toppfinance.app \
docker compose -f docker-compose.yml -f docker-compose.preview.yml up --build -d

# 3. Migraciones
docker compose -f docker-compose.yml -f docker-compose.preview.yml exec app npx prisma migrate deploy

# 4. Healthcheck
curl https://pr-123.preview.toppfinance.app/api/v1/health/ready

# 5. Limpieza al cerrar PR
docker compose -f docker-compose.yml -f docker-compose.preview.yml down -v
```

Variables específicas de preview:
- `DATABASE_URL`: BD aislada por PR
- `APP_URL`: URL pública del preview
- `CORS_ORIGIN`: Origen del preview frontend
- `SESSION_COOKIE_NAME`: Cookie única por preview
- `BACKUP_DIR`: Directorio aislado

## Incidencias típicas

### El proyecto no arranca

- Revisar `.env`.
- Revisar acceso a base de datos.
- Revisar si Prisma necesita `db:generate` o migraciones.
- Revisar si el puerto configurado está ocupado.

### El build falla

- Revisar cambios en `packages/shared`.
- Revisar compatibilidad entre API y web.
- Ejecutar `npm run check` para detectar roturas de tipos.

### El contenedor arranca pero la app no responde

- Revisar logs de `app` y `postgres`.
- Confirmar que `DATABASE_URL` apunta al host correcto.
- Confirmar que `prisma migrate deploy` no ha fallado en el entrypoint.

### Un despliegue rompe datos

1. Detener cambios adicionales.
2. Verificar migración aplicada.
3. Evaluar rollback o restauración desde backup.
4. Documentar el incidente.

### Healthcheck falla

```bash
# Liveness check
curl http://localhost:3000/api/v1/health

# Readiness check (detallado)
curl http://localhost:3000/api/v1/health/ready

# Ver logs
docker compose logs app
docker compose logs postgres
```

Si readiness falla:
- DB down → revisar postgres
- Prisma client error → revisar migraciones
- Web assets missing → rebuild con `npm run build`

## Procedimientos de backup

### Backup manual

```bash
# Desde host
npm run backup

# Desde Docker
docker compose exec app npm run backup
```

### Verificación de backup

```bash
# Verificar último backup
npm run backup:verify -- latest

# Verificar todos
npm run backup:verify -- --all

# Test restore (crea BD temporal)
npm run backup:verify -- latest --test-restore
```

### Restauración

```bash
# ¡CUIDADO! Destruye datos actuales
npm run backup:restore -- toppfinance-2024-01-15T03-00-00.dump

# Con confirmación forzada
npm run backup:restore -- toppfinance-2024-01-15T03-00-00.dump --force

# Restaurar a BD específica
npm run backup:restore -- toppfinance-2024-01-15T03-00-00.dump --target-db=toppfinance_staging
```

### Política de retención

- Frecuencia: semanal (domingos 03:00)
- Retención: 30 semanas
- Directorio host: `./backups`
- Directorio contenedor: `/app/backups`
- Formato: `pg_dump --format=custom`

## Procedimientos de migración

### Desarrollo

```bash
# 1. Editar prisma/schema.prisma
# 2. Crear migración
npm run db:migrate
# 3. Regenerar cliente (si no lo hace la migración)
npm run db:generate
```

### Producción

```bash
# 1. Backup ANTES
npm run backup
npm run backup:verify -- latest

# 2. Build
npm run build

# 3. Deploy migraciones
npm run db:deploy

# 4. Verificar
curl https://app.toppfinance.com/api/v1/health/ready
```

### Rollback de migración

```bash
# 1. Detener app
docker compose stop app

# 2. Restaurar backup pre-migración
npm run backup:restore -- toppfinance-pre-migration-2024-01-15.dump --force

# 3. Desplegar versión anterior de app
docker compose up -d app

# 4. Verificar
curl https://app.toppfinance.com/api/v1/health/ready
```

## Rotación de secretos

| Secreto | Frecuencia | Procedimiento |
|---------|------------|---------------|
| `DATABASE_URL` | 90 días / compromiso | 1. Generar nueva password en PG. 2. Actualizar en gestor secretos. 3. Reiniciar app. |
| `OPENROUTER_API_KEY` | Según proveedor | 1. Rotar en OpenRouter. 2. Actualizar en gestor secretos. 3. Reiniciar app. |
| `SESSION_COOKIE_NAME` | Raramente | Cambiar nombre → todos usuarios deslogueados. |
| Seed passwords | Una vez (setup) | No rotar tras seed inicial. |

## Auditoría de secretos en git

```bash
# Buscar commits que tocaron .env
git log --all --full-history -- .env

# Buscar secretos en historial (requiere git-secrets o truffleHog)
git secrets --scan-history
# o
trufflehog git file://. --since-commit=HEAD~100

# Verificar .gitignore
cat .gitignore | grep -E '^\.env'
```

## Monitoreo y alertas

### Métricas clave a vigilar

- **API latency**: p95 < 500ms
- **Error rate**: < 1% (5xx)
- **DB connections**: < 80% pool
- **Backup success**: daily check
- **Disk space**: > 20% free

### Logs importantes

```bash
# Logs de aplicación
docker compose logs -f app | grep -E "(ERROR|WARN)"

# Logs de auditoría (via API)
curl -H "Cookie: session=..." https://app.toppfinance.com/api/v1/admin/audit-logs

# Logs de backup
docker compose logs app | grep -i backup
```

## Escalado

### Vertical (más recursos)

```yaml
# docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### Horizontal (múltiples instancias)

- Requiere: session store compartido (Redis), load balancer, sticky sessions o JWT stateless.
- Migración futura: mover sesiones de cookie a JWT + Redis.

## Contactos y escalación

| Nivel | Contacto | Canal |
|-------|----------|-------|
| L1 (dev) | Equipo desarrollo | Slack #toppfinance-dev |
| L2 (ops) | Platform team | Slack #toppfinance-ops |
| L3 (emergencia) | On-call | PagerDuty / Teléfono |

## Post-mortem template

Tras incidente severo:

1. **Qué pasó**: Resumen cronológico.
2. **Impacto**: Usuarios afectados, datos perdidos, downtime.
3. **Causa raíz**: Análisis 5-whys.
4. **Acciones correctivas**: Inmediatas y preventivas.
5. **Timeline**: Detección → diagnóstico → resolución.
6. **Follow-up**: Tickets creados, due dates.