// This model is a planning scenario, separate from reconciled Analytics expenses.
export function calculateCostScenario(params) {
  if (Object.values(params).some(value => value === '' || value === null)) return null
  const p = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Number(value)]))
  if (Object.values(p).some(n => !Number.isFinite(n)) || p.fixed_monthly < 0 ||
      p.covers <= 0 || p.dishes_per_cover <= 0 || p.ticket <= 0 || p.open_days <= 0 || p.open_days > 31 ||
      !Number.isInteger(p.open_days) || ['tax_rate', 'kitchen_share', 'raw_target', 'margin_target'].some(k => p[k] < 0 || p[k] >= 1) ||
      p.raw_target + p.margin_target >= 1) return null
  const netRevenue = p.covers * p.ticket / (1 + p.tax_rate)
  const breakEvenGross = p.fixed_monthly / (1 - p.raw_target) * (1 + p.tax_rate)
  return {
    netRevenue, rawBudget: netRevenue * p.raw_target,
    operatingResidual: netRevenue * (1 - p.raw_target) - p.fixed_monthly,
    allocatedPerDish: p.fixed_monthly * p.kitchen_share / (p.covers * p.dishes_per_cover),
    breakEvenGross, breakEvenCoversPerDay: breakEvenGross / p.ticket / p.open_days,
    targetGross: p.fixed_monthly / (1 - p.raw_target - p.margin_target) * (1 + p.tax_rate)
  }
}
export function joinWorkbookMenu(menuRows, model) {
  const p = model.params
  const scenario = calculateCostScenario(p)
  return menuRows.map(menu => {
    const source = model.rows.find(r => r.menu_key === menu.id)
    const raw = source?.approved && Number.isFinite(source.raw_cost) ? source.raw_cost : null
    const net = menu.price === null ? null : menu.price / (1 + Number(p.tax_rate))
    return { ...menu, source, rawCost: raw, netPrice: net,
      rawFoodCostPercent: net && raw !== null ? raw / net * 100 : null,
      contribution: net !== null && raw !== null ? net - raw : null,
      afterAllocation: net !== null && raw !== null && scenario ? net - raw - scenario.allocatedPerDish : null }
  })
}
