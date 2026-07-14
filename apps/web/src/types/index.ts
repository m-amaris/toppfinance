/**
 * Alias de tipos "amigables" para la capa de UI.
 *
 * La capa de presentación trabaja con view-models (TransactionForUI, AccountForUI,
 * CategoryGroup) y el tipo de sesión de shared. Estos alias evitan referencias
 * verbosas y dan un punto único de importación que alinea con el resto del app.
 *
 * La capa de acceso a datos (`src/api/client.ts`, `src/hooks/useQueries.ts`) NO
 * debe usar estos alias: habla directamente en tipos `*Response` / `*Input` de
 * `@toppfinance/shared`, cumpliendo la regla de contratos compartidos.
 *
 * No se define `Settings` aquí: la configuración que consume la UI llega vía el
 * `FinanzasDomainContext` (tipado como `ConfiguracionUI` de shared) y/o el
 * endpoint de settings; ningún archivo importa un tipo local `Settings`.
 */
import type {
  TransactionForUI,
  AccountForUI,
  CategoryGroup,
  SessionUserResponse,
} from '@toppfinance/shared'

/** Movimiento en formato UI (tipo/importe/categoria/fecha…). */
export type Transaction = TransactionForUI

/** Cuenta en formato UI (nombre/saldo/icono/color/tipo). */
export type Account = AccountForUI

/** Categoría en formato UI (id/label/icon/color/type). */
export type Category = CategoryGroup

/** Usuario en sesión. */
export type User = SessionUserResponse
