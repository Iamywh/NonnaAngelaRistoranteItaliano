import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { checkBreakEvenPlan, parseBreakEvenFields, simulateBreakEven } from '../../lib/analyticsBreakEven.mjs'

const euro=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n)
const integer=n=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:0}).format(n)
const currentMonth=()=> {
  const fields=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit'
  }).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
  return fields.year+'-'+fields.month
}
const nextMonth=month=>{
  const [year,n]=month.split('-').map(Number)
  return new Date(Date.UTC(year,n,1)).toISOString().slice(0,10)
}
const empty=month=>({
  month,openDays:'24',lunchDays:'24',dinnerDays:'24',
  ticketNet:'',fixedMonthlyNet:'',variablePct:'',
  plannedCovers:'800',lunchSharePct:'50',
  lunchCapacity:'',dinnerCapacity:'',notes:''
})
const textField=[
  ['openDays','Días abiertos del mes','numeric'],
  ['lunchDays','Días con servicio de almuerzo','numeric'],
  ['dinnerDays','Días con servicio de cena','numeric'],
  ['ticketNet','Ticket medio NETO por comensal (€)','decimal'],
  ['fixedMonthlyNet','Costes fijos mensuales NETOS (€)','decimal'],
  ['variablePct','Costes variables (% de ventas NETAS)','decimal'],
  ['plannedCovers','Objetivo de comensales al mes','numeric'],
  ['lunchSharePct','Porcentaje de comensales previsto en almuerzo (0–100)','numeric'],
  ['lunchCapacity','Capacidad por almuerzo, opcional','numeric'],
  ['dinnerCapacity','Capacidad por cena, opcional','numeric']
]
const formatPart=(value,count)=>count>0?integer(value/count):'—'

function Metric({title,value,note}){
  return <div style={{border:'1px solid rgba(170,140,100,.33)',borderRadius:12,padding:14,display:'grid',gap:4,minWidth:0}}>
    <small style={{opacity:.75}}>{title}</small>
    <strong style={{fontSize:'clamp(19px,2.7vw,28px)',overflowWrap:'anywhere'}}>{value}</strong>
    {note&&<small style={{opacity:.7}}>{note}</small>}
  </div>
}
export default function BreakEven() {
  const [month,setMonth]=useState(currentMonth)
  const [form,setForm]=useState(()=>empty(currentMonth()))
  const [notes,setNotes]=useState('')
  const [daily,setDaily]=useState([])
  const [expenses,setExpenses]=useState([])
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [changed,setChanged]=useState(false)
  const [reload,setReload]=useState(0)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const start=/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month+'-01':null
  const end=start?nextMonth(month):null

  useEffect(()=>{
    let active=true
    if(!start){setError('Selecciona un mes válido.');setLoading(false);return()=>{active=false}}
    async function load(){
      setLoading(true);setError('');setMessage('')
      const [plan,days,costs]=await Promise.all([
        supabase.from('analytics_break_even_plans')
          .select('month_start,open_days,lunch_days,dinner_days,ticket_net,fixed_monthly_net,variable_pct,planned_covers,lunch_share_pct,lunch_capacity,dinner_capacity,notes')
          .eq('month_start',start).maybeSingle(),
        supabase.from('analytics_daily_entries')
          .select('business_date,status,lunch_status,dinner_status,analytics_service_entries(service_type,covers)')
          .gte('business_date',start).lt('business_date',end).limit(35),
        supabase.from('analytics_expenses')
          .select('period_kind,category,amount,tax_basis')
          .gte('period_date',start).lt('period_date',end).limit(1000)
      ])
      if(!active)return
      const failed=[plan,days,costs].find(r=>r.error)
      if(failed){
        setError('No se pudieron cargar los datos: '+failed.error.message)
        setDaily([]);setExpenses([])
      }else if((costs.data||[]).length>=1000){
        setError('Más de 1.000 gastos registrados. No se puede mostrar una referencia parcial segura.')
        setDaily([]);setExpenses([])
      }else{
        setDaily(days.data||[])
        setExpenses(costs.data||[])
        if(plan.data){
          const row=plan.data
          setForm({
            month,
            openDays:String(row.open_days),lunchDays:String(row.lunch_days),
            dinnerDays:String(row.dinner_days),ticketNet:String(row.ticket_net),
            fixedMonthlyNet:String(row.fixed_monthly_net),variablePct:String(row.variable_pct),
            plannedCovers:String(row.planned_covers),lunchSharePct:String(row.lunch_share_pct),
            lunchCapacity:row.lunch_capacity==null?'':String(row.lunch_capacity),
            dinnerCapacity:row.dinner_capacity==null?'':String(row.dinner_capacity)
          })
          setNotes(row.notes||'')
        }else{setForm(empty(month));setNotes('')}
        setChanged(false)
      }
      setLoading(false)
    }
    load()
    return()=>{active=false}
  },[month,start,end,reload])

  const plan=useMemo(()=>parseBreakEvenFields(form),[form])
  const errors=useMemo(()=>checkBreakEvenPlan(plan),[plan])
  const result=useMemo(()=>simulateBreakEven(plan),[plan])

  const actual=useMemo(()=>{
    let lunch=0,dinner=0,finalized=0
    for(const day of daily){
      if(day.status==='finalized')finalized++
      for(const service of day.analytics_service_entries||[]){
        if(service.service_type==='lunch')lunch+=Number(service.covers)||0
        if(service.service_type==='dinner')dinner+=Number(service.covers)||0
      }
    }
    return {lunch,dinner,total:lunch+dinner,days:daily.length,finalized}
  },[daily])
  const expenseReference=useMemo(()=>{
    const nonPurchases=expenses.filter(e=>!['food_purchases','beverage_purchases'].includes(e.category))
    const net=nonPurchases.filter(e=>e.tax_basis==='net')
    const incompatible=nonPurchases.filter(e=>e.tax_basis!=='net')
    const kinds=new Map()
    for(const row of net){
      const set=kinds.get(row.category)||new Set()
      set.add(row.period_kind);kinds.set(row.category,set)
    }
    return {sum:net.reduce((n,e)=>n+Number(e.amount),0),count:net.length,
      incompatible:incompatible.length,
      overlaps:[...kinds.entries()].filter(([,set])=>set.size>1).map(([key])=>key)}
  },[expenses])
  const update=(name,value)=>{
    setForm(old=>({...old,[name]:value}))
    setChanged(true);setError('');setMessage('')
  }
  const selectMonth=value=>{
    if(changed&&!window.confirm('Cambios sin guardar. ¿Descartarlos y cambiar de mes?'))return
    setMonth(value);setLoading(true)
  }
  const save=async event=>{
    event.preventDefault()
    if(Object.keys(errors).length){
      const [key,text]=Object.entries(errors)[0]
      setError((textField.find(x=>x[0]===key)?.[1]||key)+': '+text)
      return
    }
    setSaving(true);setError('');setMessage('')
    const {error:writeError}=await supabase.rpc('analytics_save_break_even_plan',{
      p_month_start:start,p_open_days:plan.openDays,
      p_lunch_days:plan.lunchDays,p_dinner_days:plan.dinnerDays,
      p_ticket_net:plan.ticketNet,p_fixed_monthly_net:plan.fixedMonthlyNet,
      p_variable_pct:plan.variablePct,p_planned_covers:plan.plannedCovers,
      p_lunch_share_pct:plan.lunchSharePct,p_lunch_capacity:plan.lunchCapacity,
      p_dinner_capacity:plan.dinnerCapacity,p_notes:notes.trim()||null
    })
    setSaving(false)
    if(writeError){setError('No se pudo guardar el escenario: '+writeError.message);return}
    setChanged(false)
    setMessage('Hipótesis de break-even guardadas y auditadas. Las ventas y las reservas no han cambiado.')
  }
  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Break-even · Punto de equilibrio operativo</h3>
      <p>¿Cuántas personas necesitamos atender para cubrir los costes del mes?
        Las cifras son <strong>hipótesis NETAS de IGIC</strong>, no beneficios contables ni datos de caja.</p>
      <label>Mes de trabajo
        <input type="month" value={month} disabled={saving}
          onChange={e=>selectMonth(e.target.value)}/>
      </label>
      <p>Almuerzo y cena pueden tener distintos días de apertura.
        Se calculan comensales por servicio, no por mesa.</p>
      {loading&&<p role="status">Cargando escenario y datos registrados…</p>}
      {error&&<p className="manager-error" role="alert">{error}</p>}
      {message&&<p role="status">{message}</p>}
    </div>
    {!loading&&<div className="dashboard-panel">
      <h3>1. Parámetros del escenario</h3>
      <p>Valores de apertura iniciales: 24 días, dos servicios y 800 comensales.
        <strong> Son supuestos editables, no datos reales.</strong>
        El ticket, los costes fijos y el porcentaje variable deben introducirse NETOS de IGIC.</p>
      <form noValidate onSubmit={save} style={{display:'grid',gap:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
          {textField.map(([key,label,mode])=><label key={key}>{label}
            <input type="text" inputMode={mode} value={form[key]} autoComplete="off"
              disabled={saving} aria-invalid={Boolean(errors[key])}
              placeholder={key==='ticketNet'?'Ej. 23,36':key==='variablePct'?'Ej. 30':''}
              onChange={e=>update(key,e.target.value)}/>
            {errors[key]&&<small className="manager-error" role="alert">{errors[key]}</small>}
          </label>)}
        </div>
        <label>Notas / fuente de las hipótesis
          <textarea rows={2} maxLength={2000} value={notes} disabled={saving}
            onChange={e=>{setNotes(e.target.value);setChanged(true)}}/>
        </label>
        <p>Costes variables: porcentaje global estimado por venta (ingredientes, bebidas y otros
          consumibles variables), <strong>sin incluir de nuevo esos mismos importes en costes fijos</strong>.
          No se extraen automáticamente de Gastos hasta validar la contabilidad.</p>
        <button type="submit" className="primary-button"
          disabled={saving||Object.keys(errors).length>0}>
          {saving?'Guardando…':'Guardar escenario en Supabase'}
        </button>
        {changed&&<small role="status">Los cambios sin guardar solo afectan a esta simulación.</small>}
      </form>
    </div>}
    {!loading&&result.valid&&<>
      <div className="dashboard-panel">
        <h3>2. Resultado del punto de equilibrio</h3>
        {!result.viable&&<p role="alert" className="manager-error">
          Sin margen de contribución positivo: el ticket no cubre los costes variables por comensal.
          Aumenta el ticket neto o reduce el porcentaje variable.
        </p>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
          <Metric title="Contribución por comensal" value={euro(result.contribution)}
            note="Ticket neto menos coste variable por persona"/>
          <Metric title="Punto de equilibrio mensual"
            value={result.coversRequired==null?'No alcanzable':integer(result.coversRequired)+' comensales'}
            note="Redondeado al siguiente comensal completo"/>
          <Metric title="Facturación neta necesaria"
            value={result.breakEvenRevenue==null?'—':euro(result.breakEvenRevenue)}/>
          <Metric title="Comensales/día necesarios"
            value={result.dailyAverageRequired==null?'—':integer(result.dailyAverageRequired)}
            note="Promedio sobre días de apertura"/>
          <Metric title="Facturación neta prevista" value={euro(result.plannedRevenue)}
            note={'Con '+integer(plan.plannedCovers)+' comensales hipotéticos'}/>
          <Metric title="Saldo operativo SIMULADO" value={euro(result.simulatedOperatingBalance)}
            note="Antes de otros ajustes; NO es beneficio contable"/>
        </div>
        {result.coversRequired!=null&&<p>
          Frente a tu objetivo de {integer(plan.plannedCovers)} comensales:
          <strong> {result.distanceCovers>=0?
            '+'+integer(result.distanceCovers)+' por encima del equilibrio':
            integer(-result.distanceCovers)+' por debajo del equilibrio'}.</strong>
        </p>}
      </div>
      <div className="dashboard-panel">
        <h3>3. Reparto operativo entre almuerzo y cena</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
          {[
            ['Almuerzo',result.services.lunch],
            ['Cena',result.services.dinner]
          ].map(([label,service])=><div key={label}
            style={{border:'1px solid rgba(170,140,100,.36)',padding:14,borderRadius:12}}>
            <h4>{label} · {service.count} servicios/mes</h4>
            <p>Plan: <strong>{integer(service.plannedCovers)} comensales/mes</strong></p>
            <p>Promedio planificado: <strong>{service.plannedPerService} por servicio</strong></p>
            <p>Umbral de equilibrio: <strong>{service.requiredPerService==null?'—':integer(service.requiredPerService)+' por servicio'}</strong></p>
            {service.maxCapacity!=null&&<p>Capacidad indicada: {integer(service.maxCapacity)} por servicio</p>}
          </div>)}
        </div>
        {result.capacityAlerts.length>0&&<div role="alert" className="manager-error">
          {result.capacityAlerts.map(a=><p key={a}>{a}</p>)}
        </div>}
        <p>La proporción de almuerzos es una hipótesis de reparto, no una previsión de demanda.
          Los servicios se cuentan por su apertura efectiva: una cena cerrada no se trata como un servicio disponible.</p>
      </div>
    </>}
    {!loading&&<div className="dashboard-panel">
      <h3>4. Seguimiento REAL de comensales</h3>
      <p>Datos leídos de <strong>Registro diario</strong> en el mes seleccionado,
        sin modificar registros y sin inventar clientes para fechas vacías.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
        <Metric title="Almuerzos registrados" value={integer(actual.lunch)} />
        <Metric title="Cenas registradas" value={integer(actual.dinner)} />
        <Metric title="Total comensales registrados" value={integer(actual.total)} />
        <Metric title="Jornadas registradas" value={actual.days+' · '+actual.finalized+' finalizadas'} />
      </div>
      {actual.days===0?<p>No hay días introducidos para este mes. Registra cada jornada en Registro diario.</p>:
        <p>Los {integer(actual.total)} comensales corresponden únicamente a
          {actual.days} fecha(s) registradas. {actual.days-actual.finalized>0?
          'Hay borradores: estos totales aún son provisionales.':''}
        </p>}
    </div>}
    {!loading&&<div className="dashboard-panel">
      <h3>5. Referencia de Gastos (no aplicada automáticamente)</h3>
      <p>Gastos no clasificados como compras de alimentos/bebidas, guardados
        <strong> netos de IGIC</strong> en el mes: <strong>{euro(expenseReference.sum)}</strong>
        {' '}({expenseReference.count} registros). Esta cifra puede estar incompleta
        y contener gastos variables: <strong>no se usa como coste fijo automático</strong>.
      </p>
      {expenseReference.incompatible>0&&<p role="status">
        {expenseReference.incompatible} registros brutos no se han incluido en la referencia neta.
      </p>}
      {expenseReference.overlaps.length>0&&<p role="alert">
        Revisa categorías registradas tanto diario como mensual: {expenseReference.overlaps.join(', ')}.
      </p>}
      <p>Para resultados económicos reales hará falta conciliar IGIC, nóminas, gastos de estructura
        e inventario. Este módulo mide el umbral operativo bajo las hipótesis que tú defines.</p>
    </div>}
  </div>
}
