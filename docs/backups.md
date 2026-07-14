# Backups y restauración

## Política MVP

- Frecuencia por defecto: semanal.
- Retención por defecto: 30 semanas.
- Carpeta en host: `./backups`.
- Carpeta en contenedor: `/app/backups`.
- Formato: `pg_dump --format=custom`.

## Cuándo ejecutar un backup

Genera una copia al menos en estos casos:

- Antes de desplegar migraciones Prisma.
- Antes de restaurar datos.
- Antes de importaciones masivas o scripts de mantenimiento.
- Antes de cambios manuales sobre la base de datos.

## Ejecutar backup manual

### Desde host

```bash
npm run backup
```

### Desde Docker

```bash
docker compose exec app npm run backup
```

## Verificación de backups

### Verificar último backup

```bash
npm run backup:verify -- latest
```

### Verificar todos los backups

```bash
npm run backup:verify -- --all
```

### Test restore (validación completa)

Crea una base de datos temporal y restaura para validar integridad:

```bash
npm run backup:verify -- latest --test-restore
```

Esto:
1. Crea BD temporal `toppfinance_verify`
2. Restaura el backup
3. Ejecuta `prisma migrate deploy`
4. Verifica conectividad
5. Limpia la BD temporal

### Listar backups disponibles

```bash
npm run backup:verify -- list
```

Salida:
```
Available backups:
  toppfinance-2024-01-15T03-00-00.dump  45.23 MB  2024-01-15T03:00:12.000Z  status=SUCCESS  checksum=✓
  toppfinance-2024-01-08T03-00-00.dump  43.11 MB  2024-01-08T03:00:10.000Z  status=SUCCESS  checksum=✓
```

## Restauración

### Procedimiento manual (producción)

**⚠️ ADVERTENCIA: Destruye datos actuales. Ejecutar solo con backup previo confirmado.**

```bash
# 1. Detener app
docker compose stop app

# 2. Restaurar backup
npm run backup:restore -- toppfinance-2024-01-15T03-00-00.dump

# 3. Arrancar app (ejecutará migraciones si hace falta)
docker compose start app

# 4. Verificar
curl http://localhost:3000/api/v1/health/ready
```

### Opciones de restore

```bash
# Forzar sin confirmación (para scripts/CI)
npm run backup:restore -- backup.dump --force

# Restaurar a base de datos específica
npm run backup:restore -- backup.dump --target-db=toppfinance_staging

# Saltar backup previo (¡peligroso!)
npm run backup:restore -- backup.dump --skip-pre-backup

# Saltar validación del backup (¡peligroso!)
npm run backup:restore -- backup.dump --skip-validation
```

### Restauración manual con Docker (alternativa)

```bash
docker compose stop app
docker compose exec postgres dropdb -U toppfinance toppfinance
docker compose exec postgres createdb -U toppfinance toppfinance
docker compose exec postgres pg_restore -U toppfinance -d toppfinance /ruta/al/backup.dump
docker compose start app
```

Precauciones:
- Antes de restaurar, conserva una copia del estado actual.
- Verifica que el backup corresponde al entorno correcto.
- Si restauras en local desde Docker, confirma la ruta real del dump dentro del contenedor o monta el archivo en una ruta accesible.
- Después de restaurar, valida login, flujos críticos y consistencia básica de datos.

## Formato y metadatos

Cada backup genera:
- Archivo `.dump` (formato custom de PostgreSQL)
- Registro en tabla `BackupRun` con:
  - `id`: UUID
  - `householdId`: null (global) o ID del household
  - `status`: STARTED | SUCCESS | FAILED
  - `filePath`: ruta absoluta
  - `sizeBytes`: tamaño en bytes
  - `checksum`: SHA256 del archivo
  - `error`: mensaje si falló
  - `startedAt`, `finishedAt`: timestamps

## Verificación de integridad

El script `verify-backup.ts` valida:

1. **Existencia y legibilidad** del archivo.
2. **Checksum SHA256** contra registro en BD.
3. **Estructura válida** con `pg_restore --list`.
4. **Test restore opcional** a BD temporal.
5. **Migraciones aplicables** tras restore.

Criterios de éxito:
- Checksum coincide (si existe en BD).
- `pg_restore --list` lista tablas sin error.
- Test restore crea BD, aplica migraciones, y healthcheck pasa.

## Automatización

### Cron job (host)

```bash
# /etc/cron.d/toppfinance-backup
0 3 * * 0 root cd /opt/toppfinance && npm run backup >> /var/log/toppfinance-backup.log 2>&1
```

### Docker (con scheduler externo)

```yaml
# docker-compose.yml (añadir servicio scheduler)
services:
  scheduler:
    image: bruceforce/cron
    volumes:
      - ./backups:/app/backups
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - CRON_SCHEDULE=0 3 * * 0
      - CRON_COMMAND=docker compose exec -T app npm run backup
```

## Retención

El script `backup.ts` aplica retención automáticamente tras cada backup exitoso:

```typescript
await enforceBackupRetention(config.BACKUP_DIR, config.BACKUP_RETENTION_WEEKS)
```

Elimina archivos `.dump` más antiguos que `BACKUP_RETENTION_WEEKS` (por defecto 30).

Para ajustar:
```bash
# .env
BACKUP_RETENTION_WEEKS=52  # 1 año
```

## Recuperación ante desastres

### Escenario: Pérdida total de BD

1. Provisionar nueva instancia PostgreSQL.
2. Configurar `DATABASE_URL` en `.env`.
3. Ejecutar `npm run db:deploy` (crea esquema vacío).
4. Restaurar backup más reciente:
   ```bash
   npm run backup:restore -- toppfinance-latest.dump --force
   ```
5. Verificar `npm run check` y healthchecks.
6. Comunicar a usuarios si hay ventana de datos perdida (desde último backup).

### Escenario: Corrupción de migración

1. Detectar migración fallida (`prisma migrate deploy` error).
2. No aplicar más migraciones.
3. Restaurar backup pre-migración:
   ```bash
   npm run backup:restore -- toppfinance-pre-migration-2024-01-15.dump --force
   ```
4. Investigar y corregir migración.
5. Re-desplegar con migración corregida.

### Escenario: Rollback de versión app

1. Desplegar versión anterior de imagen/contenedor.
2. Si hubo migraciones en la versión nueva, restaurar backup pre-despliegue.
3. Verificar compatibilidad esquema ↔ código.

## Backup de configuración (no datos)

Además de BD, versionar:

- `docker-compose.yml`
- `.env.example`
- `prisma/schema.prisma`
- `docs/deployment.md`
- `docs/runbook.md`

Estos están en git; no necesitan backup separado.

## Monitoreo de backups

### Alertas recomendadas

- Backup falla → alerta inmediata.
- Backup > 48h sin éxito → alerta crítica.
- Tamaño backup cambia > 50% → revisar.
- Checksum mismatch → alerta crítica (posible corrupción).

### Dashboard queries (ejemplo)

```sql
-- Últimos backups
SELECT * FROM "BackupRun" ORDER BY "startedAt" DESC LIMIT 10;

-- Backups fallidos recientes
SELECT * FROM "BackupRun" WHERE "status" = 'FAILED' AND "startedAt" > NOW() - INTERVAL '7 days';

-- Tamaño promedio último mes
SELECT AVG("sizeBytes") FROM "BackupRun" WHERE "status" = 'SUCCESS' AND "startedAt" > NOW() - INTERVAL '30 days';
```