# Runbook operativo

## Checklist diario de desarrollo

- `npm install` actualizado si hubo cambios en dependencias.
- `.env` alineado con `.env.example`.
- `npm run dev` levanta API y web correctamente.
- No hay errores pendientes de migraciones Prisma.

## Checklist antes de merge

- `npm run lint` en verde.
- `npm run check` en verde.
- `npm run test` en verde.
- `npm run build` en verde.
- Documentación actualizada si cambian scripts, arquitectura o variables.

## Checklist antes de despliegue

- Backup reciente y verificable.
- Variables del entorno objetivo revisadas.
- `npm run db:deploy` planificado.
- Procedimiento de rollback claro.
- Validación posterior al despliegue definida.

## Incidencias típicas

### El proyecto no arranca
- Revisar `.env`.
- Revisar acceso a base de datos.
- Revisar si Prisma necesita `db:generate` o migraciones.

### El build falla
- Revisar cambios en `packages/shared`.
- Revisar compatibilidad entre API y web.
- Ejecutar `npm run check` para detectar roturas de tipos.

### Un despliegue rompe datos
- Detener cambios adicionales.
- Verificar migración aplicada.
- Evaluar rollback o restauración desde backup.
- Documentar el incidente.
