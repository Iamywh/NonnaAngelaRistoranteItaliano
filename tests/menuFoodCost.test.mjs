import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMenuFoodCost } from '../src/lib/menuFoodCost.mjs'

const load = name => JSON.parse(readFileSync(new URL('../data/menu/' + name + '.json', import.meta.url), 'utf8'))
const menu = [
  'AntipastiFreddi', 'AntipastiCaldi', 'PrimiPiatti', 'SecondiPiatti',
  'EspecialidadesSemana', 'Contorni', 'insalate', 'Dolci'
].flatMap(load)

test('Food costing uses every current dish, including dishes without a cost', () => {
  const report = buildMenuFoodCost(menu)
  assert.equal(report.dishCount, menu.length)
  assert.equal(new Set(report.rows.map(row => row.menuItemId)).size, menu.length)
  const carbonara = report.rows.find(row => row.menuItemId === 'paccheri_carbonara')
  assert.equal(carbonara.price, 20.5)
  assert.equal(carbonara.estimatedCost, null)
  assert.equal(carbonara.estimatedCostPercent, null)
})

test('Spanish portion prices match the Italian cost variant keys', () => {
  const report = buildMenuFoodCost(menu)
  const half = report.rows.find(row => row.id === 'tagliere_formaggi:medio')
  const whole = report.rows.find(row => row.id === 'tagliere_formaggi:entero')
  assert.equal(half.price, 23)
  assert.equal(half.estimatedCost, 6.3)
  assert.equal(whole.price, 30)
  assert.equal(whole.estimatedCost, 11.4)
})

test('A zero ingredient cost is preserved while a missing cost stays unknown', () => {
  const report = buildMenuFoodCost([
    { id: 'zero', prezzo_consigliato: 10, food_cost_raw: 0, food_cost_operativo: 0 },
    { id: 'missing', prezzo_consigliato: 10 }
  ])
  assert.equal(report.rows[0].estimatedCostPercent, 0)
  assert.equal(report.rows[0].priceMinusEstimatedCost, 10)
  assert.equal(report.rows[1].estimatedCostPercent, null)
})
