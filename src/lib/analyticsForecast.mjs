// Deterministic scenario simulation. No forecast is claimed to be a statistical prediction.
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const round = value => Math.round((value + Number.EPSILON) * 100) / 100
export const scenarioNames = ['conservative','base','optimistic']
export const defaultScenarios = () => ({
  conservative: { covers_growth_pct: -3, ticket_growth_pct: -1 },
  base: { covers_growth_pct: 0, ticket_growth_pct: 0 },
  optimistic: { covers_growth_pct: 3, ticket_growth_pct: 1.5 }
})
export function shiftMonth(month, delta) {
  if (!MONTH.test(month) || !Number.isInteger(delta)) throw Error('Mes inválido')
  const [y, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + delta, 1))
  return date.toISOString().slice(0, 7)
}
export function nextCanaryMonth(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit'
  }).formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type,x.value]))
  return shiftMonth(parts.year + '-' + parts.month, 1)
}
export function historyBaseline(records, startingMonth, basis) {
  if (!MONTH.test(startingMonth) || !['gross','net'].includes(basis)) throw Error('Mes o base fiscal inválida')
  const latest = records
    .filter(row => row.month_start?.slice(0,7) < startingMonth &&
      row.data_quality === 'verified' && row.tax_basis === basis &&
      Number.isInteger(Number(row.covers)) && Number(row.covers) > 0 &&
      Number.isFinite(Number(row.revenue_total)) && Number(row.revenue_total) >= 0)
    .sort((a,b) => b.month_start.localeCompare(a.month_start)).slice(0,3)
  if (!latest.length) return null
  const totalRevenue = latest.reduce((sum,row) => sum + Number(row.revenue_total),0)
  const totalCovers = latest.reduce((sum,row) => sum + Number(row.covers),0)
  const averageCovers = Math.round(totalCovers / latest.length)
  const weightedTicket = round(totalRevenue / totalCovers)
  return {
    covers: averageCovers, ticket: weightedTicket,
    months: latest.map(r => r.month_start.slice(0,7)),
    sampleSize: latest.length, basis,
    limited: latest.length < 3 || latest.some(row => {
      const distance = (Number(startingMonth.slice(0,4))-Number(row.month_start.slice(0,4)))*12 +
        Number(startingMonth.slice(5,7))-Number(row.month_start.slice(5,7))
      return distance > 4
    })
  }
}
const finite = n => typeof n === 'number' && Number.isFinite(n)
const rateValid = value => finite(value) && value >= -20 && value <= 20 && round(value) === value

export function validateForecastPlan(plan) {
  const errors = []
  if (!MONTH.test(plan?.forecast_start || '')) errors.push('Mes inicial inválido')
  if (!['gross','net'].includes(plan?.tax_basis)) errors.push('Selecciona bruto o neto')
  if (!['history','manual'].includes(plan?.baseline_mode)) errors.push('Elige una fuente de referencia')
  if (plan?.baseline_mode === 'manual' && (!Number.isInteger(plan.manual_covers) ||
    plan.manual_covers <= 0 || !finite(plan.manual_ticket) ||
    plan.manual_ticket <= 0 || plan.manual_ticket >= 1000000 ||
    round(plan.manual_ticket) !== plan.manual_ticket)) errors.push('Introduce comensales enteros y ticket positivo de hasta 2 decimales')
  if (plan?.monthly_capacity !== null && plan?.monthly_capacity !== undefined &&
    (!Number.isInteger(plan.monthly_capacity) || plan.monthly_capacity <= 0 ||
      plan.monthly_capacity > 1000000)) errors.push('La capacidad mensual debe ser un entero positivo')
  if (plan?.baseline_mode === 'manual' && Number.isInteger(plan.monthly_capacity) &&
    plan.monthly_capacity < plan.manual_covers)
    errors.push('La capacidad no puede ser inferior a los comensales de referencia')
  if (!plan?.scenarios || typeof plan.scenarios !== 'object' ||
    Array.isArray(plan.scenarios) ||
    Object.keys(plan.scenarios).length !== 3 ||
    scenarioNames.some(name => !plan.scenarios[name] ||
      Object.keys(plan.scenarios[name]).length !== 2 ||
      !rateValid(plan.scenarios[name].covers_growth_pct) ||
      !rateValid(plan.scenarios[name].ticket_growth_pct)))
    errors.push('Los tres escenarios deben tener tasas mensuales entre -20% y 20%, con 2 decimales máximo')
  return errors
}
export function projectForecast(plan, verifiedHistory, targets = []) {
  const errors = validateForecastPlan(plan)
  if (errors.length) throw Error(errors.join('; '))
  const reference = plan.baseline_mode === 'history'
    ? historyBaseline(verifiedHistory, plan.forecast_start, plan.tax_basis)
    : { covers: plan.manual_covers, ticket: plan.manual_ticket,
        months: [], sampleSize: 0, basis: plan.tax_basis, limited: true }
  if (!reference || reference.covers < 1 || reference.ticket <= 0) {
    return { available:false, reason:'Sin meses anteriores verificados con comensales y base fiscal compatible. Usa valores manuales explícitos.', series:[] }
  }
  const targetByMonth = new Map(targets.map(row => [row.month_start.slice(0,7),row]))
  const series = scenarioNames.map(name => {
    const growth = plan.scenarios[name]
    let cumulativeRevenue = 0, cumulativeCovers = 0
    const points = Array.from({length:12},(_,i) => {
      const month = shiftMonth(plan.forecast_start,i)
      const desiredCovers = Math.max(0,Math.round(reference.covers * Math.pow(1 + growth.covers_growth_pct/100,i + 1)))
      const capped = plan.monthly_capacity != null && desiredCovers > plan.monthly_capacity
      const covers = capped ? plan.monthly_capacity : desiredCovers
      const ticket = round(reference.ticket * Math.pow(1 + growth.ticket_growth_pct/100,i + 1))
      const revenue = round(covers * ticket)
      cumulativeRevenue = round(cumulativeRevenue + revenue)
      cumulativeCovers += covers
      const target = targetByMonth.get(month)
      const revenueTarget = target?.revenue_basis === plan.tax_basis &&
        target?.revenue_target != null ? Number(target.revenue_target) : null
      return { month, covers, ticket, revenue, capped,
        revenueTarget, targetDelta: revenueTarget != null ? round(revenue - revenueTarget) : null,
        cumulativeRevenue, cumulativeCovers }
    })
    return { name, points, horizons: [3,6,12].map(months => ({
      months,
      covers: points[months-1].cumulativeCovers,
      revenue: points[months-1].cumulativeRevenue,
      avgTicket: points[months-1].cumulativeCovers > 0
        ? round(points[months-1].cumulativeRevenue / points[months-1].cumulativeCovers) : null
    })) }
  })
  return { available:true, reference, basis:plan.tax_basis, series,
    simulated:true, disclaimer:'Simulación de escenarios, no previsión garantizada. No incluye gastos, impuestos, beneficio ni estacionalidad no documentada.' }
}
