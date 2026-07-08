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

## Reglas de contratos compartidos

Para mantener el contrato entre capas realmente único, se aplican las siguientes reglas:

### Zod solo en packages/shared

- TODO esquema Zod que valide datos compartidos entre API y frontend **debe** definirse en `packages/shared/src/schemas.ts`.
- Los esquemas de dominio específico (CSV, config, etc.) pueden vivir en su propio módulo dentro de `packages/shared/src/` (ej: `csv.ts`, `config.ts`).
- **Nunca** se debe importar `zod` directamente en `apps/api/` o `apps/web/` para definir esquemas compartidos. El uso de `z.object({...})` inline para parsear parámetros de ruta está permitido (es lógica de controlador, no contrato compartido).
- `zod` solo aparece como dependencia directa en `packages/shared/package.json`.

### Tipos Request/Response solo en packages/shared

- Todos los tipos `*Input`, `*Response`, `*Body` que representen el contrato entre API y frontend se definen en `packages/shared/src/types.ts` (derivados de esquemas Zod) o `packages/shared/src/auth.ts` (tipos de sesión/autenticación no derivables).
- No debe haber tipos Request/Response duplicados en `apps/api/` o `apps/web/`.
- Las excepciones son tipos puramente de UI (ej: `AccountForUI`, `TransactionForUI`) que residen en `packages/shared/src/types.ts` cuando se reutilizan entre hooks y componentes.

### Helpers monetarios y de fechas centralizados

- Toda lógica de redondeo, formateo y aritmética monetaria reutilizable **debe** salir de `packages/shared/src/money.ts`.
- Toda lógica de manipulación de fechas (formatos ISO, claves de mes, rangos) **debe** salir de `packages/shared/src/date.ts`.
- Las capas de aplicación pueden importar estos helpers desde `@toppfinance/shared`, no duplicarlos localmente.

### Verificación automática

El script `scripts/check-contracts.mjs` verifica estas reglas:
1. No hay `import { z } from 'zod'` fuera de `packages/shared/src/`.
2. No hay `require('@toppfinance/shared')` (debe usarse `import`).
3. No hay funciones compartidas importadas desde módulos locales (`./finance`, etc.) cuando existen en `@toppfinance/shared`.

Ejecutar con `npm run check:contracts`. Está integrado en el flujo de CI/validación.

## Deuda detectada en baseline

- El punto de entrada documental no explica el flujo completo de onboarding.
- Conviene mantener un mapa claro de variables de entorno y dependencias por workspace.
- Faltaba una documentación raíz que conecte arquitectura, desarrollo, despliegue y operación.
