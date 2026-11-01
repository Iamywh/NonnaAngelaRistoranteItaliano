import test from 'node:test'
import assert from 'node:assert/strict'
import { parseHistoryCsv, validateHistoryRow, goalProgress, actualForMonth } from '../src/lib/analyticsPlanning.mjs'

const csvHeader = 'month;revenue;covers;tax_basis;data_quality;source_note;notes'
const summary = (extra = {}) => ({
  month: '2026-10', complete: false, recordedDays: 1,
  validRevenue: true, revenue: 200, revenueBasis: 'gross',
  covers: 6, expenseTotal: null, expenseBases: [],
  consumption: { food: { rate: null }, beverage: { rate: null } },
  ...extra
})
const verified = (extra = {}) => ({
  month_start: '2026-10-01', revenue_total: '24000.00', covers: 560,
  tax_basis: 'gross', data_quality: 'verified',
  source_note: 'Cierre real de caja', ...extra
})
const target = (extra = {}) => ({
  revenue_target: '25000', covers_target: 600, ticket_target: '40',
  expense_ceiling: '9000', food_cost_ceiling_pct: '32',
  beverage_cost_ceiling_pct: '27', revenue_basis: 'gross',
  expense_basis: 'gross', ...extra
})

test('valid monthly CSV reads explicit verified record and estimated one', () => {
  const parsed = parseHistoryCsv('\uFEFF' + csvHeader + '\n' +
    '2026-06;11000.00;;gross;estimated;Recuerdo aproximado;\n' +
    '2026-10;24000.00;560;gross;verified;"Cierre de caja; control";dato confirmado')
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].covers, null)
  assert.equal(parsed[0].data_quality, 'estimated')
  assert.equal(parsed[1].source_note, 'Cierre de caja; control')
  assert.equal(parsed[1].revenue, 24000)
})
test('no unverified values or duplicated months enter CSV', () => {
  assert.throws(() => parseHistoryCsv(csvHeader + '\n2026-06;11000;;gross;verified;Caja;\n' +
    '2026-06;12000;;gross;verified;Caja;'), /duplicado/)
  assert.throws(() => parseHistoryCsv(csvHeader + '\n2026-08;12000,52;;gross;verified;Caja;'), /columnas|cabeceras|importe|Ingresos/)
  assert.throws(() => parseHistoryCsv(csvHeader + '\n2026-07;12000.555;;gross;estimated;Aproximado;'), /decimales/)
  assert.ok(validateHistoryRow({
    month: '2026-05', revenue: '17000', tax_basis: 'gross',
    data_quality: 'verified', source_note: ''
  }).errors.length > 0)
})
test('verified history takes precedence over incomplete daily; no addition', () => {
  const actual = actualForMonth(summary(), verified())
  assert.equal(actual.origin, 'history')
  assert.equal(actual.revenue, 24000)
  assert.equal(actual.covers, 560)
  assert.equal(actual.historicalConflict, true)
})
test('estimated history is contextual only, not presented as verified actual', () => {
  const plan = goalProgress(summary(), verified({ data_quality: 'estimated' }), target())
  assert.equal(plan.actual.origin, 'none')
  assert.equal(plan.comparisons.find(x => x.id === 'revenue').observed, null)
  assert.equal(plan.comparisons.find(x => x.id === 'revenue').progress, null)
})
test('fully finalized daily ledger takes precedence over imported history', () => {
  const actual = actualForMonth(
    summary({ complete: true, recordedDays: 31, revenue: 24500, covers: 600 }), verified())
  assert.equal(actual.origin, 'daily')
  assert.equal(actual.revenue, 24500)
})
test('gross and net targets are not compared', () => {
  const plan = goalProgress(summary(), verified({ tax_basis: 'net' }), target())
  assert.equal(plan.comparisons.find(x => x.id === 'revenue').observed, null)
  assert.equal(plan.comparisons.find(x => x.id === 'ticket').observed, null)
  assert.equal(plan.comparisons.find(x => x.id === 'covers').observed, 560)
})
test('monthly expenses are partial, do not show budget achieved prematurely', () => {
  const plan = goalProgress(summary({ expenseTotal: 7000, expenseBases: ['gross'] }), verified(), target())
  const expense = plan.comparisons.find(row => row.id === 'expenses')
  assert.equal(expense.observed, 7000)
  assert.equal(expense.partial, true)
  assert.equal(expense.achieved, null)
})
test('cost ceiling is not assessed without a complete daily month', () => {
  const p = goalProgress(summary(), verified(), target())
  assert.equal(p.comparisons.find(row => row.id === 'food').observed, null)
  assert.equal(p.comparisons.find(row => row.id === 'beverage').observed, null)
})
