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

> **Acceso desde otro dispositivo (LAN)**: El `.env.example` ya incluye `CORS_ORIGIN` con IPs comunes (192.168.x.x, 100.x.x.x Tailscale). Si tu IP es distinta, agregala a `CORS_ORIGIN` en `.env` y reinicia `npm run dev:api`.

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

## Flujo de trabajo con Git

### Rama principal
- Rama principal: `master` (protegida en GitHub).
- No se hace push directo a `master`; se usa Pull Request obligatorio.

### Ramas de trabajo
- Una rama por tarea/issue: `feat/<nombre-corto>`, `fix/<nombre-corto>`, `chore/<nombre-corto>`, `docs/<nombre-corto>`.
- Crear rama desde `master` actualizado:
  ```bash
  git checkout master && git pull && git checkout -b feat/nombre-corto
  ```

### Commits
- Conventional Commits (obligatorio):
  - `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `perf:`, `revert:`.
  - Un commit por cambio lógico atómico.
  - Mensaje en imperativo, máx. 72 chars en la primera línea.
  - `Co-Authored-By: Claude <noreply@anthropic.com>` al final del mensaje.

### Pull Requests
- Abrir PR contra `master` tan pronto la rama tenga commits listos.
- Título del PR = tipo de commit + ámbito + descripción breve.
- Descripción: qué cambia, por qué, cómo probar.
- Requerido: CI verde + al menos 1 aprobación.
- Merge: **Squash and merge** (historial limpio en master).
- Borrar rama remota tras merge.

### Comandos habituales
```bash
# Iniciar trabajo
git checkout master && git pull
git checkout -b feat/nueva-funcionalidad

# Commits atómicos
git add -p
git commit -m "feat(scope): descripción breve

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push y abrir PR
git push -u origin feat/nueva-funcionalidad
gh pr create --fill

# Actualizar rama antes de merge
git checkout master && git pull
git checkout feat/nueva-funcionalidad && git rebase master
git push --force-with-lease
```

### Commits generados por Claude
- Usan `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Se squashan en el merge del PR; no se hace push directo a `master`.
