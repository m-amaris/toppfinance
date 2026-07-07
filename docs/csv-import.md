# CSV de importacion

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

Devuelve un `importBatch`, resumen y filas normalizadas. Cada fila queda como:

- `ready`: valida para importar.
- `duplicate`: coincide con un `sourceHash` ya existente; se avisa, pero no bloquea el resto.
- `error`: necesita corregirse antes de importar.

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

Con `includeDuplicates: false`, las filas duplicadas se omiten y el commit sigue con las validas. Con `true`, tambien se crean las duplicadas.

## Cabeceras aceptadas

Ademas de la cabecera objetivo, el importador reconoce alias habituales:

- Fecha: `date`, `fecha`, `booking_date`.
- Tipo: `type`, `tipo`.
- Importe: `amount_eur`, `amount`, `importe`, `cantidad`.
- Descripcion: `description`, `descripcion`, `concepto`, `merchant_description`.
- Categoria: `category`, `categoria`, `category_slug`.
- Cuenta origen: `source_account`, `source_account_name`, `cuenta`, `cuenta_origen`.
- Cuenta destino: `destination_account`, `destination_account_name`, `cuenta_destino`.
- Visibilidad: `visibility`, `visibilidad`.
- Pagador: `paid_by_email`, `pagado_por`.
- Reparto: `beneficiary_split`, `reparto`.
- Comercio: `merchant`, `comercio`.
- Etiquetas: `tags`, `etiquetas`.
- Notas: `notes`, `notas`.
- ID externo: `external_id`, `id_externo`, `bank_id`.
