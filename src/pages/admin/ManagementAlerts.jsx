import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import {monthlyOverview} from '../../lib/analyticsMetrics.mjs'
import {buildAnalyticsReport,reportMonths,reportMonthEnd} from '../../lib/analyticsReports.mjs'
import {buildManagementAlerts,DEFAULT_ALERT_THRESHOLDS,validateAlertThresholds} from '../../lib/analyticsAlerts.mjs'

const canaryMonth=()=>{
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit'
 }).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
 return parts.year+'-'+parts.month
}
const euro=value=>value==null?'—':new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(value)
const int=value=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:0}).format(value)
const thresholds=[
 ['revenueShortfallPct','Desviación mínima de facturación (%)'],
 ['coversShortfallPct','Desviación mínima de comensales (%)'],
 ['ticketShortfallPct','Desviación mínima de ticket medio (%)'],
 ['revenueDropPct','Caída mensual de facturación (%)'],
 ['expenseIncreasePct','Aumento de gasto por categoría (%)']
]
const labels={critical:'Revisar datos',warning:'Atención',info:'Información'}
const accent={critical:'#b05a55',warning:'#b28b45',info:'#738786'}
const navLabels={
 daily:'Registro diario',history:'Histórico',goals:'Objetivos',
 inventory:'Inventario',expenses:'Gastos',reports:'Reportes',
 closing:'Cierre mensual',forecast:'Forecasting'
}
export default function ManagementAlerts({onNavigate}){
 const [month,setMonth]=useState(canaryMonth)
 const [refresh,setRefresh]=useState(0)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [raw,setRaw]=useState(null)
 const [rules,setRules]=useState({...DEFAULT_ALERT_THRESHOLDS})
 const period=useMemo(()=>{
  try{return reportMonths(month,2)}catch{return null}
 },[month])
 const start=period?.[0]+'-01'
 const end=period?reportMonthEnd(month):null
 useEffect(()=>{
  let active=true
  if(!period){setLoading(false);setRaw(null);setError('Selecciona un mes válido');return()=>{active=false}}
  async function load(){
   setLoading(true);setRaw(null);setError('')
   const [days,expenses,inventories,history,targets,closures]=await Promise.all([
    supabase.from('analytics_daily_entries')
     .select('business_date,status,lunch_status,dinner_status,analytics_service_entries(service_type,covers,food_revenue_amount,beverage_revenue_amount,tax_basis)')
     .gte('business_date',start).lt('business_date',end).order('business_date').limit(70),
    supabase.from('analytics_expenses')
     .select('period_date,period_kind,category,amount,tax_basis')
     .gte('period_date',start).lt('period_date',end).order('period_date').limit(1000),
    supabase.from('analytics_monthly_inventory')
     .select('month_start,stock_type,opening_value,closing_value,external_adjustment,valuation_basis,purchases_reconciled,reconciled_purchase_total,reconciled_purchase_count')
     .gte('month_start',start).lt('month_start',end).limit(6),
    supabase.from('analytics_monthly_history')
     .select('month_start,revenue_total,covers,tax_basis,data_quality')
     .gte('month_start',start).lt('month_start',end).limit(3),
    supabase.from('analytics_monthly_targets')
     .select('month_start,revenue_target,covers_target,ticket_target,expense_ceiling,food_cost_ceiling_pct,beverage_cost_ceiling_pct,revenue_basis,expense_basis')
     .gte('month_start',start).lt('month_start',end).limit(3),
    supabase.from('analytics_monthly_closures')
     .select('month_start,revenue_source,revenue_net,covers,food_consumption_net,beverage_consumption_net,other_expenses_net,operating_result_net,source_fingerprint,closed_at')
     .gte('month_start',start).lt('month_start',end).limit(3)
   ])
   if(!active)return
   const all=[days,expenses,inventories,history,targets,closures]
   const failed=all.find(r=>r.error)
   if(failed){setError('No se pudieron comprobar los indicadores: '+failed.error.message);setLoading(false);return}
   if(all.some((r,i)=>(r.data||[]).length >= [70,1000,6,3,3,3][i])){
    setError('Demasiados registros: no se mostrarán alertas con datos truncados. Revisa los registros.')
    setLoading(false);return
   }
   const checks={}
   await Promise.all((closures.data||[]).map(async row=>{
    const {data:review,error:rpcError}=await supabase.rpc('analytics_evaluate_month_close',{
     p_month_start:row.month_start,p_revenue_source:row.revenue_source
    })
    checks[row.month_start]=rpcError||!review?.fingerprint?'unavailable':
     review.fingerprint===row.source_fingerprint?'consistent':'changed'
   }))
   if(!active)return
   setRaw({days:days.data||[],expenses:expenses.data||[],
    inventories:inventories.data||[],history:history.data||[],
    targets:targets.data||[],closures:closures.data||[],closeChecks:checks})
   setLoading(false)
  }
  load()
  return()=>{active=false}
 },[start,end,refresh])

 const model=useMemo(()=>{
  if(!raw||!period)return null
  try{
   const report=buildAnalyticsReport({months:period,...raw})
   const metrics={}
   const targets={}
   const expenses={}
   for(const name of period){
    const first=name+'-01',last=reportMonthEnd(name)
    const expenseRows=raw.expenses.filter(row=>row.period_date>=first&&row.period_date<last)
    metrics[name]=monthlyOverview({
     month:name,
     dayEntries:raw.days.filter(day=>day.business_date>=first&&day.business_date<last),
     expenses:expenseRows,
     inventories:raw.inventories.filter(item=>item.month_start===first)
    })
    targets[name]=raw.targets.find(row=>row.month_start===first)||null
    expenses[name]=expenseRows
   }
   return buildManagementAlerts({
    month,currentMonth:canaryMonth(),report,metrics,targets,expenses,thresholds:rules
   })
  }catch(e){return {error:e.message}}
 },[raw,period,month,rules])
 const issue=validateAlertThresholds(rules)
 const openAction=tab=>{if(typeof onNavigate==='function')onNavigate(tab)}
 return <div style={{display:'grid',gap:16}}>
  <div className="dashboard-panel">
   <h3>Alertas inteligentes · Control de gestión</h3>
   <p>Reglas transparentes con datos de Supabase: el sistema señala problemas concretos
     de calidad, costes, ingresos y objetivos. <strong>No es una IA predictiva ni envía notificaciones push.</strong></p>
   <div style={{display:'flex',gap:12,alignItems:'end',flexWrap:'wrap'}}>
    <label>Mes analizado
     <input type="month" value={month} onChange={e=>{setMonth(e.target.value);setLoading(true)}}/>
    </label>
    <button type="button" className="ghost-button" disabled={loading}
     onClick={()=>setRefresh(n=>n+1)}>Actualizar desde Supabase</button>
   </div>
   {loading&&<p role="status">Analizando ingresos, objetivos, gastos y conciliaciones…</p>}
   {error&&<p role="alert" className="manager-error">{error}</p>}
   {model?.error&&<p role="alert" className="manager-error">{model.error}</p>}
  </div>
  <div className="dashboard-panel">
   <h3>Sensibilidad de las alertas</h3>
   <p>Puedes ajustar cuándo se muestra una desviación. Valores iniciales orientativos
     (<strong>no son límites contables ni objetivos reales</strong>). Estos ajustes se aplican
     en la sesión actual, sin guardarse en el servidor.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
    {thresholds.map(([key,label])=><label key={key}>{label}
     <input type="number" inputMode="numeric" min="1" max="100" step="1"
      value={rules[key]} onChange={e=>setRules(old=>({
       ...old,[key]:e.target.value===''?NaN:Number(e.target.value)
      }))}/>
    </label>)}
   </div>
   {issue.length>0&&<p role="alert" className="manager-error">
    Cada umbral debe ser un porcentaje entero entre 1 y 100.
   </p>}
   <button type="button" className="ghost-button" onClick={()=>setRules({...DEFAULT_ALERT_THRESHOLDS})}>
    Restablecer sensibilidad de ejemplo
   </button>
  </div>
  {!loading&&model&&!model.error&&<>
   <div className="dashboard-panel">
    <h3>Resumen del mes {month}</h3>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
     {[
      ['Revisión prioritaria',model.counts.critical,'critical'],
      ['Advertencias',model.counts.warning,'warning'],
      ['Información',model.counts.info,'info']
     ].map(([label,value,kind])=><div key={kind}
      style={{border:'1px solid rgba(135,135,135,.3)',borderRadius:12,padding:14}}>
      <small>{label}</small>
      <p style={{fontSize:28,fontWeight:700,color:accent[kind],margin:'6px 0'}}>{value}</p>
     </div>)}
    </div>
    <p><strong>Origen:</strong> {model.sourceStatus==='closed'?'Cierre mensual':
       model.sourceStatus==='verified'?'Histórico verificado':
       model.sourceStatus==='complete'?'Registro diario finalizado':
       model.sourceStatus==='partial'?'Registro diario parcial':
       model.sourceStatus==='estimated'?'Histórico estimado':'Sin datos confirmados'}.
       {' '}<strong>Evaluable para KPIs:</strong> {model.evaluated?'Sí':'No: faltan datos verificados o integridad del cierre'}.
    </p>
    <p>Registro diario: {model.coverage.recorded}/{model.coverage.expected??'?'} fechas
       {' · '}{model.coverage.finalized} finalizadas.
       {' '}Copertos en jornadas finalizadas: <strong>{int(model.coverage.coversFinalized)}</strong>.
       {model.coverage.coversProvisional>0&&
        <> Copertos provisionales (borradores): <strong>{int(model.coverage.coversProvisional)}</strong>.</>}
    </p>
    <p>Los días sin registrar no cuentan como cero. Un mes en curso no se compara con
      un objetivo mensual como si ya hubiera terminado.</p>
   </div>
   <div className="dashboard-panel">
    <h3>Alertas y acciones recomendadas</h3>
    {model.alerts.length===0?<p>No hay anomalías según las reglas actuales y los datos disponibles.
      Esto no significa que la contabilidad esté conciliada.</p>:
    <div style={{display:'grid',gap:12}}>
     {model.alerts.map(alert=><div key={alert.id}
      style={{border:'1px solid rgba(130,130,130,.3)',borderLeft:'4px solid '+accent[alert.level],
       padding:14,borderRadius:10,display:'grid',gap:8}}>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
       <strong>{alert.title}</strong>
       <small style={{color:accent[alert.level]}}>{labels[alert.level]}</small>
      </div>
      <p>{alert.detail}</p>
      {alert.observed!=null&&alert.reference!=null&&
       <small>Valor registrado: {int(alert.observed)} · referencia: {int(alert.reference)}
        {' '}(mismas unidades según la métrica).</small>}
      {navLabels[alert.action]&&<button type="button" className="ghost-button"
       onClick={()=>openAction(alert.action)}>
       Ir a {navLabels[alert.action]}
      </button>}
     </div>)}
    </div>}
   </div>
   <div className="dashboard-panel">
    <h3>Cómo interpretar estas alertas</h3>
    <p>Una desviación de objetivos solo se activa con fuentes completas y comparables.
       Las alertas de costes de comida y bebidas necesitan Registro diario finalizado e
       Inventario reconciliado en la misma base fiscal. Los aumentos de gastos por
       categoría requieren dos cierres mensuales íntegros y comparables.</p>
    <p>La comparación mensual de facturación no corrige estacionalidad, número de días abiertos
       ni promociones. Las alertas se recalculan cuando entras en esta pestaña o pulsas
       <strong> Actualizar</strong>; no se envían mensajes automáticos.</p>
   </div>
  </>}
 </div>
}
