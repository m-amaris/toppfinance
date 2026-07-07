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

## Verificación mínima

Después de cada backup, comprueba:

- Que el archivo se ha generado en el directorio esperado.
- Que la fecha y tamaño son razonables.
- Que la política de retención no ha eliminado copias necesarias.

## Restaurar

No se automatiza restore desde la UI en el MVP porque puede destruir datos. Procedimiento manual:

```bash
docker compose stop app
docker compose exec postgres dropdb -U toppfinance toppfinance
docker compose exec postgres createdb -U toppfinance toppfinance
docker compose exec postgres pg_restore -U toppfinance -d toppfinance /ruta/al/backup.dump
docker compose start app
```

## Precauciones

- Antes de restaurar, conserva una copia del estado actual.
- Verifica que el backup corresponde al entorno correcto.
- Si restauras en local desde Docker, confirma la ruta real del dump dentro del contenedor o monta el archivo en una ruta accesible.
- Después de restaurar, valida login, flujos críticos y consistencia básica de datos.
