# Runbook operativo

## Checklist diario de desarrollo

- `npm install` actualizado si hubo cambios en dependencias.
- `.env` alineado con `.env.example`.
- `npm run dev` levanta API y web correctamente.
- No hay errores pendientes de migraciones Prisma.
- Si cambió el esquema, se ha ejecutado `npm run db:generate`.

## Checklist antes de merge

- `npm run check` en verde.
- `npm run test` en verde.
- `npm run build` en verde.
- Documentación actualizada si cambian scripts, arquitectura o variables.

Si cada workspace define `lint`, añade `npm run lint`.

## Checklist antes de despliegue

- Backup reciente y verificable.
- Variables del entorno objetivo revisadas.
- `npm run db:deploy` planificado.
- Procedimiento de rollback claro.
- Validación posterior al despliegue definida.
- Cambios de esquema revisados con impacto funcional conocido.

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
- Detener cambios adicionales.
- Verificar migración aplicada.
- Evaluar rollback o restauración desde backup.
- Documentar el incidente.
