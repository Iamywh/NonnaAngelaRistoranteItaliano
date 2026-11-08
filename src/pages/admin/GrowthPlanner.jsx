import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import {
  CHANNELS,OBJECTIVES,SERVICES,STATUSES,emptyGrowthForm,growthFormFromRecord,
  validateGrowthPayload,analyzeGrowthCampaigns
} from '../../lib/analyticsGrowth.mjs'

const canaryDate=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date())
const offsetDay=(date,offset)=>{
  const [y,m,d]=date.split('-').map(Number)
  return new Date(Date.UTC(y,m-1,d+offset)).toISOString().slice(0,10)
}
const esMoney=value=>new Intl.NumberFormat('es-ES',{
  style:'currency',currency:'EUR'
}).format(Number(value)||0)
const formatRate=value=>value===null?'Sin datos suficientes':value.toLocaleString(
  'es-ES',{maximumFractionDigits:2})
const pct=value=>value===null?'—':formatRate(value)+'%'
const options=object=>Object.entries(object).map(([value,label])=>
  <option key={value} value={value}>{label}</option>)
const kpi=(title,value,description)=><div key={title} style={{
  border:'1px solid rgba(130,130,130,.25)',borderRadius:11,padding:13
}}>
  <small>{title}</small>
  <p style={{fontSize:26,fontWeight:700,margin:'7px 0'}}>{value}</p>
  <small style={{opacity:.85}}>{description}</small>
</div>
function Field({label,children}) {
  return <label style={{display:'grid',gap:7,minWidth:0}}>{label}{children}</label>
}

export default function GrowthPlanner({onNavigate}){
  const [start,setStart]=useState(()=>offsetDay(canaryDate(),-60))
  const [end,setEnd]=useState(()=>offsetDay(canaryDate(),120))
  const [loadNumber,setLoadNumber]=useState(0)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [records,setRecords]=useState([])
  const [form,setForm]=useState(null)
  const [dataReady,setDataReady]=useState(false)

  useEffect(()=>{
    let active=true
    const load=async()=>{
      setLoading(true);setDataReady(false);setError('');setRecords([])
      const {data,error:rpcError}=await supabase.rpc('analytics_growth_list',{
        p_start_date:start,p_end_date:end
      })
      if(!active)return
      if(rpcError){setError('No se pudieron leer campañas: '+rpcError.message)}
      else if(!data?.ok||!Array.isArray(data.campaigns)||data.campaigns.length!==data.count){
        setError('Supabase devolvió datos incompletos.')
      }else{
        try{
          analyzeGrowthCampaigns(data.campaigns)
          setRecords(data.campaigns);setDataReady(true)
        }catch(e){setError('Respuesta inconsistente: '+e.message)}
      }
      setLoading(false)
    }
    load()
    return()=>{active=false}
  },[start,end,loadNumber])

  const model=useMemo(()=>{
    if(!dataReady)return null
    try{return analyzeGrowthCampaigns(records)}
    catch(e){return {error:e.message}}
  },[records,dataReady])

  const change=(key,value)=>setForm(previous=>({...previous,[key]:value}))
  const newCampaign=()=>{
    setError('');setNotice('')
    setForm({...emptyGrowthForm(),
      start_date:canaryDate(),end_date:offsetDay(canaryDate(),14)})
  }
  const edit=campaign=>{
    setError('');setNotice('')
    setForm(growthFormFromRecord(campaign))
  }
  const save=async(event)=>{
    event.preventDefault()
    if(saving||!form)return
    setError('');setNotice('')
    let payload
    try{payload=validateGrowthPayload(form)}
    catch(e){setError(e.message);return}
    const isUpdate=Boolean(payload.id)
    if(!window.confirm(isUpdate?
      '¿Guardar cambios de campaña? Se registrará una nueva revisión con tu usuario.':
      '¿Crear campaña en borrador/planificación? No se publicará automáticamente en ninguna plataforma.'
    ))return
    setSaving(true)
    const {data,error:rpcError}=await supabase.rpc('analytics_growth_save',{
      p_campaign:payload
    })
    setSaving(false)
    if(rpcError){
      setError('No se pudo guardar: '+rpcError.message+
        (isUpdate?' Si hubo cambios de otra sesión, actualiza la lista.':''))
      return
    }
    if(!data?.ok||!data.campaign?.id){
      setError('Respuesta de guardado incompleta. Consulta la lista antes de reintentar.')
      return
    }
    setForm(null)
    setNotice('Campaña guardada con auditoría. Los datos de rendimiento son manuales, no están conectados a Ads ni a reservas.')
    setLoadNumber(n=>n+1)
  }
  const refresh=()=>{
    setNotice('');setForm(null);setLoadNumber(n=>n+1)
  }

  const stats=model?.totals
  const textInput=(key,label,rest={})=><Field label={label}>
    <input type="text" value={form[key]??''} onChange={e=>change(key,e.target.value)}
      disabled={saving} {...rest}/>
  </Field>
  const metricInput=(key,label,help)=><Field label={label}>
    <input type="text" inputMode="numeric" placeholder="Sin dato" value={form[key]??''}
      disabled={saving} onChange={e=>change(key,e.target.value)}/>
    <small style={{opacity:.75}}>{help}</small>
  </Field>

  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Growth & Campaign Planner · Fase 14A</h3>
      <p>Planifica contenidos, eventos y publicidad con un presupuesto visible,
        una hipótesis comercial y resultados <strong>registrados manualmente</strong>.
        No envía mensajes, no publica posts, no crea anuncios y no toca reservas.</p>
      <p><strong>Precaución:</strong> una reserva con código anotada aquí no es una
        conversión comprobada por el sistema. No se calcula ROI ni ventas atribuibles
        sin una integración y evidencia adicional.</p>
      <div style={{display:'flex',alignItems:'end',flexWrap:'wrap',gap:12}}>
        <Field label="Campañas desde">
          <input type="date" value={start} disabled={loading||saving}
            onChange={e=>setStart(e.target.value)}/>
        </Field>
        <Field label="Campañas hasta">
          <input type="date" value={end} disabled={loading||saving}
            onChange={e=>setEnd(e.target.value)}/>
        </Field>
        <button type="button" className="ghost-button" onClick={refresh}
          disabled={loading||saving}>Actualizar desde Supabase</button>
        <button type="button" className="primary-button" onClick={newCampaign}
          disabled={loading||saving||!dataReady}>+ Nueva campaña</button>
        <button type="button" className="ghost-button" onClick={()=>onNavigate?.('customer-trends')}>
          Consultar Tendencias clientes
        </button>
      </div>
      <p style={{opacity:.8}}>Se muestran campañas cuyos períodos se solapan con el filtro
        (máximo 367 días de filtro, 200 campañas).</p>
      {loading&&<p role="status">Consultando campañas…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
    </div>
    {model&&!model.error&&<div className="dashboard-panel">
      <h3>Resumen de planificación</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:12}}>
        {[
          kpi('Campañas en el filtro',stats.campaigns,'Incluye borradores y canceladas'),
          kpi('Presupuesto previsto',esMoney(stats.planned),'Suma de las campañas incluidas'),
          kpi('Gasto declarado',esMoney(stats.spentKnown)+(stats.unknownSpend?' *':''),
            stats.unknownSpend?
              stats.unknownSpend+' campañas sin gasto declarado: total PARCIAL':
              'Importe manual informado; no se sincroniza con contabilidad'),
          kpi('Campañas con gasto conocido',stats.campaignsWithSpend,
            'Un campo vacío no significa gasto cero')
        ]}
      </div>
      {stats.unknownSpend>0&&<p> * Los costes conocidos son una suma parcial.
        No interpretes los campos vacíos como gasto cero.</p>}
    </div>}
    {model?.error&&<p className="manager-error" role="alert">{model.error}</p>}
    {model&&!model.error&&model.alerts.length>0&&<div className="dashboard-panel">
      <h3>Controles y oportunidades de revisión</h3>
      {model.alerts.map((a,i)=><p key={a.id+'-'+i}>
        <strong>{a.level==='review'?'⚠ Revisar':'ℹ Información'} — {a.title}:</strong>
        {' '}{a.detail}
      </p>)}
    </div>}
    {model&&!model.error&&<div className="dashboard-panel">
      <h3>Campañas</h3>
      {model.campaigns.length===0?<p>No hay campañas en el período. Puedes crear
        una campaña de contenido o un evento, sin activar publicidad automáticamente.</p>:
        <div style={{display:'grid',gap:14}}>
          {model.campaigns.map(c=><div key={c.id} style={{
            border:'1px solid rgba(130,130,130,.3)',padding:14,borderRadius:12
          }}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12,
              flexWrap:'wrap',alignItems:'start'}}>
              <div>
                <h4 style={{margin:'0 0 7px'}}>{c.name}</h4>
                <small>{CHANNELS[c.channel]} · {STATUSES[c.status]} ·
                  {SERVICES[c.target_service]} · {c.start_date} a {c.end_date}</small>
              </div>
              <button type="button" className="ghost-button" disabled={saving}
                onClick={()=>edit(c)}>Editar</button>
            </div>
            <p><strong>Objetivo:</strong> {OBJECTIVES[c.objective]} ·
              <strong> Presupuesto:</strong> {esMoney(c.planned_budget)} ·
              <strong> Gasto informado:</strong> {c.actual_spend==null?'Sin dato':esMoney(c.actual_spend)}</p>
            <p><strong>Código manual:</strong> {c.tracking_code||'No configurado'}.
              {' '}Reservas declaradas con código: {c.code_bookings==null?'Sin dato':c.code_bookings}.
              No existe verificación automática de este recuento.</p>
            <div style={{display:'flex',flexWrap:'wrap',gap:16}}>
              <small>Impresiones: {c.impressions==null?'—':c.impressions}</small>
              <small>Clics: {c.clicks==null?'—':c.clicks}</small>
              <small>CTR declarado: {pct(c.ctrPct)}</small>
              <small>CPC orientativo: {c.costPerClick==null?'—':esMoney(c.costPerClick)}</small>
              <small>Coste por reserva con código declarada: {
                c.costPerReportedCodeBooking==null?'—':esMoney(c.costPerReportedCodeBooking)}</small>
            </div>
            {c.notes&&<p><small><strong>Hipótesis / notas:</strong> {c.notes}</small></p>}
            <small>Revisión n.º {c.revision} · Métricas y gastos introducidos manualmente.</small>
          </div>)}
        </div>}
    </div>}
    {form&&<div className="dashboard-panel" style={{border:'2px solid rgba(136,102,58,.55)'}}>
      <h3>{form.id?'Editar campaña':'Nueva campaña'}</h3>
      <p>Completa solo datos reales o previstos. Deja vacía una métrica desconocida:
        «desconocido» no es lo mismo que cero. Evita nombres, teléfonos,
        correos y cualquier dato personal en las notas.</p>
      <form onSubmit={save} style={{display:'grid',gap:16}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(205px,1fr))',gap:12}}>
          {textInput('name','Nombre de la campaña',{maxLength:100,required:true,placeholder:'Ej. Cena de jueves · noviembre'})}
          <Field label="Canal"><select value={form.channel} disabled={saving}
            onChange={e=>change('channel',e.target.value)}>{options(CHANNELS)}</select></Field>
          <Field label="Objetivo"><select value={form.objective} disabled={saving}
            onChange={e=>change('objective',e.target.value)}>{options(OBJECTIVES)}</select></Field>
          <Field label="Turno"><select value={form.target_service} disabled={saving}
            onChange={e=>change('target_service',e.target.value)}>{options(SERVICES)}</select></Field>
          <Field label="Estado (manual)"><select value={form.status} disabled={saving}
            onChange={e=>change('status',e.target.value)}>{options(STATUSES)}</select></Field>
          <Field label="Desde"><input type="date" value={form.start_date} required
            disabled={saving} onChange={e=>change('start_date',e.target.value)}/></Field>
          <Field label="Hasta"><input type="date" value={form.end_date} required
            disabled={saving} onChange={e=>change('end_date',e.target.value)}/></Field>
          {textInput('planned_budget','Presupuesto previsto (€)',{inputMode:'decimal',required:true})}
          {textInput('actual_spend','Gasto real informado (€), o vacío',{inputMode:'decimal',placeholder:'Sin dato'})}
          {textInput('tracking_code','Código de campaña (opcional)',{placeholder:'NONNAJUEVES',maxLength:24})}
          {metricInput('impressions','Impresiones declaradas','Valor de plataforma, o vacío')}
          {metricInput('clicks','Clics declarados','Valor de plataforma, o vacío')}
          {metricInput('inquiries','Consultas declaradas','Conteo manual, o vacío')}
          {metricInput('code_bookings','Reservas con código declaradas','Solo si se ha comprobado el código; no se cruza con el bot de reservas')}
        </div>
        <Field label="Hipótesis de campaña, creatividad o nota operativa">
          <textarea value={form.notes} rows={3} maxLength={500} disabled={saving}
            onChange={e=>change('notes',e.target.value)}
            placeholder="Ej. Reel de carbonara para activar las cenas del jueves. Sin datos personales."/>
        </Field>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving?'Guardando…':form.id?'Guardar cambios con auditoría':'Crear campaña'}
          </button>
          <button type="button" className="ghost-button" disabled={saving}
            onClick={()=>setForm(null)}>Cancelar edición</button>
        </div>
        <small>El guardado escribe solo esta planificación y registra quién la modificó.
          No programa publicaciones, no factura, no genera reservas ni envía mensajes.</small>
      </form>
    </div>}
  </div>
}
