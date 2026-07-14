# Gestión de Secretos

## Principios

1. **Nunca** commits secretos reales al repositorio.
2. Usa `.env.example` como plantilla; cada entorno tiene su `.env` local (ignorado por git).
3. En CI/CD y producción, inyecta secretos desde el gestor de secretos de la plataforma (GitHub Actions secrets, GitLab CI variables, AWS Secrets Manager, Vault, etc.).
4. Rota secretos periódicamente y tras incidentes de seguridad.

## Variables consideradas secretos

| Variable | Descripción | Rotación |
|----------|-------------|----------|
| `DATABASE_URL` | Conexión a PostgreSQL (contiene password) | 90 días |
| `SESSION_COOKIE_NAME` | Nombre cookie de sesión | Baja prioridad |
| `OPENROUTER_API_KEY` | Clave API para IA | 90 días |
| `SEED_ADMIN_PASSWORD` | Password admin inicial | Solo seed |
| `SEED_MEMBER_PASSWORD` | Password miembro inicial | Solo seed |
| `RATE_LIMIT_ALLOWLIST` | IPs exentas de rate limit | Según necesidad |

## Archivos de entorno

```
.env                    # Local development (gitignored)
.env.example            # Plantilla (committed)
.env.production         # Producción (gitignored, solo en servidor/CI)
.env.preview            # Preview deployments (gitignored)
```

## Generación de secretos

```bash
# Generar password seguro (24 chars)
npm run secrets generate

# O manualmente:
# openssl rand -base64 32 | tr -d "=+/" | cut -c1-24
# node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Inyección en CI/CD

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
  SESSION_COOKIE_NAME: toppfinance_session
  COOKIE_SECURE: "true"

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Deploy
        run: |
          # Deploy logic (Docker, SSH, etc.)
          # Secrets available as env vars
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

### Docker Compose (producción)

```yaml
# docker-compose.prod.yml
services:
  app:
    env_file:
      - .env.production  # Solo en servidor, no en repo
    environment:
      # Secrets sensibles via env_file, no en compose
      - DATABASE_URL
      - OPENROUTER_API_KEY
```

### Kubernetes

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: toppfinance-secrets
type: Opaque
stringData:
  DATABASE_URL: "postgresql://..."
  OPENROUTER_API_KEY: "sk-or-..."
  SESSION_COOKIE_NAME: "toppfinance_session"
---
# k8s/deployment.yaml
envFrom:
  - secretRef:
      name: toppfinance-secrets
```

## Verificación de gitignore

```bash
npm run secrets check-gitignore
```

Debe confirmar:
- `.env` ignorado
- `.env.*` ignorado
- `!.env.example` permitido

## Auditoría de secretos en historial

```bash
# Buscar archivos .env en todo el historial
git log --all --full-history -- .env
git log --all --full-history -- .env.production
git log --all --full-history -- .env.preview

# Con git-secrets (si instalado)
git secrets --scan-history

# Con truffleHog
trufflehog git file://. --since-commit $(git rev-list --max-parents=0 HEAD)
```

Si se encuentra un secreto en el historial:
1. **Rotar inmediatamente** el secreto comprometido.
2. Usar `git filter-repo` o BFG Repo-Cleaner para purgar del historial.
3. Forzar push a todas las ramas afectadas.
4. Notificar a equipos afectados.

## Rotación de secretos

### Database password

```bash
# 1. Generar nuevo password
NEW_PASS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

# 2. Actualizar en PostgreSQL
psql -c "ALTER USER toppfinance PASSWORD '$NEW_PASS';"

# 3. Actualizar secreto en gestor (GitHub Actions, Vault, etc.)
# 4. Desplegar con nueva DATABASE_URL
# 5. Verificar healthcheck
curl https://app.toppfinance.com/api/v1/health/ready
```

### OpenRouter API Key

```bash
# 1. Crear nueva key en https://openrouter.ai/keys
# 2. Actualizar en gestor de secretos
# 3. Desplegar
# 4. Revocar key antigua en OpenRouter
```

### Session cookie secret (rotación suave)

Cambiar `SESSION_COOKIE_NAME` invalida todas las sesiones activas (logout forzado).

```bash
# 1. Nuevo nombre
SESSION_COOKIE_NAME=toppfinance_session_v2

# 2. Desplegar
# 3. Usuarios harán login de nuevo automáticamente
```

## Checklist de seguridad

- [ ] `.gitignore` excluye `.env`, `.env.*`, incluye `!.env.example`
- [ ] No hay secretos en `docker-compose.yml` (usar `env_file`)
- [ ] CI/CD usa variables de entorno secretas, no hardcodeadas
- [ ] Secrets rotados en últimos 90 días
- [ ] Auditoría de historial git limpia
- [ ] Documentación de rotación actualizada
- [ ] Plan de respuesta a incidente de secreto comprometido