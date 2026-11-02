import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { closeStatus, closeReadyForSubmission } from '../../lib/analyticsMonthlyClose.mjs'

const money=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n)
const currentMonthCanary=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit'
}).format(new Date())
const CHECKS=[
  ['sales','He comprobado el cierre de caja y la fuente de ventas netas seleccionada.'],
  ['expenses','He registrado todos los gastos del mes y eliminado posibles duplicidades.'],
  ['inventory','He verificado existencias y compras de alimentos y bebidas, sin duplicar el consumo.'],
  ['igic','He revisado que ingresos, gastos e inventarios estén expresados NETOS de IGIC.'],
  ['scope','Entiendo que es resultado operativo de gestión, NO beneficio fiscal ni contable definitivo.']
]
const emptyConfirmations=()=>Object.fromEntries(CHECKS.map(([key])=>[key,false]))
function Figures({figures,locked=false}) {
  if(!figures)return <p>No hay cifras disponibles.</p>
  const fields=[
    ['revenue_net','Ingresos netos'],
    ['food_consumption_net','Consumo alimentos neto'],
    ['beverage_consumption_net','Consumo bebidas neto'],
    ['other_expenses_net','Otros gastos netos'],
    ['operating_result_net','Resultado operativo de gestión']
  ]
  return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:12}}>
    {fields.map(([key,label])=><div key={key}
      style={{padding:14,border:'1px solid rgba(150,130,110,.35)',borderRadius:12}}>
      <small style={{opacity:.75}}>{label}</small>
      <p style={{fontSize:'clamp(19px,2.5vw,27px)',fontWeight:700}}>
        {figures[key] == null?'Pendiente':money(Number(figures[key]))}
      </p>
    </div>)}
    <div style={{padding:14,border:'1px solid rgba(150,130,110,.35)',borderRadius:12}}>
      <small style={{opacity:.75}}>Comensales del cierre</small>
      <p style={{fontSize:24,fontWeight:700}}>
        {figures.covers==null?'Sin dato consolidado':Number(figures.covers).toLocaleString('es-ES')}
      </p>
    </div>
    {locked&&<p><small>Valores congelados en la fecha del cierre; no se actualizan automáticamente.</small></p>}
  </div>
}

export default function MonthlyClose() {
  const [month,setMonth]=useState(currentMonthCanary)
  const [source,setSource]=useState('history')
  const [report,setReport]=useState(null)
  const [closure,setClosure]=useState(null)
  const [confirmations,setConfirmations]=useState(emptyConfirmations)
  const [evidence,setEvidence]=useState('')
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [reload,setReload]=useState(0)
  const monthStart=/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month+'-01':null
  const stale=closeStatus(report,closure)
  const canClose=closeReadyForSubmission(report,closure,confirmations,evidence)
  const loadSource=closure?.revenue_source||source

  useEffect(()=>{
    let active=true
    if(!monthStart){
      setLoading(false);setReport(null);setError('Selecciona un mes válido.')
      return ()=>{active=false}
    }
    async function load(){
      setLoading(true);setError('');setMessage('')
      const {data:row,error:closedError}=await supabase.from('analytics_monthly_closures')
        .select('month_start,revenue_source,revenue_net,covers,food_consumption_net,beverage_consumption_net,other_expenses_net,operating_result_net,source_fingerprint,evidence_note,closed_at')
        .eq('month_start',monthStart).maybeSingle()
      if(!active)return
      if(closedError){
        setError('No se pudo leer el cierre: '+closedError.message)
        setReport(null);setClosure(null);setLoading(false);return
      }
      setClosure(row||null)
      const {data:evaluation,error:evalError}=await supabase.rpc(
        'analytics_evaluate_month_close',{p_month_start:monthStart,p_revenue_source:row?.revenue_source||source}
      )
      if(!active)return
      if(evalError){
        setError('No se pudo conciliar el mes: '+evalError.message)
        setReport(null)
      }else setReport(evaluation)
      setLoading(false)
    }
    load()
    return ()=>{active=false}
  },[monthStart,source,reload])

  const updateMonth=value=>{
    setMonth(value)
    setConfirmations(emptyConfirmations())
    setEvidence('')
    setReport(null);setClosure(null)
    setLoading(true);setError('');setMessage('')
  }
  const updateSource=value=>{
    setSource(value)
    setConfirmations(emptyConfirmations())
    setReport(null)
    setLoading(true);setError('');setMessage('')
  }
  const finalize=async event=>{
    event.preventDefault()
    setError('');setMessage('')
    if(!canClose){setError('Revisa los bloqueos, confirma todas las casillas y describe las evidencias.');return}
    if(!window.confirm('¿Cerrar DEFINITIVAMENTE '+month+'? Se guardará una copia inmutable de los datos conciliados. No existe edición automática del cierre.'))return
    setSaving(true)
    const {error:saveError}=await supabase.rpc('analytics_finalize_month_close',{
      p_month_start:monthStart,p_revenue_source:loadSource,
      p_confirmations:confirmations,p_evidence_note:evidence.trim()
    })
    setSaving(false)
    if(saveError){setError('El cierre fue rechazado por Supabase: '+saveError.message);setReload(n=>n+1);return}
    setMessage('Mes cerrado en Supabase. El resultado es un cierre operativo de gestión, no beneficio fiscal.')
    setReload(n=>n+1)
  }
  const figures=report?.ready?report.figures:null
  const savedFigures=closure?{
    revenue_net:closure.revenue_net,
    covers:closure.covers,
    food_consumption_net:closure.food_consumption_net,
    beverage_consumption_net:closure.beverage_consumption_net,
    other_expenses_net:closure.other_expenses_net,
    operating_result_net:closure.operating_result_net
  }:null

  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Cierre mensual · Conciliación</h3>
      <p>Conciliación de ingresos, compras, inventarios y gastos, sin sumar los
        totales históricos a los registros diarios. <strong>Los cierres anteriores son inmutables.</strong></p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
        <label>Mes
          <input type="month" value={month} disabled={saving} onChange={e=>updateMonth(e.target.value)}/>
        </label>
        <label>Fuente exclusiva de ingresos
          <select value={loadSource} disabled={saving||Boolean(closure)} onChange={e=>updateSource(e.target.value)}>
            <option value="history">Histórico completo verificado</option>
            <option value="daily">Registro diario completo y finalizado</option>
          </select>
        </label>
        <button type="button" className="ghost-button" disabled={loading||saving}
          onClick={()=>setReload(n=>n+1)}>Actualizar conciliación</button>
      </div>
      {loading&&<p role="status">Verificando datos directamente en Supabase…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {message&&<p role="status">{message}</p>}
    </div>
    {!loading&&closure&&<div className="dashboard-panel">
      <h3>Mes cerrado · {closure.month_start.slice(0,7)}</h3>
      <p><strong>Fecha del cierre:</strong> {new Date(closure.closed_at).toLocaleString('es-ES')}</p>
      <p><strong>Fuente:</strong> {closure.revenue_source==='daily'?'Registro diario':'Histórico verificado'}</p>
      <Figures figures={savedFigures} locked />
      <p><strong>Evidencias registradas:</strong> {closure.evidence_note}</p>
      {stale==='changed'&&<p role="alert" className="manager-error">
        Atención: las fuentes han cambiado desde el cierre. Las cifras guardadas
        siguen siendo el histórico original, pero requieren revisión contable.
        No se sustituyen automáticamente.
      </p>}
      {stale==='consistent'&&<p role="status">Fuentes actuales coinciden con la fotografía del cierre.</p>}
      {stale==='unavailable'&&<p role="alert">No se ha podido comprobar si las fuentes siguen intactas.</p>}
    </div>}
    {!loading&&report&&<div className="dashboard-panel">
      <h3>Estado de la conciliación</h3>
      <p><strong>{report.ready?'Preparado para cierre':'Pendiente de reconciliación'}</strong></p>
      <p>Jornadas registradas: {report.coverage?.daily_days??0}
        {' '}de {report.coverage?.days_expected??'?'} · Finalizadas: {report.coverage?.daily_finalized??0}.
        {' '}Registros de Gastos: {report.coverage?.expense_records??0}.</p>
      {(report.issues||[]).length>0&&<div role="alert">
        <h4>Bloqueos</h4>
        <ul>{report.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>
      </div>}
      {(report.warnings||[]).length>0&&<div>
        <h4>Avisos</h4>
        <ul>{report.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>
      </div>}
    </div>}
    {!loading&&!closure&&report?.ready&&<div className="dashboard-panel">
      <h3>Resultado neto preliminar · listo para revisión</h3>
      <Figures figures={figures}/>
      <p><strong>Fórmula:</strong> ingresos netos − consumo neto de alimentos −
        consumo neto de bebidas − gastos netos de otras categorías.</p>
      <p>Las compras de comida y bebida se integran en la fórmula de inventario
        (existencias iniciales + compras + ajustes externos − existencias finales).
        <strong> No se deducen por segunda vez.</strong></p>
    </div>}
    {!loading&&!closure&&<div className="dashboard-panel">
      <h3>Confirmaciones del responsable</h3>
      {!report?.ready&&<p>Corrige primero los bloqueos en Registro diario, Histórico,
        Gastos o Inventario. No podrás cerrar un mes incompleto.</p>}
      <form onSubmit={finalize} style={{display:'grid',gap:12}}>
        {CHECKS.map(([key,label])=><label key={key}
          style={{display:'flex',gap:10,alignItems:'start'}}>
          <input type="checkbox" checked={confirmations[key]} disabled={!report?.ready||saving}
            onChange={e=>setConfirmations(old=>({...old,[key]:e.target.checked}))}/>
          <span>{label}</span>
        </label>)}
        <label>Evidencia de conciliación (10–1.500 caracteres)
          <textarea required rows={3} minLength={10} maxLength={1500}
            value={evidence} disabled={!report?.ready||saving}
            onChange={e=>setEvidence(e.target.value)}
            placeholder="Ej. ventas según cierre TPV de octubre; Gastos contrastados con facturas y existencias físicas revisadas."/>
        </label>
        <button className="primary-button" type="submit"
          disabled={!canClose||loading||saving}>
          {saving?'Cerrando…':'Cerrar mes definitivamente'}
        </button>
      </form>
      <p>El servidor vuelve a calcular todas las cifras antes del cierre.
        No acepta importes calculados por el navegador. Los registros originales
        siguen pudiendo corregirse en sus módulos; en ese caso el cierre mostrará una alerta de discrepancia.</p>
    </div>}
  </div>
}
