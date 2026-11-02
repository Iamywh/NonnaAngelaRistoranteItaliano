// Rule-based managerial alerts. Pure/read-only, never identifies assumptions as real results.
// This is NOT an ML model, push notification system, or accounting certification.
export const DEFAULT_ALERT_THRESHOLDS = Object.freeze({
  revenueShortfallPct: 10,
  coversShortfallPct: 10,
  ticketShortfallPct: 10,
  revenueDropPct: 15,
  expenseIncreasePct: 25
})
const VALID_MONTH=/^\d{4}-(0[1-9]|1[0-2])$/
const round=value=>Math.round((value+Number.EPSILON)*100)/100
const numeric=value=>value===null||value===undefined||value===''?null:Number(value)
const allowed=value=>typeof value==='number'&&Number.isFinite(value)
const trusted=month=>Boolean(month &&
  (month.status==='verified'||month.status==='complete'||
   (month.status==='closed'&&month.closureStatus==='consistent'))&&
  allowed(month.revenue)&&['net','gross'].includes(month.basis))
const containsKindMix=rows=>{
  const periods=new Map()
  for(const row of rows||[]){
    if(!periods.has(row.category))periods.set(row.category,new Set())
    periods.get(row.category).add(row.period_kind)
  }
  return [...periods].filter(([,set])=>set.size>1).map(([name])=>name)
}
export function validateAlertThresholds(value){
  const invalid=[]
  for(const key of Object.keys(DEFAULT_ALERT_THRESHOLDS)){
    const amount=value?.[key]
    if(!Number.isInteger(amount)||amount<1||amount>100)invalid.push(key)
  }
  return invalid
}
export function buildManagementAlerts({
  month,currentMonth,report,metrics={},targets={},expenses={},thresholds=DEFAULT_ALERT_THRESHOLDS
}){
  if(!VALID_MONTH.test(month)||!VALID_MONTH.test(currentMonth))
    throw Error('Mes inválido')
  const invalid=validateAlertThresholds(thresholds)
  if(invalid.length)throw Error('Umbral inválido: '+invalid.join(', '))
  const monthRow=report?.months?.find(x=>x.month===month)
  if(!monthRow)throw Error('No hay datos del mes solicitado')
  const before=report.months.find(x=>x.month<month) // caller supplies immediately preceding month
  const metric=metrics[month]||null
  const target=targets[month]||null
  const alerts=[]
  const past=month<currentMonth
  const future=month>currentMonth
  const push=(id,level,title,detail,action,observed=null,reference=null)=>{
    alerts.push({id:month+':'+id,level,title,detail,action,observed,reference})
  }
  const levelRank={critical:0,warning:1,info:2}

  // Data integrity: these alerts must not be hidden by business KPI signals.
  if(monthRow.status==='closed'){
    if(monthRow.closureStatus==='changed')
      push('stale-close','critical','Cierre mensual desactualizado',
        'Los registros de origen han cambiado desde el cierre. El resultado histórico se mantiene, pero requiere revisión documental.',
        'closing')
    else if(monthRow.closureStatus!=='consistent')
      push('unverified-close','warning','Integridad del cierre no comprobada',
        'No se pudo contrastar la huella del cierre con los registros actuales. No usar su resultado como cifra conciliada hasta verificar.',
        'closing')
  }
  if(metric?.revenueMixed)
    push('mixed-sales','critical','Ventas con bases fiscales mezcladas',
      'Hay ventas brutas y netas en un mismo mes. No se debe comparar ni sumar como si fueran homogéneas.',
      'daily')
  if(metric?.expenseMixed)
    push('mixed-costs','critical','Gastos con bases fiscales mezcladas',
      'Existen importes brutos y netos: verifica el IGIC antes de evaluar costes.',
      'expenses')
  if(metric?.overlappingExpenseCategories?.length)
    push('overlap','critical','Posible duplicidad en gastos',
      'Categorías registradas en modalidad diaria y mensual: '+metric.overlappingExpenseCategories.join(', ')+'. Revisa si representan el mismo coste.',
      'expenses')
  if(metric?.missingOpenServices)
    push('services','warning','Servicios abiertos sin registro',
      'Uno o más servicios abiertos carecen de sus datos de ventas o comensales.',
      'daily')
  if(monthRow.status==='partial')
    push('partial','info','Mes con datos parciales',
      'Solo hay '+monthRow.recordedDays+' de '+monthRow.daysInMonth+
      ' jornadas registradas. Los días faltantes no son cero y no se generan previsiones automáticas.',
      'daily')
  else if(monthRow.status==='estimated')
    push('estimated','info','Importe histórico estimado',
      'Los importes estimados se muestran como referencia pero no activan alertas de incumplimiento.',
      'history')
  else if(monthRow.status==='missing'&&!future)
    push('missing',past?'warning':'info',past?'Mes anterior sin ventas verificadas':'Sin ventas verificadas todavía',
      'No hay suficientes datos para generar una evaluación financiera. No se presupone facturación cero.',
      'history')
  if(past&&monthRow.status!=='closed'&&metric&&!metric.complete&&metric.recordedDays>0)
    push('open-period','warning','Registro diario del mes anterior incompleto',
      'Jornadas finalizadas: '+metric.finalizedDays+'/'+metric.daysInMonth+
      '. Completa los días pendientes o utiliza Histórico verificado.',
      'daily')
  if(past&&!future&&metric?.complete&&
    (!metric.consumption?.food?.valid||!metric.consumption?.beverage?.valid))
    push('inventory','warning','Consumo de inventario no reconciliado',
      'Falta la conciliación válida de inventario food y/o beverage; se omiten sus indicadores de coste.',
      'inventory')

  // The next business rules are ONLY evaluated on a complete/verified source.
  if(trusted(monthRow)&&target){
    const goalChecks=[
      ['revenue','Facturación inferior al objetivo',monthRow.revenue,
        numeric(target.revenue_target),thresholds.revenueShortfallPct,
        monthRow.basis===target.revenue_basis,'goals','Ingresos'],
      ['covers','Comensales inferiores al objetivo',numeric(monthRow.covers),
        numeric(target.covers_target),thresholds.coversShortfallPct,true,'goals','Comensales'],
      ['ticket','Ticket medio inferior al objetivo',numeric(monthRow.ticket),
        numeric(target.ticket_target),thresholds.ticketShortfallPct,
        monthRow.basis===target.revenue_basis,'goals','Ticket medio']
    ]
    for(const [key,title,actual,goal,threshold,compatible,action,label] of goalChecks){
      if(!compatible||!allowed(actual)||!allowed(goal)||goal<=0)continue
      const differencePct=round((goal-actual)/goal*100)
      if(differencePct>=threshold)
        push('target-'+key,'warning',title,
          label+' '+round(differencePct)+'% por debajo del objetivo (umbral '+threshold+
          '%). Se utiliza únicamente el mes completo o histórico verificado.',
          action,actual,goal)
    }
    // Ceiling on recorded spending is only meaningful after a consistent close
    // and includes raw purchase EXPENSES, not inventory consumption.
    const expenseLimit=numeric(target.expense_ceiling)
    if(monthRow.status==='closed'&&monthRow.closureStatus==='consistent'&&
      metric?.expenseTotal!=null&&metric.expenseBases?.length===1&&
      metric.expenseBases[0]===target.expense_basis&&
      !metric.overlappingExpenseCategories?.length&&
      allowed(expenseLimit)&&expenseLimit>0&&metric.expenseTotal>expenseLimit)
      push('budget','warning','Gastos registrados superan el presupuesto',
        'El total registrado (incluidas compras) supera el límite del objetivo. No sumes compras nuevamente al consumo de inventario.',
        'expenses',round(metric.expenseTotal),expenseLimit)
    if(metric?.complete && (monthRow.status!=='closed' || monthRow.closureStatus==='consistent')){
      for(const [kind,label] of [['food','Alimentos'],['beverage','Bebidas']]){
        const goal=numeric(target[kind+'_cost_ceiling_pct'])
        const rate=metric?.consumption?.[kind]?.rate
        if(monthRow.basis===target.revenue_basis&&allowed(goal)&&allowed(rate)&&rate>goal)
          push('cost-'+kind,'warning','Coste '+label.toLowerCase()+' superior al límite',
            'Coste sobre ventas de '+label.toLowerCase()+
            ' reconciliado con inventario y registrado en la misma base fiscal.',
            'inventory',rate,goal)
      }
    }
  }

  // Month-to-month revenue changes are not normalized for opening days.
  if(trusted(monthRow)&&trusted(before)&&monthRow.basis===before.basis&&
    before.revenue>0){
    const delta=round((monthRow.revenue-before.revenue)/before.revenue*100)
    if(delta<=-thresholds.revenueDropPct)
      push('sales-drop','warning','Caída de facturación frente al mes anterior',
        'Ingresos '+Math.abs(delta)+'% respecto al mes anterior. Comparación entre meses completos de igual base fiscal, sin ajustar por días abiertos.',
        'reports',monthRow.revenue,before.revenue)
  }

  // Category-level expense anomaly detection only for two consistent closed
  // months with non-overlapping net expense rows and observed category in both.
  if(monthRow.status==='closed'&&monthRow.closureStatus==='consistent'&&
    before?.status==='closed'&&before.closureStatus==='consistent'&&
    !metric?.overlappingExpenseCategories?.length&&
    !containsKindMix(expenses[before.month]||[]).length){
    const current=expenses[month]||[],previous=expenses[before.month]||[]
    if(current.every(e=>e.tax_basis==='net')&&previous.every(e=>e.tax_basis==='net')){
      const aggregate=rows=>{
        const values=new Map()
        for(const item of rows){
          const value=numeric(item.amount)
          if(!allowed(value)||value<0)continue
          values.set(item.category,round((values.get(item.category)||0)+value))
        }
        return values
      }
      const now=aggregate(current),then=aggregate(previous)
      for(const [category,amount] of now){
        const baseline=then.get(category)
        if(!allowed(baseline)||baseline<=0)continue
        const increase=round((amount-baseline)/baseline*100)
        if(increase>=thresholds.expenseIncreasePct)
          push('expense-'+category,'warning','Incremento de gasto: '+category,
            'El gasto neto por categoría ha subido '+increase+'% frente al mes anterior cerrado. Comprueba volúmenes, precios y posibles gastos extraordinarios.',
            'expenses',amount,baseline)
      }
    }
  }

  if(!target)
    push('no-goals','info','Sin objetivos para este mes',
      'Define los objetivos de ventas, comensales y costes para habilitar comparaciones verificables.',
      'goals')
  if(future)
    push('future','info','Mes futuro',
      'Los resultados futuros aún no se conocen. Revisa Forecasting para simulaciones, no para alertas sobre ventas reales.',
      'forecast')
  alerts.sort((a,b)=>levelRank[a.level]-levelRank[b.level]||a.id.localeCompare(b.id))
  return {
    alerts,
    counts:{critical:alerts.filter(x=>x.level==='critical').length,
      warning:alerts.filter(x=>x.level==='warning').length,
      info:alerts.filter(x=>x.level==='info').length},
    evaluated:trusted(monthRow),sourceStatus:monthRow.status,
    sourceBasis:monthRow.basis||null,
    coverage:{recorded:metric?.recordedDays??0,
      finalized:metric?.finalizedDays??0,
      expected:metric?.daysInMonth??null,
      coversFinalized:metric?.daily?.filter(x=>x.finalized).reduce((sum,x)=>sum+x.covers,0)??0,
      coversProvisional:metric?.daily?.filter(x=>!x.finalized).reduce((sum,x)=>sum+x.covers,0)??0},
    caveat:'Alertas calculadas al abrir/actualizar la página. No son notificaciones push ni auditoría contable.'
  }
}
