# Backups y restauracion

## Politica MVP

- Frecuencia por defecto: semanal.
- Retencion por defecto: 30 semanas.
- Carpeta: `./backups`.
- Formato: `pg_dump --format=custom`.

## Ejecutar backup manual

Desde host:

```bash
npm run backup
```

Desde Docker:

```bash
docker compose exec app npm run backup
```

## Restaurar

No se automatiza restore desde la UI en el MVP porque puede destruir datos. Procedimiento manual:

```bash
docker compose stop app
docker compose exec postgres dropdb -U toppfinance toppfinance
docker compose exec postgres createdb -U toppfinance toppfinance
docker compose exec postgres pg_restore -U toppfinance -d toppfinance /ruta/al/backup.dump
docker compose start app
```

Antes de restaurar, conserva una copia del estado actual.
