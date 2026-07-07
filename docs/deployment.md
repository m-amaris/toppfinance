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

## Backups

Los backups se guardan en `./backups` del proyecto y se montan como `/app/backups` en el contenedor.
