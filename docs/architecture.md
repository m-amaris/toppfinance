# Arquitectura

## Resumen

ToppFinance está organizado como un monorepo npm workspaces con separación entre backend, frontend y código compartido. Esta estructura permite mantener contratos comunes y reducir duplicidad entre capas.

## Componentes principales

### apps/api
Backend del sistema. Punto de entrada detectado: `apps/api/src/server.ts`.

Dependencias relevantes detectadas:
- `@fastify/cookie` ^11.0.2
- `@fastify/cors` ^11.1.0
- `@fastify/static` ^9.1.3
- `@node-rs/argon2` ^2.0.2
- `@prisma/client` ^6.13.0
- `@toppfinance/shared` file:../../packages/shared
- `csv-parse` ^5.6.0
- `dotenv` ^17.2.1
- `fastify` ^5.4.0
- `nanoid` ^5.1.5
- `zod` ^3.25.76

### apps/web
Aplicación cliente. Entrypoints detectados:
- `apps/web/src/main.jsx`

Dependencias relevantes detectadas:
- `@toppfinance/shared` file:../../packages/shared
- `lucide-react` ^0.525.0
- `react` ^18.3.1
- `react-dom` ^18.3.1
- `recharts` ^2.15.4

### packages/shared
Paquete compartido para tipos, contratos y utilidades comunes.

Dependencias relevantes detectadas:
- `zod` ^3.25.76

### prisma
Capa de persistencia con esquema, migraciones y seed. Archivo detectado: `prisma/schema.prisma`.

## Workspaces

- `apps/*`
- `packages/*`

## Convenciones recomendadas

- `apps/api`: controladores, servicios, acceso a datos, validación y tests de integración.
- `apps/web`: rutas, features, componentes, hooks y capa de datos.
- `packages/shared`: DTOs, esquemas Zod, tipos, enums, helpers de dinero y fechas.
- `docs`: documentación operativa y de arquitectura.
- `scripts`: tareas de mantenimiento que no pertenecen a un workspace concreto.

## Deuda detectada en baseline

- El punto de entrada documental no explica el flujo completo de onboarding.
- Conviene mantener un mapa claro de variables de entorno y dependencias por workspace.
- Faltaba una documentación raíz que conecte arquitectura, desarrollo, despliegue y operación.
