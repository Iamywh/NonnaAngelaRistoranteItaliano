import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

const blankService = type => ({ service_type:type, covers:'0', food_revenue_amount:'0', beverage_revenue_amount:'0', tax_basis:'gross', tax_details:{status:'unverified'},notes:'' })
const todayCanary = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const money = n => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n)
const sum = (a,b) => Number(a||0)+Number(b||0)
export default function DailyRegister() {
 const [date,setDate] = useState(todayCanary)
 const [statuses,setStatuses] = useState({lunch:'open',dinner:'open'})
 const [notes,setNotes] = useState('')
 const [services,setServices] = useState({lunch:blankService('lunch'),dinner:blankService('dinner')})
 const [status,setStatus] = useState('draft')
 const [origin,setOrigin] = useState('')
 const [refreshKey,setRefreshKey] = useState(0)
 const [loading,setLoading] = useState(true)
 const [saving,setSaving] = useState(false)
 const [message,setMessage] = useState('')
 const [error,setError] = useState('')
 useEffect(()=>{ let valid=true
  const load=async()=>{
   setLoading(true);setError('');setMessage('')
   const {data,error:e}=await supabase.from('analytics_daily_entries').select('id,notes,status,lunch_status,dinner_status,analytics_service_entries(service_type,covers,food_revenue_amount,beverage_revenue_amount,tax_basis,tax_details,notes)').eq('business_date',date).maybeSingle()
   if(!valid)return
   if(e){setError('No se pudieron cargar los datos: '+e.message);setLoading(false);return}
   setNotes(data?.notes||'');setStatus(data?.status||'draft')
   setOrigin('')
   if(data?.id){
     // Origin is optional until Phase 12 migration is installed; the main register
     // must remain usable even when the origin audit table does not exist yet.
     const {data:telegramOrigin}=await supabase.from('analytics_telegram_entry_audit')
       .select('id').eq('daily_entry_id',data.id).maybeSingle()
     if(!valid)return
     setOrigin(telegramOrigin?'telegram':'')
   }
   setStatuses({lunch:data?.lunch_status||'open',dinner:data?.dinner_status||'open'})
   const next={lunch:blankService('lunch'),dinner:blankService('dinner')}
   for(const s of data?.analytics_service_entries||[])if(next[s.service_type])next[s.service_type]={...s,covers:String(s.covers),food_revenue_amount:String(s.food_revenue_amount),beverage_revenue_amount:String(s.beverage_revenue_amount)}
   setServices(next);setLoading(false)
  };load();return()=>{valid=false}
 },[date,refreshKey])
 const setField=(type,field,value)=>setServices(prev=>({...prev,[type]:{...prev[type],[field]:value}}))
 const setServiceStatus=(type,value)=>{setStatuses(prev=>({...prev,[type]:value}));if(value==='closed')setServices(prev=>({...prev,[type]:{...prev[type],covers:'0',food_revenue_amount:'0',beverage_revenue_amount:'0'}}))}
 const save=async(finalize)=>{
  setError('');setMessage('')
  if(status==='finalized'){setError('Este día está cerrado. No se puede modificar.');return}
  const records=['lunch','dinner'].map(type=>({...services[type],covers:Number(services[type].covers),food_revenue_amount:Number(services[type].food_revenue_amount),beverage_revenue_amount:Number(services[type].beverage_revenue_amount)}))
  if(records.some(r=>!Number.isInteger(r.covers)||r.covers<0||![r.food_revenue_amount,r.beverage_revenue_amount].every(x=>Number.isFinite(x)&&x>=0)||!r.tax_basis)){setError('Revisa los importes y comensales.');return}
  if(finalize && !window.confirm('¿Finalizar este día? No podrá editarse después sin un procedimiento de reapertura.'))return
  setSaving(true)
  const {error:e}=await supabase.rpc('analytics_save_daily',{p_date:date,p_lunch_status:statuses.lunch,p_dinner_status:statuses.dinner,p_notes:notes,p_status:finalize?'finalized':'draft',p_services:records})
  setSaving(false)
  if(e){setError('No se pudo guardar: '+e.message);return}
  setStatus(finalize?'finalized':'draft');setMessage(finalize?'Día finalizado y guardado.':'Borrador guardado en Supabase.')
 }
 const revenue=type=>sum(services[type].food_revenue_amount,services[type].beverage_revenue_amount)
 const covers=type=>Number(services[type].covers)||0
 const renderService=(type,label)=><div className="dashboard-panel" key={type}>
  <h3>{label}</h3>
  <label>Estado del servicio <select disabled={loading||saving||status==='finalized'} value={statuses[type]} onChange={e=>setServiceStatus(type,e.target.value)}><option value="open">Abierto</option><option value="closed">Cerrado</option></select></label>
  {statuses[type]==='open'&&<div style={{display:'grid',gap:12,marginTop:12}}>
   <label>Comensales<input type="number" min="0" step="1" value={services[type].covers} disabled={saving||status==='finalized'} onChange={e=>setField(type,'covers',e.target.value)}/></label>
   <label>Ingresos comida (€)<input type="number" min="0" step="0.01" value={services[type].food_revenue_amount} disabled={saving||status==='finalized'} onChange={e=>setField(type,'food_revenue_amount',e.target.value)}/></label>
   <label>Ingresos bebidas (€)<input type="number" min="0" step="0.01" value={services[type].beverage_revenue_amount} disabled={saving||status==='finalized'} onChange={e=>setField(type,'beverage_revenue_amount',e.target.value)}/></label>
   <label>Importes <select value={services[type].tax_basis} disabled={saving||status==='finalized'} onChange={e=>setField(type,'tax_basis',e.target.value)}><option value="gross">IGIC incluido (bruto)</option><option value="net">Sin IGIC (neto)</option></select></label>
   <p>Desglose de IGIC: pendiente de verificar. No se calcula automáticamente la base imponible.</p>
   <label>Observaciones<input value={services[type].notes||''} disabled={saving||status==='finalized'} onChange={e=>setField(type,'notes',e.target.value)}/></label>
  </div>}
  <p><strong>Total: {money(revenue(type))}</strong> · {covers(type)} comensales</p>
 </div>
 return <div style={{display:'grid',gap:16}}>
  <div className="dashboard-panel"><h3>Registro diario</h3><p>Introduce los resultados de cada servicio. No se incluyen datos de reservas automáticamente.</p>
   <label>Fecha <input type="date" value={date} onChange={e=>setDate(e.target.value)} disabled={saving}/></label>
   <p>Estado: <strong>{status==='finalized'?'Finalizado':'Borrador'}</strong></p>
   {origin==='telegram'&&<p role="status">🤖 Origen: Telegram Analytics · /startentry. Verifica los importes antes de finalizar.</p>}
   <button type="button" className="ghost-button" disabled={saving||loading} onClick={()=>setRefreshKey(n=>n+1)}>Actualizar desde Supabase</button>
  </div>
  {loading?<p>Cargando registro…</p>:<>
   {renderService('lunch','Almuerzo')}
   {renderService('dinner','Cena')}
   <div className="dashboard-panel">
    <h3>Resumen del día</h3>
    <p>Ingresos registrados: <strong>{money(revenue('lunch')+revenue('dinner'))}</strong></p>
    <p>Comensales: <strong>{covers('lunch')+covers('dinner')}</strong></p>
    <p>Ticket medio: <strong>{covers('lunch')+covers('dinner')?money((revenue('lunch')+revenue('dinner'))/(covers('lunch')+covers('dinner'))):'—'}</strong></p>
    {services.lunch.tax_basis!==services.dinner.tax_basis&&<p role="alert">Atención: importes con distinta base fiscal. El total combina bruto y neto; no utilizar para cierres contables.</p>}
    <label>Notas del día <textarea value={notes} disabled={saving||status==='finalized'} onChange={e=>setNotes(e.target.value)} /></label>
    {error&&<p role="alert" className="manager-error">{error}</p>}
    {message&&<p role="status">{message}</p>}
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
      <button className="primary-button" disabled={saving||status==='finalized'} onClick={()=>save(false)}>{saving?'Guardando…':'Guardar borrador'}</button>
      <button className="ghost-button" disabled={saving||status==='finalized'} onClick={()=>save(true)}>Finalizar día</button>
    </div>
   </div>
  </>}
 </div>
}
