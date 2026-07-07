# Desarrollo local

## Requisitos

- Node.js 22 o superior.
- Docker Desktop para levantar PostgreSQL.
- `pg_dump` si quieres ejecutar backups fuera de Docker.

## Configuracion

1. Copia `.env.example` a `.env`.
2. Rellena `SEED_ADMIN_PASSWORD` y `SEED_MEMBER_PASSWORD`.
3. Pon `OPENROUTER_API_KEY` solo en `.env`; no la escribas en codigo.

Para desarrollo desde host usa:

```bash
DATABASE_URL=postgresql://toppfinance:toppfinance@localhost:5432/toppfinance?schema=public
COOKIE_SECURE=false
```

## Arranque

```bash
docker compose up -d postgres
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Frontend: `http://localhost:5175`  
API: `http://localhost:3000/api/health`

## Usuarios iniciales

- Admin: `miguel.amaris.martos@gmail.com`
- Miembro: `sara.gonzalezperegrina@gmail.com`

Las contrasenas vienen de `.env`, no del repositorio.
