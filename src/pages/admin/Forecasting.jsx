import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import {
  defaultScenarios, historyBaseline, nextCanaryMonth,
  projectForecast, scenarioNames, shiftMonth, validateForecastPlan
} from '../../lib/analyticsForecast.mjs'

const currency = value => new Intl.NumberFormat('es-ES', { style:'currency',currency:'EUR' }).format(value)
const number = value => new Intl.NumberFormat('es-ES', { maximumFractionDigits:0 }).format(value)
const names = { conservative:'Conservador',base:'Base',optimistic:'Optimista' }
const colors = { conservative:'#b88d7b',base:'#e2b963',optimistic:'#89bda7' }
const initial = () => ({
  forecast_start:nextCanaryMonth(), tax_basis:'gross', baseline_mode:'history',
  manual_covers:'',manual_ticket:'',monthly_capacity:'',scenarios:defaultScenarios(),
  notes:''
})
const numberPattern = /^-?\d+(?:[.,]\d{1,2})?$/
function parseNumber(value) {
  const text = String(value ?? '').trim()
  return numberPattern.test(text) ? Number(text.replace(',','.')) : NaN
}
function formToPlan(form) {
  const scenarios = Object.fromEntries(scenarioNames.map(key => [key,{
    covers_growth_pct:parseNumber(form.scenarios[key]?.covers_growth_pct),
    ticket_growth_pct:parseNumber(form.scenarios[key]?.ticket_growth_pct)
  }]))
  return {
    forecast_start:form.forecast_start,
    tax_basis:form.tax_basis,
    baseline_mode:form.baseline_mode,
    manual_covers:form.manual_covers.trim() === '' ? null : Number(form.manual_covers),
    manual_ticket:form.manual_ticket.trim() === '' ? null : parseNumber(form.manual_ticket),
    monthly_capacity:form.monthly_capacity.trim() === '' ? null : Number(form.monthly_capacity),
    scenarios,notes:form.notes
  }
}
function fromSaved(row) {
  return {
    forecast_start:row.forecast_start.slice(0,7),
    tax_basis:row.tax_basis, baseline_mode:row.baseline_mode,
    manual_covers:row.manual_covers == null ? '' : String(row.manual_covers),
    manual_ticket:row.manual_ticket == null ? '' : String(row.manual_ticket),
    monthly_capacity:row.monthly_capacity == null ? '' : String(row.monthly_capacity),
    scenarios:row.scenarios || defaultScenarios(),
    notes:row.notes || ''
  }
}
function Chart({forecast}) {
  if (!forecast?.available) return null
  const max = Math.max(1,...forecast.series.flatMap(s=>s.points.map(point=>point.revenue)))
  const x = i => 48 + i * 61
  const y = amount => 205 - amount/max*165
  return <div style={{overflowX:'auto'}}><svg viewBox="0 0 760 248"
      role="img" aria-label="Comparación de ingresos mensuales de los escenarios de 12 meses"
      style={{width:'100%',minWidth:560,maxHeight:330}}>
      <line x1="45" y1="205" x2="738" y2="205" stroke="currentColor" opacity=".55"/>
      <line x1="45" y1="40" x2="738" y2="40" stroke="currentColor" opacity=".15"/>
      <text x="4" y="44" fill="currentColor" fontSize="12">{Math.round(max/1000)}k €</text>
      <text x="6" y="208" fill="currentColor" fontSize="12">0 €</text>
      {forecast.series.map(series=><polyline key={series.name} fill="none"
          stroke={colors[series.name]} strokeWidth="3"
          strokeLinejoin="round" strokeLinecap="round"
          points={series.points.map((p,i)=>x(i)+','+y(p.revenue)).join(' ')}/>)}
      {forecast.series.find(s=>s.name==='base').points.map((point,i)=>
        <text key={point.month} x={x(i)-12} y="227" fill="currentColor" fontSize="11">
          {point.month.slice(5)}
        </text>)}
    </svg></div>
}
export default function Forecasting() {
  const [month,setMonth] = useState(nextCanaryMonth)
  const [form,setForm] = useState(initial)
  const [history,setHistory] = useState([])
  const [targets,setTargets] = useState([])
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [dirty,setDirty] = useState(false)
  const [reload,setReload] = useState(0)
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')
  const [horizon,setHorizon] = useState(6)
  const [detail,setDetail] = useState('base')
  const monthStart = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month + '-01' : null
  useEffect(()=>{
    let active=true
    if (!monthStart) {
      setLoading(false);setError('Selecciona un mes inicial válido.')
      return ()=>{active=false}
    }
    const load=async()=>{
      setLoading(true);setError('');setMessage('')
      const [plans,historical,goals]=await Promise.all([
        supabase.from('analytics_forecast_plans')
          .select('forecast_start,tax_basis,baseline_mode,manual_covers,manual_ticket,monthly_capacity,scenarios,notes')
          .eq('forecast_start',monthStart).maybeSingle(),
        supabase.from('analytics_monthly_history')
          .select('month_start,revenue_total,covers,tax_basis,data_quality')
          .eq('data_quality','verified').lt('month_start',monthStart)
          .order('month_start',{ascending:false}).limit(60),
        supabase.from('analytics_monthly_targets')
          .select('month_start,revenue_target,revenue_basis')
          .gte('month_start',monthStart)
          .lt('month_start',shiftMonth(month,12)+'-01')
          .order('month_start',{ascending:true}).limit(12)
      ])
      if(!active)return
      const failed=[plans,historical,goals].find(result=>result.error)
      if(failed){setError('No se pudo cargar Forecasting: '+failed.error.message);setLoading(false);return}
      if((historical.data||[]).length===60){
        setError('Hay más de 60 meses históricos. El modelo no usará una muestra incompleta; solicita paginación.')
        setLoading(false);return
      }
      setHistory(historical.data||[])
      setTargets(goals.data||[])
      setForm(plans.data?fromSaved(plans.data):{...initial(),forecast_start:month})
      setDirty(false)
      setLoading(false)
    }
    load()
    return()=>{active=false}
  },[month,monthStart,reload])
  const update=(key,value)=>{setForm(old=>({...old,[key]:value}));setDirty(true);setError('');setMessage('')}
  const updateGrowth=(name,key,value)=>{
    setForm(old=>({...old,scenarios:{...old.scenarios,[name]:{...old.scenarios[name],[key]:value}}}))
    setDirty(true);setMessage('');setError('')
  }
  const plan=useMemo(()=>formToPlan(form),[form])
  const planErrors=useMemo(()=>validateForecastPlan(plan),[plan])
  const reference=useMemo(()=>historyBaseline(history,month,form.tax_basis),[history,month,form.tax_basis])
  const forecast=useMemo(()=>{
    if(planErrors.length||loading)return null
    try{return projectForecast(plan,history,targets)}
    catch{return null}
  },[plan,history,targets,planErrors,loading])
  const shown=forecast?.available ? forecast.series.find(s=>s.name===detail) : null
  const save=async event=>{
    event.preventDefault()
    if(planErrors.length){setError(planErrors[0]);return}
    if(plan.baseline_mode==='history'&&!reference){
      setError('No hay histórico verificado con copertos y misma base fiscal. Elige origen manual.');return
    }
    setSaving(true);setMessage('');setError('')
    const {error:writeError}=await supabase.rpc('analytics_save_forecast_plan',{
      p_forecast_start:monthStart,p_tax_basis:plan.tax_basis,
      p_baseline_mode:plan.baseline_mode,
      p_manual_covers:plan.baseline_mode==='manual'?plan.manual_covers:null,
      p_manual_ticket:plan.baseline_mode==='manual'?plan.manual_ticket:null,
      p_monthly_capacity:plan.monthly_capacity,
      p_scenarios:plan.scenarios,p_notes:plan.notes.trim()||null
    })
    setSaving(false)
    if(writeError){setError('No se pudieron guardar los supuestos: '+writeError.message);return}
    setMessage('Hipótesis guardadas en Supabase con auditoría. Los resultados se recalculan, no se guardan como ventas reales.')
    setDirty(false)
  }
  const selectMonth=value=>{
    if(dirty&&!window.confirm('Hay cambios sin guardar. ¿Cambiar de mes y descartarlos?'))return
    setMonth(value);setLoading(true);setError('')
  }
  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Forecasting · Escenarios 3 / 6 / 12 meses</h3>
      <p>Simulador financiero basado en <strong>comensales × ticket medio</strong>.
        Las tasas de crecimiento son hipótesis modificables, no predicciones de una IA.
        Los escenarios de ejemplo no son datos históricos reales.</p>
      <label>Primer mes de previsión
        <input type="month" value={month} disabled={saving} onChange={e=>selectMonth(e.target.value)}/>
      </label>
      {loading&&<p role="status">Cargando hipótesis, históricos y objetivos…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {message&&<p role="status">{message}</p>}
    </div>
    {!loading&&<form onSubmit={save} noValidate style={{display:'grid',gap:16}}>
      <div className="dashboard-panel">
        <h3>1. Punto de partida</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
          <label>Base fiscal de ventas
            <select value={form.tax_basis} disabled={saving} onChange={e=>update('tax_basis',e.target.value)}>
              <option value="gross">Bruto · con IGIC si aplica</option>
              <option value="net">Neto · sin IGIC</option>
            </select>
          </label>
          <label>Origen de referencia
            <select value={form.baseline_mode} disabled={saving} onChange={e=>update('baseline_mode',e.target.value)}>
              <option value="history">Histórico mensual verificado</option>
              <option value="manual">Hipótesis manual</option>
            </select>
          </label>
          <label>Capacidad máxima de comensales al mes · opcional
            <input type="text" inputMode="numeric" value={form.monthly_capacity}
              disabled={saving} placeholder="Sin límite definido"
              onChange={e=>update('monthly_capacity',e.target.value)}/>
          </label>
        </div>
        {form.baseline_mode==='history' ? reference
          ? <p>Base calculada con {reference.sampleSize} mes(es) verificados: <strong>{number(reference.covers)} comensales/mes</strong>,
             ticket ponderado <strong>{currency(reference.ticket)}</strong>.
             Fuente: {reference.months.join(', ')}.
             {reference.limited&&<strong> Muestra limitada o antigua: precisión no demostrada.</strong>}
            </p>
          : <p role="alert">No hay meses anteriores verificados con comensales y esta base fiscal.
              Importa Histórico verificado o cambia a origen manual.</p>
          : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12,marginTop:12}}>
              <label>Comensales al mes · hipótesis
                <input type="text" inputMode="numeric" value={form.manual_covers}
                  disabled={saving} placeholder="Ej. 600"
                  onChange={e=>update('manual_covers',e.target.value)}/>
              </label>
              <label>Ticket medio (€) · hipótesis
                <input type="text" inputMode="decimal" value={form.manual_ticket}
                  disabled={saving} placeholder="Ej. 40,00"
                  onChange={e=>update('manual_ticket',e.target.value)}/>
              </label>
            </div>}
      </div>
      <div className="dashboard-panel">
        <h3>2. Hipótesis de crecimiento mensual</h3>
        <p>Rangos permitidos: −20% a +20% por mes. Los valores iniciales son escenarios de ejemplo;
          modifícalos según la estrategia del restaurante.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(205px,1fr))',gap:12}}>
          {scenarioNames.map(name=><div key={name} style={{padding:14,border:'1px solid rgba(170,140,100,.4)',borderRadius:12,display:'grid',gap:10}}>
            <strong style={{color:colors[name]}}>{names[name]}</strong>
            <label>Variación comensales / mes (%)
              <input type="text" inputMode="decimal" value={form.scenarios[name].covers_growth_pct}
                disabled={saving} onChange={e=>updateGrowth(name,'covers_growth_pct',e.target.value)}/>
            </label>
            <label>Variación ticket / mes (%)
              <input type="text" inputMode="decimal" value={form.scenarios[name].ticket_growth_pct}
                disabled={saving} onChange={e=>updateGrowth(name,'ticket_growth_pct',e.target.value)}/>
            </label>
          </div>)}
        </div>
        <label>Notas del plan / origen de las hipótesis
          <textarea rows={2} maxLength={2000} value={form.notes} disabled={saving}
            onChange={e=>update('notes',e.target.value)}/>
        </label>
        {planErrors.length>0&&<div role="alert" className="manager-error">
          {planErrors.map(e=><p key={e}>{e}</p>)}
        </div>}
        <button type="submit" className="primary-button" disabled={saving||planErrors.length>0||!forecast?.available}>
          {saving?'Guardando…':'Guardar hipótesis en Supabase'}
        </button>
        {dirty&&<p role="status">Cambios sin guardar: el gráfico muestra la simulación actual.</p>}
      </div>
    </form>}
    {!loading&&forecast?.available&&<>
      <div className="dashboard-panel">
        <h3>3. Comparación de escenarios</h3>
        <div style={{display:'flex',flexWrap:'wrap',gap:10,marginBottom:12}}>
          {[3,6,12].map(n=><button type="button" key={n}
            className={horizon===n?'primary-button':'ghost-button'}
            onClick={()=>setHorizon(n)}>{n} meses</button>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
          {forecast.series.map(series=>{
            const summary=series.horizons.find(h=>h.months===horizon)
            return <div key={series.name} style={{border:'1px solid rgba(170,140,100,.4)',borderRadius:12,padding:14}}>
              <strong style={{color:colors[series.name]}}>{names[series.name]}</strong>
              <p style={{fontSize:'clamp(20px,2.5vw,28px)',fontWeight:700}}>{currency(summary.revenue)}</p>
              <p>{number(summary.covers)} comensales · ticket ponderado {summary.avgTicket==null?'—':currency(summary.avgTicket)}</p>
              <small>Facturación acumulada simulada durante {horizon} meses</small>
            </div>
          })}
        </div>
        <Chart forecast={forecast}/>
        <div style={{display:'flex',flexWrap:'wrap',gap:14,marginTop:10}}>
          {scenarioNames.map(name=><span key={name} style={{color:colors[name]}}>● {names[name]}</span>)}
        </div>
      </div>
      <div className="dashboard-panel">
        <h3>4. Proyección mensual y objetivos</h3>
        <label>Escenario para tabla
          <select value={detail} onChange={e=>setDetail(e.target.value)}>
            {scenarioNames.map(name=><option key={name} value={name}>{names[name]}</option>)}
          </select>
        </label>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'separate',borderSpacing:'0 8px'}}>
            <thead><tr><th>Mes</th><th>Comensales</th><th>Ticket</th><th>Ingresos</th><th>Comparación objetivo</th></tr></thead>
            <tbody>{shown.points.slice(0,horizon).map(point=><tr key={point.month}>
              <td>{point.month}</td>
              <td>{number(point.covers)}{point.capped?' *':''}</td>
              <td>{currency(point.ticket)}</td>
              <td><strong>{currency(point.revenue)}</strong></td>
              <td>{point.revenueTarget===null?'Sin objetivo comparable':
                (point.targetDelta>=0?'+':'')+currency(point.targetDelta)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {shown.points.some(p=>p.capped)&&<p>* Capacidad mensual máxima aplicada al escenario.</p>}
        <p>Los objetivos solo se comparan cuando su base fiscal coincide. Diferencia positiva no garantiza resultado real.</p>
      </div>
      <div className="dashboard-panel">
        <h3>Interpretación y límites</h3>
        <p><strong>Tipo de resultado: simulación, no pronóstico garantizado.</strong>
          {form.baseline_mode==='manual'?' Parte de una hipótesis manual.':' Parte de meses históricos verificados, no de datos estimados.'}
          No incluye estacionalidad automática, cambios de precios, inflación, IGIC reconciliado,
          gastos, nóminas, inventario ni beneficio real.</p>
        <p>Crecer un 3% al mes durante 12 meses implica crecimiento compuesto, no sumar 3 puntos porcentuales cada mes.
          Si cambias el Histórico, la simulación se recalcula cuando vuelvas a entrar.</p>
      </div>
    </>}
  </div>
}
