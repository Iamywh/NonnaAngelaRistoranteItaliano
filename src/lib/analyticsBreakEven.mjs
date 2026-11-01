// Operational break-even simulator. All monetary inputs MUST be net of IGIC.
// Calculated operating contribution is not audited accounting profit.
export const roundEuro = n => Math.round((n + Number.EPSILON) * 100) / 100
const finite = n => typeof n === 'number' && Number.isFinite(n)
const cents = n => finite(n) && roundEuro(n) === n
const monthRE = /^\d{4}-(0[1-9]|1[0-2])$/
export function checkBreakEvenPlan(p) {
  const errors = {}
  if (!monthRE.test(p?.month || '')) errors.month = 'Mes inválido'
  if (!Number.isInteger(p?.openDays) || p.openDays < 1 || p.openDays > 31)
    errors.openDays = 'Entre 1 y 31 días de apertura'
  for (const [k,label] of [['lunchDays','servicios de almuerzo'],['dinnerDays','servicios de cena']]) {
    if (!Number.isInteger(p?.[k]) || p[k] < 0 || p[k] > p.openDays)
      errors[k] = 'Número de ' + label + ' entre 0 y los días abiertos'
  }
  if (!errors.lunchDays && !errors.dinnerDays && p.lunchDays + p.dinnerDays === 0)
    errors.lunchDays = 'Se requiere al menos un servicio'
  if (!cents(p?.ticketNet) || p.ticketNet <= 0 || p.ticketNet > 10000)
    errors.ticketNet = 'Ticket neto positivo, máximo 2 decimales'
  if (!cents(p?.fixedMonthlyNet) || p.fixedMonthlyNet < 0 || p.fixedMonthlyNet > 10000000)
    errors.fixedMonthlyNet = 'Costes fijos netos no negativos, máximo 2 decimales'
  if (!cents(p?.variablePct) || p.variablePct < 0 || p.variablePct > 100)
    errors.variablePct = 'Porcentaje entre 0 y 100, máximo 2 decimales'
  if (!Number.isInteger(p?.plannedCovers) || p.plannedCovers < 0 || p.plannedCovers > 1000000)
    errors.plannedCovers = 'Comensales enteros no negativos'
  if (!Number.isInteger(p?.lunchSharePct) || p.lunchSharePct < 0 || p.lunchSharePct > 100)
    errors.lunchSharePct = 'Distribución de almuerzos entre 0% y 100%'
  if (!errors.lunchSharePct && !errors.lunchDays && !errors.dinnerDays) {
    if (p.lunchDays === 0 && p.lunchSharePct !== 0) errors.lunchSharePct = 'Sin almuerzos abiertos, la proporción debe ser 0%'
    if (p.dinnerDays === 0 && p.lunchSharePct !== 100) errors.lunchSharePct = 'Sin cenas abiertas, la proporción debe ser 100%'
  }
  for (const key of ['lunchCapacity','dinnerCapacity']) {
    if (p?.[key] !== null && p?.[key] !== undefined &&
        (!Number.isInteger(p[key]) || p[key] < 1 || p[key] > 1000))
      errors[key] = 'Capacidad opcional: número entero entre 1 y 1000'
  }
  return errors
}
const split = (n, lunchPct) => {
  const lunch = Math.round(n * lunchPct / 100)
  return { lunch, dinner:n-lunch }
}
const thresholdCovers = (fixed, margin) => {
  // Small floating-point errors must not require an extra diner.
  const raw = fixed / margin
  const close = Math.round(raw)
  return Math.abs(raw-close) < 1e-9 ? close : Math.ceil(raw)
}
export function simulateBreakEven(p) {
  const errors=checkBreakEvenPlan(p)
  if (Object.keys(errors).length) return {valid:false,errors}
  const variablePerCover=roundEuro(p.ticketNet*p.variablePct/100)
  const contribution=roundEuro(p.ticketNet-variablePerCover)
  const viable=contribution > 0
  const coversRequired=viable?thresholdCovers(p.fixedMonthlyNet,contribution):null
  const breakEvenRevenue=coversRequired==null?null:roundEuro(coversRequired*p.ticketNet)
  const plannedRevenue=roundEuro(p.plannedCovers*p.ticketNet)
  const plannedContribution=roundEuro(p.plannedCovers*contribution)
  const simulatedOperatingBalance=roundEuro(plannedContribution-p.fixedMonthlyNet)
  const requiredSplit=coversRequired==null?null:split(coversRequired,p.lunchSharePct)
  const plannedSplit=split(p.plannedCovers,p.lunchSharePct)
  const services={
    lunch:{
      count:p.lunchDays,
      plannedCovers:plannedSplit.lunch,
      requiredCovers:requiredSplit?.lunch??null,
      plannedPerService:p.lunchDays?Math.ceil(plannedSplit.lunch/p.lunchDays):0,
      requiredPerService:p.lunchDays && requiredSplit ? Math.ceil(requiredSplit.lunch/p.lunchDays):null,
      maxCapacity:p.lunchCapacity,
    },
    dinner:{
      count:p.dinnerDays,
      plannedCovers:plannedSplit.dinner,
      requiredCovers:requiredSplit?.dinner??null,
      plannedPerService:p.dinnerDays?Math.ceil(plannedSplit.dinner/p.dinnerDays):0,
      requiredPerService:p.dinnerDays && requiredSplit ? Math.ceil(requiredSplit.dinner/p.dinnerDays):null,
      maxCapacity:p.dinnerCapacity,
    }
  }
  const capacityAlerts=[]
  for(const [type,s] of Object.entries(services)){
    if(s.maxCapacity!=null){
      if(s.requiredPerService!=null && s.requiredPerService>s.maxCapacity)
        capacityAlerts.push(type==='lunch'?'El objetivo de equilibrio supera la capacidad de almuerzo':'El objetivo de equilibrio supera la capacidad de cena')
      if(s.plannedPerService>s.maxCapacity)
        capacityAlerts.push(type==='lunch'?'Los comensales previstos superan capacidad de almuerzo':'Los comensales previstos superan capacidad de cena')
    }
  }
  return {
    valid:true,viable,variablePerCover,contribution,coversRequired,breakEvenRevenue,
    plannedRevenue,plannedContribution,simulatedOperatingBalance,
    dailyAverageRequired:coversRequired==null?null:Math.ceil(coversRequired/p.openDays),
    dailyAveragePlanned:Math.ceil(p.plannedCovers/p.openDays),
    contributionRatePct:roundEuro((contribution/p.ticketNet)*100),
    distanceCovers:coversRequired==null?null:p.plannedCovers-coversRequired,
    services,capacityAlerts,
    disclaimer:'Simulación operativa neta de IGIC. No es beneficio contable: no se han validado ni conciliado costes, amortizaciones, financiación y otros ajustes.'
  }
}
export function parseBreakEvenFields(form){
  const numberValue = value => {
    const v=String(value??'').trim()
    return /^(?:0|[1-9]\d*)(?:[.,]\d{1,2})?$/.test(v)?Number(v.replace(',','.')):NaN
  }
  const intValue = value => {
    const v=String(value??'').trim()
    return /^(?:0|[1-9]\d*)$/.test(v)?Number(v):NaN
  }
  return {
    month:form.month,
    openDays:intValue(form.openDays),lunchDays:intValue(form.lunchDays),
    dinnerDays:intValue(form.dinnerDays),ticketNet:numberValue(form.ticketNet),
    fixedMonthlyNet:numberValue(form.fixedMonthlyNet),
    variablePct:numberValue(form.variablePct),plannedCovers:intValue(form.plannedCovers),
    lunchSharePct:intValue(form.lunchSharePct),
    lunchCapacity:String(form.lunchCapacity??'').trim()===''?null:intValue(form.lunchCapacity),
    dinnerCapacity:String(form.dinnerCapacity??'').trim()===''?null:intValue(form.dinnerCapacity)
  }
}
