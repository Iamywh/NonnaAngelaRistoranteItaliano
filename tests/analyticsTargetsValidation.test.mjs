import test from 'node:test'
import assert from 'node:assert/strict'
import { validateMonthlyTargets } from '../src/lib/analyticsTargetsValidation.mjs'

const base = () => ({
  revenue_target: '27000,01',
  covers_target: '800',
  ticket_target: '25,01',
  expense_ceiling: '7000,01',
  food_cost_ceiling_pct: '25,01',
  beverage_cost_ceiling_pct: '10,01',
  revenue_basis: 'net', expense_basis: 'net', notes: ''
})
test('Spanish comma decimals are converted to numeric RPC values', () => {
  const result = validateMonthlyTargets(base(), '2026-11')
  assert.equal(result.isValid, true)
  assert.equal(result.values.revenue_target, 27000.01)
  assert.equal(result.values.covers_target, 800)
  assert.equal(result.values.ticket_target, 25.01)
  assert.equal(result.values.food_cost_ceiling_pct, 25.01)
})
test('decimal comensales show a specific error instead of generic message', () => {
  const result = validateMonthlyTargets({ ...base(), covers_target: '800,01' }, '2026-11')
  assert.equal(result.isValid, false)
  assert.match(result.errors.covers_target, /enteros/)
  assert.equal(result.errors.revenue_target, undefined)
})
test('both dot decimals and integer-only covers are accepted', () => {
  const result = validateMonthlyTargets({ ...base(), covers_target: '800', revenue_target: '27000.01' }, '2026-11')
  assert.equal(result.isValid, true)
})
test('invalid amounts, percentages and missing bases are rejected individually', () => {
  const result = validateMonthlyTargets({
    ...base(), revenue_target: '27.000,01', food_cost_ceiling_pct: '101',
    expense_basis: ''
  }, '2026-11')
  assert.equal(result.isValid, false)
  assert.ok(result.errors.revenue_target)
  assert.ok(result.errors.food_cost_ceiling_pct)
  assert.ok(result.errors.expense_basis)
})
test('does not silently round more than 2 decimals or fractional covers', () => {
  const result = validateMonthlyTargets({
    ...base(), covers_target: '800.01', ticket_target: '25.001'
  }, '2026-11')
  assert.equal(result.isValid, false)
  assert.ok(result.errors.covers_target)
  assert.ok(result.errors.ticket_target)
})
test('empty optional targets become null for Supabase RPC', () => {
  const result = validateMonthlyTargets({
    ...base(), expense_ceiling: '', food_cost_ceiling_pct: ''
  }, '2026-11')
  assert.equal(result.isValid, true)
  assert.equal(result.values.expense_ceiling, null)
  assert.equal(result.values.food_cost_ceiling_pct, null)
})
test('all objectives empty is rejected', () => {
  const x = base()
  for (const key of ['revenue_target','covers_target','ticket_target','expense_ceiling','food_cost_ceiling_pct','beverage_cost_ceiling_pct']) x[key] = ''
  const result = validateMonthlyTargets(x, '2026-11')
  assert.equal(result.isValid, false)
  assert.ok(result.errors._summary)
})
