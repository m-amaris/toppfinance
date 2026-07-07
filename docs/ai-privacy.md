# IA y privacidad

La integracion con OpenRouter ocurre solo en backend.

## Reglas

- `OPENROUTER_API_KEY` vive en `.env` o secrets del entorno.
- El frontend nunca recibe la key.
- Antes de llamar al proveedor, el backend filtra movimientos segun permisos del usuario.
- Se envian datos minimizados y anonimizados cuando es razonable.
- Los prompts completos no se guardan por defecto.
- Se registra metadata operativa: feature, modelo solicitado/usado, tokens, latencia y estado.

## Configuracion

Desde admin se podra editar:

- modelo por defecto,
- modelos fallback,
- exigencia de ZDR cuando el proveedor/modelo lo soporte,
- politica de recoleccion de datos del proveedor.

Si `OPENROUTER_API_KEY` no esta configurada, los endpoints de IA fallan explicitamente; no hay simulacion.
