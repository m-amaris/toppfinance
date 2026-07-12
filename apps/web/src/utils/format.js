export function formatEsNumber(value, { suffix = '', minimumFractionDigits = 2, maximumFractionDigits = 2 } = {}) {
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(Number(value || 0))
  return `${formatted}${suffix}`
}
import { z } from 'zod';
