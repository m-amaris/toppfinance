# Variables de entorno

## Propósito

Este documento centraliza las variables de entorno visibles en `.env.example` para reducir ambigüedad entre API, web y operación.

## Matriz de variables

| Variable | Ámbito | Obligatoria | Ejemplo | Descripción |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | App | Sí | `development` | Modo de ejecución general. |
| `APP_NAME` | App | Sí | `ToppFinance` | Nombre visible de la aplicación. |
| `APP_URL` | App/Web | Sí | `http://localhost:3000` | URL pública base. |
| `PORT` | API | Sí | `3000` | Puerto HTTP del backend. |
| `DATABASE_URL` | API/Prisma | Sí | `postgresql://...` | Conexión principal a PostgreSQL. |
| `SESSION_COOKIE_NAME` | API | Sí | `toppfinance_session` | Nombre de la cookie de sesión. |
| `SESSION_TTL_DAYS` | API | Sí | `365` | Duración de la sesión en días. |
| `COOKIE_SECURE` | API | Sí | `false` | Fuerza cookies seguras en HTTPS. |
| `CORS_ORIGIN` | API | Sí | `http://localhost:3000,http://localhost:5175` | Orígenes permitidos para frontend. |
| `BACKUP_DIR` | Operación | Sí | `./backups` | Ruta de salida de backups. |
| `BACKUP_RETENTION_WEEKS` | Operación | Sí | `30` | Número de semanas a conservar. |
| `BACKUP_SCHEDULE_CRON` | Operación | No | `0 3 * * 0` | Programación si existe scheduler externo. |
| `OPENROUTER_API_KEY` | Integraciones | No | vacío | Clave de acceso a OpenRouter. |
| `OPENROUTER_DEFAULT_MODEL` | Integraciones | No | `openai/gpt-5-mini` | Modelo principal. |
| `OPENROUTER_FALLBACK_MODELS` | Integraciones | No | `anthropic/...` | Lista de modelos alternativos. |
| `OPENROUTER_ZDR` | Integraciones | No | `true` | Flag o política asociada al tratamiento de datos. |
| `SEED_ADMIN_EMAIL` | Seed | No | `admin@example.com` | Email del admin inicial. |
| `SEED_ADMIN_NAME` | Seed | No | `Admin` | Nombre del admin inicial. |
| `SEED_ADMIN_PASSWORD` | Seed | No | vacío | Password del admin inicial. |
| `SEED_MEMBER_EMAIL` | Seed | No | `member@example.com` | Email del usuario miembro inicial. |
| `SEED_MEMBER_NAME` | Seed | No | `Member` | Nombre del usuario miembro inicial. |
| `SEED_MEMBER_PASSWORD` | Seed | No | vacío | Password del usuario miembro inicial. |

## Reglas de mantenimiento

- Toda variable nueva debe añadirse a `.env.example`.
- Toda variable nueva debe documentarse aquí.
- No subir secretos reales al repositorio.
- Mantener separados los valores de local, staging y producción.
- Si una variable cambia el comportamiento de despliegue, debe reflejarse también en `docs/deployment.md` o `docs/runbook.md`.

## Criterios por entorno

### Desarrollo local

- Usa `.env` derivado de `.env.example`.
- `COOKIE_SECURE=false` mientras trabajes en HTTP local.
- `DATABASE_URL` debe apuntar a tu Postgres local o al contenedor `postgres`.

### Docker local

- `docker-compose.yml` inyecta `.env` en el servicio `app`.
- `DATABASE_URL` dentro del contenedor debe resolver el host `postgres`.
- `BACKUP_DIR` dentro del contenedor apunta a `/app/backups` y se mapea a `./backups` del host.

### Producción

- Usa secretos gestionados fuera del repositorio.
- Activa `COOKIE_SECURE=true` si la aplicación expone cookies sobre HTTPS.
- Revisa `CORS_ORIGIN`, `APP_URL` y `DATABASE_URL` antes de ejecutar `npm run db:deploy`.
