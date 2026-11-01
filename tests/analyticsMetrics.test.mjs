import test from 'node:test'
import assert from 'node:assert/strict'
import { monthlyOverview } from '../src/lib/analyticsMetrics.mjs'

const service = (type, food, beverage, covers, basis = 'gross') => ({
  service_type: type, food_revenue_amount: food,
  beverage_revenue_amount: beverage, covers, tax_basis: basis
})
const day = (date, services = [], status = 'draft', lunchStatus = 'open', dinnerStatus = 'closed') => ({
  business_date: date, status,
  lunch_status: lunchStatus, dinner_status: dinnerStatus,
  analytics_service_entries: services
})
const purchase = (amount, category = 'food_purchases', basis = 'gross', kind = 'daily') => ({
  category, amount, tax_basis: basis, period_kind: kind, period_date: '2026-10-02'
})
const inventory = (opening, closing, total, count, reconciled = true, basis = 'gross') => ({
  stock_type: 'food', opening_value: opening, closing_value: closing,
  external_adjustment: 0, valuation_basis: basis,
  purchases_reconciled: reconciled,
  reconciled_purchase_total: total,
  reconciled_purchase_count: count
})

test('partial October with one real-like day reports only observed values, not profit', () => {
  const result = monthlyOverview({
    month: '2026-10',
    dayEntries: [day('2026-10-31', [service('lunch', 220, 80, 8)], 'finalized')]
  })
  assert.equal(result.recordedDays, 1)
  assert.equal(result.daysInMonth, 31)
  assert.equal(result.complete, false)
  assert.equal(result.revenue, 300)
  assert.equal(result.ticketAverage, 37.5)
  assert.equal(result.covers, 8)
  assert.equal(result.consumption.food.rate, null)
  assert.equal(result.expenseTotal, null)
})
test('mixed tax bases cannot produce a blended revenue or average ticket', () => {
  const result = monthlyOverview({
    month: '2026-10',
    dayEntries: [
      day('2026-10-30', [service('lunch', 100, 10, 3, 'gross')]),
      day('2026-10-31', [service('lunch', 70, 20, 3, 'net')])
    ]
  })
  assert.equal(result.revenueMixed, true)
  assert.equal(result.validRevenue, false)
  assert.equal(result.revenue, null)
  assert.equal(result.ticketAverage, null)
  assert.equal(result.revenueByBasis.gross.total, 110)
  assert.equal(result.revenueByBasis.net.total, 90)
})
test('monthly and daily expense category overlap is flagged, even with same tax basis', () => {
  const result = monthlyOverview({
    month: '2026-10',
    expenses: [purchase(100), purchase(200, 'food_purchases', 'gross', 'monthly')]
  })
  assert.deepEqual(result.overlappingExpenseCategories, ['food_purchases'])
  assert.equal(result.expenseTotal, null)
  assert.equal(result.consumption.food.valid, false)
})
test('verified stock produces estimated consumption and a cost rate only for a complete month', () => {
  const days = []
  for (let d = 1; d <= 31; d++) {
    const date = '2026-10-' + String(d).padStart(2, '0')
    days.push(day(date, d === 1 ? [service('lunch', 1000, 0, 10)] : [],
      'finalized', d === 1 ? 'open' : 'closed'))
  }
  const result = monthlyOverview({
    month: '2026-10', dayEntries: days, expenses: [purchase(300)],
    inventories: [inventory(100, 80, 300, 1)]
  })
  assert.equal(result.complete, true)
  assert.equal(result.consumption.food.valid, true)
  assert.equal(result.consumption.food.value, 320)
  assert.equal(result.consumption.food.rate, 32)
})
test('a changed purchase total invalidates reconciled inventory', () => {
  const result = monthlyOverview({
    month: '2026-10',
    expenses: [purchase(301)],
    inventories: [inventory(100, 80, 300, 1)]
  })
  assert.equal(result.consumption.food.reconciled, false)
  assert.equal(result.consumption.food.valid, false)
  assert.equal(result.consumption.food.value, null)
})
test('a missing open service prevents displaying a supposedly complete revenue', () => {
  const result = monthlyOverview({
    month: '2026-10',
    dayEntries: [day('2026-10-31', [], 'draft')]
  })
  assert.equal(result.missingOpenServices, true)
  assert.equal(result.revenue, null)
})
test('gross expenses and net expenses are separate and not aggregated', () => {
  const result = monthlyOverview({
    month: '2026-10',
    expenses: [purchase(100), purchase(50, 'rent', 'net', 'monthly')]
  })
  assert.equal(result.expenseMixed, true)
  assert.equal(result.expenseTotal, null)
  assert.deepEqual(result.expenseByBasis, { gross: 100, net: 50 })
})
