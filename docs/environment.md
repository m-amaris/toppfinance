# Variables de entorno

## Propósito

Este documento centraliza las variables de entorno visibles en `.env.example` para reducir ambigüedad entre API, web y operación.

## Aplicación

### Identidad y acceso
- `APP_NAME`: nombre visible de la aplicación.
- `APP_URL`: URL base pública.
- `PORT`: puerto del servicio.
- `NODE_ENV`: modo de ejecución.
- `MODE`: modo de build o ejecución del frontend.

### Base de datos
- `DATABASE_URL`: conexión principal usada por Prisma y backend.

### Seguridad y sesión
- `CORS_ORIGIN`: origen permitido para frontend.
- `COOKIE_SECURE`: fuerza cookies seguras cuando aplica.
- `SESSION_COOKIE_NAME`: nombre de la cookie de sesión.
- `SESSION_TTL_DAYS`: duración de sesión.

### Seed
- `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`: datos del usuario administrador inicial.
- `SEED_MEMBER_NAME`, `SEED_MEMBER_EMAIL`, `SEED_MEMBER_PASSWORD`: datos del usuario miembro inicial.

### Backups
- `BACKUP_DIR`: directorio de salida de backups.
- `BACKUP_RETENTION_WEEKS`: política de retención.
- `BACKUP_SCHEDULE_CRON`: planificación automática si existe scheduler externo.

### Integraciones AI
- `OPENROUTER_API_KEY`: clave de acceso.
- `OPENROUTER_DEFAULT_MODEL`: modelo por defecto.
- `OPENROUTER_FALLBACK_MODELS`: modelos alternativos.
- `OPENROUTER_ZDR`: flag o política asociada a tratamiento de datos.

## Reglas

- Toda variable nueva debe añadirse a `.env.example`.
- Toda variable nueva debe documentarse aquí.
- No subir secretos reales al repositorio.
- Mantener separados los valores de local, staging y producción.
