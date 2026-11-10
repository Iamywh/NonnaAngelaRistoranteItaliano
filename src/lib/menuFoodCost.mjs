const VARIANT_ALIASES = { medio: 'mezzo', entero: 'intero' }

function costForVariant(cost, variant) {
  const value = variant ? cost?.[variant] ?? cost?.[VARIANT_ALIASES[variant]] : cost
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function buildMenuFoodCost(menu) {
  const rows = menu.flatMap(item => {
    const prices = typeof item.prezzo_consigliato === 'object' && item.prezzo_consigliato !== null
      ? Object.entries(item.prezzo_consigliato)
      : [[null, item.prezzo_consigliato]]

    return prices.map(([variant, price]) => {
      const validPrice = typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null
      const rawCost = costForVariant(item.food_cost_raw, variant)
      const estimatedCost = costForVariant(item.food_cost_operativo, variant)
      return {
        id: item.id + (variant ? ':' + variant : ''),
        menuItemId: item.id,
        name: item.name_it || item.name_es || item.id,
        category: item.category,
        variant,
        price: validPrice,
        rawCost,
        estimatedCost,
        rawFoodCostPercent: validPrice !== null && rawCost !== null ? rawCost / validPrice * 100 : null,
        estimatedCostPercent: validPrice !== null && estimatedCost !== null ? estimatedCost / validPrice * 100 : null,
        priceMinusEstimatedCost: validPrice !== null && estimatedCost !== null ? validPrice - estimatedCost : null
      }
    })
  })
  const costedDishIds = new Set(rows.filter(row => row.estimatedCost !== null).map(row => row.menuItemId))
  return {
    rows,
    dishCount: menu.length,
    dishesWithCost: costedDishIds.size,
    dishesMissingCost: menu.length - costedDishIds.size
  }
}
