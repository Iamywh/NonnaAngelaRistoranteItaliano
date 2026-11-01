// Spanish-locale-safe, field-level validation for monthly financial targets.
// Never round covers or silently accept malformed amounts.
const MONEY_KEYS = [
  'revenue_target', 'ticket_target', 'expense_ceiling',
  'food_cost_ceiling_pct', 'beverage_cost_ceiling_pct'
]
const LABELS = {
  revenue_target: 'Objetivo de facturación',
  covers_target: 'Objetivo de comensales',
  ticket_target: 'Ticket medio objetivo',
  expense_ceiling: 'Presupuesto máximo de gastos',
  food_cost_ceiling_pct: 'Coste máximo de alimentos',
  beverage_cost_ceiling_pct: 'Coste máximo de bebidas',
  revenue_basis: 'Base fiscal de facturación',
  expense_basis: 'Base fiscal de gastos'
}
const DECIMAL = /^(?:0|[1-9]\d*)(?:[.,]\d{1,2})?$/
const INTEGER = /^(?:0|[1-9]\d*)$/
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const normalize = text => text.replace(',', '.')

export function validateMonthlyTargets(form, month) {
  const errors = {}
  const values = {}
  const strings = [
    ...MONEY_KEYS.slice(0, 1), 'covers_target', ...MONEY_KEYS.slice(1)
  ]
  let specified = 0

  for (const key of strings) {
    const raw = String(form[key] ?? '').trim()
    values[key] = null
    if (!raw) continue
    specified++
    if (key === 'covers_target') {
      if (!INTEGER.test(raw)) {
        errors[key] = 'Los comensales deben ser enteros, sin decimales (ejemplo: 800).'
        continue
      }
    } else if (!DECIMAL.test(raw)) {
      errors[key] = 'Introduce un número válido, con hasta 2 decimales (punto o coma).'
      continue
    }
    const value = Number(normalize(raw))
    if (!Number.isFinite(value) || value >= 10000000000) {
      errors[key] = 'Importe fuera del rango permitido.'
      continue
    }
    const percent = key.endsWith('_pct')
    if ((!percent && value <= 0) || (percent && (value < 0 || value > 100))) {
      errors[key] = percent ? 'El porcentaje debe estar entre 0 y 100.' : 'Introduce un valor mayor que cero.'
      continue
    }
    values[key] = value
  }

  if (!specified) errors._summary = 'Introduce al menos un objetivo.'
  if (!MONTH.test(String(month || ''))) errors.month = 'Selecciona un mes válido.'
  for (const key of ['revenue_basis', 'expense_basis']) {
    if (!['gross', 'net'].includes(form[key])) errors[key] = 'Selecciona bruto o neto.'
  }
  if (String(form.notes ?? '').length > 1500) errors.notes = 'Notas demasiado largas.'
  return { values, errors, isValid: Object.keys(errors).length === 0, labels: LABELS }
}
