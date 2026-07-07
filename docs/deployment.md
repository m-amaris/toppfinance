# Despliegue homelab

El MVP esta pensado para acceso por HTTPS mediante Tailscale. La app escucha en el puerto `3000` dentro de Docker.

## Pasos

1. Copia `.env.example` a `.env`.
2. Rellena:
   - `SEED_ADMIN_PASSWORD`
   - `SEED_MEMBER_PASSWORD`
   - `OPENROUTER_API_KEY`
   - `APP_URL` con la URL HTTPS de Tailscale.
3. Arranca:

```bash
docker compose up -d --build
docker compose exec app npm run db:seed
```

## Tailscale HTTPS

Configura Tailscale para publicar `https://...` hacia `http://localhost:3000`. Mantener `COOKIE_SECURE=true` en produccion es correcto porque el navegador ve HTTPS.

## Acceso LAN (HTTP sin Tailscale)

Para acceder desde otro dispositivo en la misma red WiFi/LAN (`http://<IP-LAN>:3000`):

1. En `.env` o `docker-compose.yml`:
   ```env
   COOKIE_SECURE=false
   CORS_ORIGIN=https://toppfinance,http://localhost:5175,http://localhost:3000,http://<TU-IP-LAN>:3000
   ```
2. Rebuild y reinicia:
   ```bash
   docker compose build app && docker compose up -d
   ```

> **Nota**: `COOKIE_SECURE=false` es necesario en HTTP porque los navegadores rechazan cookies `Secure` en conexiones no HTTPS. En produccion con Tailscale/HTTPS, usa `COOKIE_SECURE=true`.

## Backups

Los backups se guardan en `./backups` del proyecto y se montan como `/app/backups` en el contenedor.
