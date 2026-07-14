interface FormatOptions {
  suffix?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

export function formatEsNumber(
  value: number,
  { suffix = '', minimumFractionDigits = 2, maximumFractionDigits = 2 }: FormatOptions = {},
): string {
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(Number(value || 0))
  return `${formatted}${suffix}`
}
