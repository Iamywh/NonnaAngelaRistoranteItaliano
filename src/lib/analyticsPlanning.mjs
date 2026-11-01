// Historical monthly figures are separate, never added to the daily ledger.
const monthRE = /^[0-9]{4}-(0[1-9]|1[0-2])$/
const decimalRE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/
const wholeRE = /^(?:0|[1-9][0-9]*)$/
const HEADER = ['month','revenue','covers','tax_basis','data_quality','source_note','notes']
const toAmount = value => Number(value)
const optionalNumber = value => value === '' || value == null ? null : Number(value)
const round = value => Math.round((value + Number.EPSILON) * 100) / 100

export function validateHistoryRow(input) {
  const month = String(input.month || '').trim()
  const revenue = String(input.revenue ?? '').trim()
  const covers = String(input.covers ?? '').trim()
  const tax_basis = String(input.tax_basis || '').trim().toLowerCase()
  const data_quality = String(input.data_quality || '').trim().toLowerCase()
  const source_note = String(input.source_note || '').trim()
  const notes = String(input.notes || '').trim()
  const errors = []
  if (!monthRE.test(month)) errors.push('Mes inválido (AAAA-MM)')
  if (!decimalRE.test(revenue) || !Number.isFinite(toAmount(revenue)) || toAmount(revenue) >= 1e10)
    errors.push('Ingresos inválidos: usa un número con punto y hasta 2 decimales')
  if (covers && (!wholeRE.test(covers) || toAmount(covers) > 100000000))
    errors.push('Comensales deben ser un entero no negativo')
  if (!['gross','net'].includes(tax_basis)) errors.push('tax_basis debe ser gross o net')
  if (!['verified','estimated'].includes(data_quality)) errors.push('data_quality debe ser verified o estimated')
  if (source_note.length < 3 || source_note.length > 500) errors.push('Fuente requerida: 3-500 caracteres')
  if (notes.length > 1500) errors.push('Notas demasiado largas')
  return {
    errors, value: {
      month, revenue: toAmount(revenue), covers: optionalNumber(covers),
      tax_basis, data_quality, source_note, notes
    }
  }
}

function csvRecords(input, delimiter) {
  const rows = []
  let row = [], field = '', quoted = false, quoteClosed = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++ }
        else { quoted = false; quoteClosed = true }
      } else field += ch
      continue
    }
    if (ch === '"') {
      if (field || quoteClosed) throw Error('Comillas CSV no válidas')
      quoted = true
      continue
    }
    if (ch === delimiter) {
      row.push(field); field = ''; quoteClosed = false
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++
      row.push(field)
      if (row.some(x => x.trim() !== '')) rows.push(row)
      row = []; field = ''; quoteClosed = false
    } else if (quoteClosed && ch !== ' ') throw Error('Caracteres después de comillas')
    else field += ch
  }
  if (quoted) throw Error('Comillas CSV sin cerrar')
  row.push(field)
  if (row.some(x => x.trim() !== '')) rows.push(row)
  return rows
}

export function parseHistoryCsv(csv) {
  if (typeof csv !== 'string' || csv.length > 200000) throw Error('CSV vacío o demasiado grande')
  const normalized = csv.replace(/^\uFEFF/, '')
  const first = normalized.split(/\r?\n/, 1)[0] || ''
  const separator = first.includes(';') ? ';' : ','
  const records = csvRecords(normalized, separator)
  if (records.length < 2 || records.length > 61) throw Error('CSV requiere cabecera y entre 1 y 60 filas')
  const headers = records[0].map(h => h.trim().toLowerCase())
  if (headers.length !== HEADER.length || !HEADER.every((name, i) => headers[i] === name)) {
    throw Error('Cabeceras obligatorias: ' + HEADER.join(separator))
  }
  const months = new Set()
  const result = records.slice(1).map((cells, i) => {
    if (cells.length !== HEADER.length) throw Error('Fila ' + (i + 2) + ': columnas incorrectas')
    const parsed = validateHistoryRow(Object.fromEntries(HEADER.map((key, j) => [key, cells[j]])))
    if (parsed.errors.length) throw Error('Fila ' + (i + 2) + ': ' + parsed.errors.join('; '))
    if (months.has(parsed.value.month)) throw Error('Mes duplicado en CSV: ' + parsed.value.month)
    months.add(parsed.value.month)
    return parsed.value
  })
  return result
}

export function actualForMonth(metric, history) {
  // If all days are finalized, the daily ledger wins. Partial daily ledger is
  // never added to an imported monthly amount.
  if (metric?.complete && metric.validRevenue) {
    return {
      origin: 'daily', verified: true, basis: metric.revenueBasis,
      revenue: metric.revenue, covers: metric.covers,
      ticket: metric.covers > 0 ? round(metric.revenue / metric.covers) : null,
      historicalConflict: Boolean(history)
    }
  }
  if (history?.data_quality === 'verified') {
    const revenue = Number(history.revenue_total)
    const covers = history.covers == null ? null : Number(history.covers)
    return {
      origin: 'history', verified: true, basis: history.tax_basis,
      revenue, covers, ticket: covers > 0 ? round(revenue / covers) : null,
      historicalConflict: Boolean(metric?.recordedDays)
    }
  }
  return {
    origin: 'none', verified: false, basis: null,
    revenue: null, covers: null, ticket: null,
    historicalConflict: false
  }
}

export function goalProgress(metric, history, target) {
  if (!target) return { actual: actualForMonth(metric, history), comparisons: [] }
  const actual = actualForMonth(metric, history)
  const comparisons = [
    { id: 'revenue', label: 'Ingresos objetivo', goal: target.revenue_target,
      observed: actual.verified && actual.basis === target.revenue_basis ? actual.revenue : null,
      unit: 'currency', kind: 'minimum' },
    { id: 'covers', label: 'Comensales objetivo', goal: target.covers_target,
      observed: actual.verified ? actual.covers : null,
      unit: 'number', kind: 'minimum' },
    { id: 'ticket', label: 'Ticket medio objetivo', goal: target.ticket_target,
      observed: actual.verified && actual.basis === target.revenue_basis ? actual.ticket : null,
      unit: 'currency', kind: 'minimum' },
    { id: 'expenses', label: 'Presupuesto máximo de gastos', goal: target.expense_ceiling,
      observed: metric?.expenseTotal != null &&
        metric.expenseBases.length === 1 && metric.expenseBases[0] === target.expense_basis
        ? metric.expenseTotal : null,
      unit: 'currency', kind: 'ceiling', partial: true },
    { id: 'food', label: 'Coste máximo comida', goal: target.food_cost_ceiling_pct,
      observed: metric?.complete && metric.revenueBasis === target.revenue_basis
        ? metric.consumption.food.rate : null,
      unit: 'percentage', kind: 'ceiling' },
    { id: 'beverage', label: 'Coste máximo bebidas', goal: target.beverage_cost_ceiling_pct,
      observed: metric?.complete && metric.revenueBasis === target.revenue_basis
        ? metric.consumption.beverage.rate : null,
      unit: 'percentage', kind: 'ceiling' }
  ].filter(row => row.goal !== null && row.goal !== undefined)
  return {
    actual,
    comparisons: comparisons.map(row => ({
      ...row,
      progress: row.observed == null || row.goal <= 0 ? null :
        round(row.observed / Number(row.goal) * 100),
      achieved: row.partial || row.observed == null ? null :
        row.kind === 'minimum' ? row.observed >= Number(row.goal) : row.observed <= Number(row.goal)
    }))
  }
}

export const historyCsvHeader = HEADER.join(';')
