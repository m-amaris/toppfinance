# CSV de importación

Formato objetivo: UTF-8 con delimitador `;`.

Cabecera:

```csv
date;type;amount_eur;description;source_account;destination_account;category;visibility;paid_by_email;beneficiary_split;merchant;tags;notes;external_id
```

Ejemplo:

```csv
2026-07-01;GASTO;-42,30;Supermercado;Cuenta personal Miguel;;Alimentacion;PRIVATE;miguel.amaris.martos@gmail.com;miguel.amaris.martos@gmail.com=100;Mercadona;comida;Compra semanal;bank-123
2026-07-03;GASTO;-80,00;Cena;Cuenta personal Miguel;;Ocio;SHARED;miguel.amaris.martos@gmail.com;miguel.amaris.martos@gmail.com=50|sara.gonzalezperegrina@gmail.com=50;Restaurante;ocio;Visible para ambos;bank-125
```

## Pipeline de importación

Toda fila del CSV pasa por un pipeline compartido definido en `packages/shared/src/`:

```
parseCsvRows → normalizeCsvRow → buildImportDraft → computeImportFingerprint → classifyImportRow
```

- Las fases 1–4 son funciones **puras** sin acceso a base de datos.
- La fase 5 (clasificación) recibe datos de BD inyectados por la API.
- Preview y commit usan exactamente las mismas reglas.

## Vocabulario

| Término | Significado |
|---|---|
| `raw csv row` | Fila sin procesar del CSV |
| `normalized row` | Fila con valores parseados y normalizados |
| `import draft` | Transacción lista para validar contra Zod |
| `duplicate exact` | Fingerprint coincide exactamente con una transacción existente |
| `duplicate candidate` | Mismo importe y fecha cercana, pero sin fingerprint exacto |
| `import fingerprint` | Hash SHA-256 determinista de campos normalizados |
| `idempotency key` | Clave única: `external_id` o `fingerprint` |
| `blocking error` | Error que impide importar la fila |
| `warning` | Problema no bloqueante |

## API

### Preview

`POST /api/imports/csv/preview`

```json
{
  "fileName": "movimientos.csv",
  "content": "date;type;amount_eur;description\n2026-07-01;GASTO;-42,30;Supermercado",
  "defaultSourceAccountId": "opcional",
  "defaultDestinationAccountId": "opcional"
}
```

Devuelve un `importBatch`, resumen y filas clasificadas. Cada fila incluye:

- `reconciliation.classification`: `new` | `duplicate_exact` | `duplicate_candidate`
- `errors[]`: errores bloqueantes
- `warnings[]`: avisos no bloqueantes
- `fingerprint`: hash determinista de la fila
- `idempotencyKey`: clave de idempotencia usada
- `suggestedAction`: `import` | `skip` | `review`

### Commit

`POST /api/imports/csv/:id/commit`

```json
{
  "includeDuplicates": false,
  "rows": [
    {
      "rowNumber": 2,
      "sourceHash": "...",
      "draft": { "type": "EXPENSE" }
    }
  ]
}
```

Con `includeDuplicates: false`, las filas `duplicate_exact` se omiten. Con `true`, también se importan.

## Idempotencia

La estrategia de idempotencia es jerárquica:

1. Si la fila tiene `external_id`, se usa como clave natural dentro del household. La BD tiene un índice único `(householdId, externalId)`.
2. Si no tiene `external_id`, se genera un **fingerprint** SHA-256 determinista a partir de: `{date, type, amountCents, description, sourceAccount, destinationAccount, merchant}`.
3. El fingerprint también tiene índice único en BD: `(householdId, fingerprint)`.

Esto garantiza que reimportar el mismo CSV no genere duplicados, incluso si cambian campos no relevantes (notas, tags).

## Cabeceras aceptadas

Además de la cabecera objetivo, el importador reconoce alias habituales:

- Fecha: `date`, `fecha`, `booking_date`.
- Tipo: `type`, `tipo`.
- Importe: `amount_eur`, `amount`, `importe`, `cantidad`.
- Descripción: `description`, `descripcion`, `concepto`, `merchant_description`.
- Categoría: `category`, `categoria`, `category_slug`.
- Cuenta origen: `source_account`, `source_account_name`, `cuenta`, `cuenta_origen`.
- Cuenta destino: `destination_account`, `destination_account_name`, `cuenta_destino`.
- Visibilidad: `visibility`, `visibilidad`.
- Pagador: `paid_by_email`, `pagado_por`.
- Reparto: `beneficiary_split`, `reparto`.
- Comercio: `merchant`, `comercio`.
- Etiquetas: `tags`, `etiquetas`.
- Notas: `notes`, `notas`.
- ID externo: `external_id`, `id_externo`, `bank_id`.

## Política de moneda

- Solo se acepta `EUR` como moneda de importación.
- No hay conversión automática. Filas con moneda diferente se rechazan.
- El campo `amount_eur` debe contener valores en euros.

## Política de redondeo

- Redondeo bancario (round half to even) para cumplir estándares contables.
- Operaciones internas en céntimos enteros.
- Serialización final a 2 decimales.