// Read-only Analytics calculations. Never assume missing days or missing tax data are zero.
export const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0
const firstOfMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
const unique = values => [...new Set(values)]
const add = (a, b) => roundMoney(a + b)
const serviceValue = row => add(num(row.food_revenue_amount), num(row.beverage_revenue_amount))

export function monthlyOverview({ month, dayEntries = [], expenses = [], inventories = [] }) {
  if (!firstOfMonth(month)) throw new Error('Invalid month')
  const [year, number] = month.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const recordedDates = new Set(dayEntries.map(day => day.business_date))
  const finalizedDays = dayEntries.filter(day => day.status === 'finalized').length
  const missingOpenServices = dayEntries.some(day => {
    const services = day.analytics_service_entries || []
    return (day.lunch_status === 'open' && !services.some(row => row.service_type === 'lunch')) ||
      (day.dinner_status === 'open' && !services.some(row => row.service_type === 'dinner'))
  })
  const serviceRows = dayEntries.flatMap(day => day.analytics_service_entries || [])
  const nonZeroRows = serviceRows.filter(row => serviceValue(row) !== 0)
  const revenueBases = unique(nonZeroRows.map(row => row.tax_basis))
  const revenueMixed = revenueBases.length > 1
  const basis = revenueBases.length === 1 ? revenueBases[0] : null
  const revenueByBasis = { gross: { total: 0, food: 0, beverage: 0 }, net: { total: 0, food: 0, beverage: 0 } }
  for (const row of serviceRows) {
    if (row.tax_basis !== 'gross' && row.tax_basis !== 'net') continue
    const f = num(row.food_revenue_amount)
    const b = num(row.beverage_revenue_amount)
    revenueByBasis[row.tax_basis].food = add(revenueByBasis[row.tax_basis].food, f)
    revenueByBasis[row.tax_basis].beverage = add(revenueByBasis[row.tax_basis].beverage, b)
    revenueByBasis[row.tax_basis].total = add(revenueByBasis[row.tax_basis].total, f + b)
  }
  const covers = serviceRows.reduce((total, row) => total + num(row.covers), 0)
  const complete = recordedDates.size === daysInMonth &&
    finalizedDays === daysInMonth && !missingOpenServices
  const validRevenue = dayEntries.length > 0 && !missingOpenServices &&
    !revenueMixed && !revenueBases.some(b => b !== 'gross' && b !== 'net')
  const revenue = validRevenue ? revenueByBasis[basis || 'gross'].total : null
  const foodRevenue = validRevenue ? revenueByBasis[basis || 'gross'].food : null
  const beverageRevenue = validRevenue ? revenueByBasis[basis || 'gross'].beverage : null

  const categoryPeriods = new Map()
  const expenseByBasis = { gross: 0, net: 0 }
  const expenseByCategory = new Map()
  for (const row of expenses) {
    const amount = num(row.amount)
    if (row.tax_basis === 'gross' || row.tax_basis === 'net')
      expenseByBasis[row.tax_basis] = add(expenseByBasis[row.tax_basis], amount)
    if (!categoryPeriods.has(row.category)) categoryPeriods.set(row.category, new Set())
    categoryPeriods.get(row.category).add(row.period_kind)
    const key = row.category + ':' + row.tax_basis
    expenseByCategory.set(key, add(expenseByCategory.get(key) || 0, amount))
  }
  const overlappingExpenseCategories = [...categoryPeriods.entries()]
    .filter(([, kinds]) => kinds.size > 1).map(([category]) => category)
  const expenseBases = unique(expenses.map(row => row.tax_basis))
  const expenseMixed = expenseBases.length > 1
  const validExpense = expenses.length > 0 && !expenseMixed &&
    overlappingExpenseCategories.length === 0 &&
    expenseBases.every(b => b === 'gross' || b === 'net')
  const expenseTotal = validExpense ? expenseByBasis[expenseBases[0]] : null

  const consumption = {}
  for (const [kind, category] of [['food', 'food_purchases'], ['beverage', 'beverage_purchases']]) {
    const inventory = inventories.find(item => item.stock_type === kind)
    const purchaseRows = expenses.filter(row => row.category === category)
    const purchases = purchaseRows.reduce((a, row) => add(a, num(row.amount)), 0)
    const duplicatePeriods = unique(purchaseRows.map(row => row.period_kind)).length > 1
    const taxMismatch = purchaseRows.some(row => row.tax_basis !== inventory?.valuation_basis)
    const reconciled = inventory?.purchases_reconciled === true &&
      inventory?.reconciled_purchase_count != null &&
      inventory?.reconciled_purchase_total != null &&
      Number(inventory.reconciled_purchase_count) === purchaseRows.length &&
      Math.abs(num(inventory.reconciled_purchase_total) - purchases) < 0.005
    const valued = inventory?.opening_value != null &&
      inventory?.closing_value != null &&
      inventory?.external_adjustment != null
    const value = inventory && valued
      ? add(add(num(inventory.opening_value), purchases),
          num(inventory.external_adjustment)) - num(inventory.closing_value)
      : null
    const valid = Boolean(inventory && reconciled && valued &&
      !duplicatePeriods && !taxMismatch && value >= 0)
    const finalValue = valid ? roundMoney(value) : null
    const typeRevenue = kind === 'food' ? foodRevenue : beverageRevenue
    const rate = complete && validRevenue && valid &&
      inventory.valuation_basis === basis && typeRevenue > 0
      ? roundMoney(finalValue / typeRevenue * 100) : null
    consumption[kind] = {
      valid, value: finalValue, rate, purchases,
      reconciled, missingValuation: !valued,
      duplicatePeriods, taxMismatch
    }
  }

  const daily = [...dayEntries].sort((a, b) => a.business_date.localeCompare(b.business_date))
    .map(day => {
      const services = day.analytics_service_entries || []
      const bases = unique(services.filter(row => serviceValue(row) !== 0).map(row => row.tax_basis))
      return {
        date: day.business_date,
        total: services.reduce((sum, row) => add(sum, serviceValue(row)), 0),
        basis: bases.length === 1 ? bases[0] : null,
        covers: services.reduce((sum, row) => sum + num(row.covers), 0),
        finalized: day.status === 'finalized',
        mixed: bases.length > 1
      }
    })

  return {
    month, daysInMonth, recordedDays: recordedDates.size,
    finalizedDays, missingOpenServices, complete,
    revenueMixed, validRevenue, revenue, revenueBasis: basis,
    revenueByBasis, foodRevenue, beverageRevenue, covers,
    ticketAverage: validRevenue && covers > 0 ? roundMoney(revenue / covers) : null,
    expenseByBasis, expenseMixed, expenseTotal,
    expenseBases, overlappingExpenseCategories,
    expenseByCategory: [...expenseByCategory].map(([key, amount]) => {
      const [category, taxBasis] = key.split(':')
      return { category, taxBasis, amount }
    }).sort((a, b) => b.amount - a.amount),
    consumption, daily
  }
}
