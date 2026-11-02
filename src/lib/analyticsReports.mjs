import { monthlyOverview } from './analyticsMetrics.mjs'
import { actualForMonth } from './analyticsPlanning.mjs'

const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/
const round=n=>Math.round((n+Number.EPSILON)*100)/100
const asNumber=n=>n==null?null:Number(n)
const addMonth=(month,delta)=>{
  if(!MONTH.test(month))throw Error('Mes inválido')
  const [y,m]=month.split('-').map(Number)
  return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7)
}
export const reportMonths=(endMonth,count)=>{
  if(!MONTH.test(endMonth)||![1,3,6,12].includes(count))throw Error('Período inválido')
  return Array.from({length:count},(_,i)=>addMonth(endMonth,i+1-count))
}
export const reportMonthEnd=(month)=>addMonth(month,1)+'-01'
const categoryMap={
  food_purchases:'Compras alimentos',beverage_purchases:'Compras bebidas',
  payroll:'Personal',rent:'Alquiler',utilities:'Suministros',
  marketing:'Marketing',cleaning_supplies:'Limpieza',packaging:'Embalajes',
  maintenance:'Mantenimiento',professional_services:'Servicios profesionales',
  bank_fees:'Comisiones bancarias',other:'Otros'
}
const closureKeys=['revenue_net','covers','food_consumption_net','beverage_consumption_net','other_expenses_net','operating_result_net']
const warningsFor=(item,metric,history,closureStatus)=>{
  const notes=[]
  if(item.status==='partial')notes.push('Ventas parciales: no representan todo el mes.')
  if(item.status==='estimated')notes.push('Historico estimado: no usar como cifra verificada.')
  if(item.status==='missing')notes.push('No hay datos verificados de ventas.')
  if(closureStatus==='changed')notes.push('Fuentes modificadas despues del cierre; resultado historico requiere revision.')
  if(closureStatus==='unavailable'&&item.status==='closed')notes.push('No se pudo comprobar la integridad de las fuentes del cierre.')
  if(metric.recordedDays>0&&!metric.complete)notes.push(
    'Registro diario: '+metric.recordedDays+'/'+metric.daysInMonth+
    ' fechas; '+metric.finalizedDays+' finalizadas.')
  if(metric.revenueMixed)notes.push('Registro diario contiene bases brutas/netas mezcladas.')
  if(metric.missingOpenServices)notes.push('Hay servicios abiertos sin sus registros.')
  if(metric.expenseMixed)notes.push('Gastos brutos y netos: no sumar sin conciliacion.')
  if(metric.overlappingExpenseCategories.length)notes.push(
    'Posibles duplicidades de gastos diarios/mensuales: '+metric.overlappingExpenseCategories.join(', ')+'.')
  if(history&&metric.recordedDays>0&&item.status!=='closed')notes.push(
    'Hay Historico y Registro diario del mismo mes: no se sumaron.')
  return notes
}
export function buildAnalyticsReport({
  months,days=[],expenses=[],inventories=[],history=[],targets=[],closures=[],
  closeChecks={}
}){
  if(!Array.isArray(months)||months.length<1||months.length>12||
    months.some(m=>!MONTH.test(m))||new Set(months).size!==months.length)
    throw Error('Meses de informe invalidos')
  const results=months.map(month=>{
    const first=month+'-01',end=reportMonthEnd(month)
    const dayRows=days.filter(d=>d.business_date>=first&&d.business_date<end)
    const expRows=expenses.filter(e=>e.period_date>=first&&e.period_date<end)
    const invRows=inventories.filter(i=>i.month_start===first)
    const h=history.find(r=>r.month_start===first)
    const t=targets.find(r=>r.month_start===first)
    const close=closures.find(r=>r.month_start===first)
    const metric=monthlyOverview({month,dayEntries:dayRows,expenses:expRows,inventories:invRows})
    const actual=actualForMonth(metric,h)
    let status,basis,revenue,covers,source,food=null,beverage=null,other=null,operating=null
    let closureStatus=null
    if(close){
      status='closed';basis='net';source='Cierre mensual guardado'
      revenue=asNumber(close.revenue_net);covers=asNumber(close.covers)
      food=asNumber(close.food_consumption_net)
      beverage=asNumber(close.beverage_consumption_net)
      other=asNumber(close.other_expenses_net)
      operating=asNumber(close.operating_result_net)
      closureStatus=closeChecks[first]||'unavailable'
    }else if(actual.verified){
      status=actual.origin==='history'?'verified':'complete'
      basis=actual.basis;revenue=actual.revenue;covers=actual.covers
      source=actual.origin==='history'?'Historico verificado':'Registro diario finalizado'
    }else if(metric.validRevenue&&metric.recordedDays>0){
      status='partial';basis=metric.revenueBasis;revenue=metric.revenue
      covers=metric.covers;source='Registro diario parcial'
    }else if(h?.data_quality==='estimated'){
      status='estimated';basis=h.tax_basis;revenue=asNumber(h.revenue_total)
      covers=asNumber(h.covers);source='Historico estimado'
    }else{
      status='missing';basis=null;revenue=null;covers=null;source='Sin datos conciliados'
    }
    const ticket=revenue!=null&&covers!=null&&covers>0?round(revenue/covers):null
    const target=t?.revenue_target==null?null:Number(t.revenue_target)
    const comparable=status!=='partial'&&status!=='estimated'&&status!=='missing'&&
      target!==null&&basis===t.revenue_basis
    const targetDelta=comparable?round(revenue-target):null
    const costByBasis=metric.expenseBases.length===1&&!metric.overlappingExpenseCategories.length
      ?metric.expenseTotal:null
    const expenseBasis=costByBasis==null?null:metric.expenseBases[0]
    const item={
      month,status,source,basis,revenue,covers,ticket,target:target,
      targetBasis:t?.revenue_basis||null,targetDelta,
      recordedDays:metric.recordedDays,finalizedDays:metric.finalizedDays,
      daysInMonth:metric.daysInMonth,
      expenseTotal:costByBasis,expenseBasis,foodConsumption:food,
      beverageConsumption:beverage,otherExpenses:other,
      operatingResult:operating,closureStatus,
      closedAt:close?.closed_at||null,expenseRows:expRows.map(row=>({
        month,period:row.period_date,periodKind:row.period_kind,
        category:categoryMap[row.category]||row.category,
        amount:Number(row.amount),basis:row.tax_basis
      }))
    }
    item.warnings=warningsFor(item,metric,h,closureStatus)
    return item
  })
  const validated=results.filter(m=>['closed','verified','complete'].includes(m.status))
  const revenueBases=[...new Set(validated.filter(m=>m.revenue!==null).map(m=>m.basis))]
  const summedRevenue=revenueBases.length===1 && validated.length===results.length
    ?round(validated.reduce((sum,m)=>sum+m.revenue,0)):null
  const partialNotes=results.some(m=>!['closed','verified','complete'].includes(m.status))
  const summaries={
    fullyVerified:!partialNotes && revenueBases.length===1,
    revenueTotal:summedRevenue,revenueBasis:revenueBases.length===1?revenueBases[0]:null,
    closedMonths:results.filter(x=>x.status==='closed').length,
    verifiedMonths:validated.length,
    missingMonths:results.filter(x=>x.status==='missing').length,
    warnings:results.reduce((n,m)=>n+m.warnings.length,0)
  }
  return {months:results,summary:summaries,generatedAt:new Date().toISOString()}
}
