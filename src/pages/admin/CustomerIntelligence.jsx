import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import {
  prepareCustomerIntelligence,WEEKDAYS,LEAD_LABELS,
  SERVICE_LABELS,SOURCE_LABELS,CHANNEL_LABELS
} from '../../lib/analyticsCustomerIntelligence.mjs'

const canaryMonth=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit'
}).format(new Date()).slice(0,7)
const amount=n=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:0}).format(n||0)
function Metric({title,value,note}){
  return <div style={{border:'1px solid rgba(150,130,110,.35)',borderRadius:12,padding:14,minWidth:0}}>
    <small style={{opacity:.8}}>{title}</small>
    <p style={{fontSize:'clamp(23px,3vw,30px)',fontWeight:700,margin:'7px 0'}}>{value}</p>
    <small style={{opacity:.8}}>{note}</small>
  </div>
}
function Bars({rows,metric='requests',label,description}){
  const max=Math.max(1,...rows.map(row=>Number(row[metric])||0))
  return <div className="dashboard-panel">
    <h3>{description}</h3>
    {rows.length===0?<p>No hay solicitudes para este desglose.</p>:
      <div style={{display:'grid',gap:11}}>
        {rows.map((row,index)=><div key={row.key||index}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12}}>
            <span>{label(row)}</span>
            <strong>{amount(row[metric])}</strong>
          </div>
          <div aria-hidden="true" style={{height:9,background:'rgba(130,130,130,.18)',borderRadius:5,overflow:'hidden'}}>
            <div style={{height:'100%',width:(100*(Number(row[metric])||0)/max)+'%',
              background:'var(--accent-color,#a98252)',borderRadius:5}}/>
          </div>
        </div>)}
      </div>}
  </div>
}
export default function CustomerIntelligence(){
  const [month,setMonth]=useState(canaryMonth)
  const [refresh,setRefresh]=useState(0)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [raw,setRaw]=useState(null)
  const monthDate=/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month+'-01':null
  useEffect(()=>{
    let active=true
    if(!monthDate){setRaw(null);setError('Selecciona un mes válido.');setLoading(false);return()=>{active=false}}
    async function load(){
      setLoading(true);setError('');setRaw(null)
      const {data,error:rpcError}=await supabase.rpc('analytics_customer_intelligence',{
        p_month_start:monthDate
      })
      if(!active)return
      if(rpcError){setError('No se pudieron obtener los indicadores: '+rpcError.message)}
      else setRaw(data)
      setLoading(false)
    }
    load()
    return()=>{active=false}
  },[monthDate,refresh])

  const model=useMemo(()=>{
    if(!raw)return null
    try{return prepareCustomerIntelligence(raw)}
    catch(e){return {error:e.message}}
  },[raw])
  const t=model?.totals
  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Customer Intelligence · Fase 13A</h3>
      <p>Qué días y turnos generan más solicitudes, cuántas se confirman y cuántas
        se marcan como llegadas o no-show. Todo procede de <strong>estadísticas agregadas de Supabase</strong>,
        sin datos personales ni fichas individuales.</p>
      <p><strong>Definiciones:</strong> «Solicitud» no es cliente sentado; «Confirmada» tampoco
        acredita asistencia. Solo se considera llegada si el personal marca <em>Sentado</em> o
        <em> Completado</em>. No-show significa que el personal lo ha señalado explícitamente.</p>
      <div style={{display:'flex',gap:12,alignItems:'end',flexWrap:'wrap'}}>
        <label>Mes de la reserva
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
        </label>
        <button type="button" className="ghost-button" disabled={loading}
          onClick={()=>setRefresh(x=>x+1)}>Actualizar datos</button>
        <a href="/manager/reservas">Abrir gestor de reservas</a>
      </div>
      {loading&&<p role="status">Calculando indicadores en Supabase…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {model?.error&&<p role="alert" className="manager-error">{model.error}</p>}
    </div>
    {!loading&&model&&!model.error&&<>
      <div className="dashboard-panel">
        <h3>Resumen de las reservas · {month}</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
          <Metric title="Solicitudes recibidas" value={amount(t.requests)}
            note="Incluye todos los estados"/>
          <Metric title="Reservas pendientes" value={amount(t.pending)}
            note="No están confirmadas"/>
          <Metric title="Reservas confirmadas" value={amount(t.confirmed)}
            note="No implica asistencia"/>
          <Metric title="Plazas solicitadas activas" value={amount(t.active_guests)}
            note="Pendientes + confirmadas; no equivale a aforo real"/>
          <Metric title="Reservas con llegada marcada" value={amount(t.arrived)}
            note={amount(t.arrived_guests)+' plazas, sentadas o completadas'}/>
          <Metric title="No-show marcados" value={amount(t.no_show)}
            note={amount(t.no_show_guests)+' plazas; solo estados explícitos'}/>
          <Metric title="Canceladas / rechazadas" value={amount(t.cancelled)+' / '+amount(t.rejected)}
            note="Contadas por separado"/>
          <Metric title="Reservas pasadas sin llegada clasificada" value={amount(t.past_unmarked)}
            note="No se interpretan automáticamente como no-show"/>
        </div>
        <p>Reservas activas: <strong>{amount(t.active)}</strong> ({model.activeSharePct==null?'sin dato':model.activeSharePct+'%'} de las solicitudes).
          Casos con estado final de asistencia («llegó» o «no-show»): <strong>{amount(model.markedOutcomes)}</strong>.
          {model.markedNoShowPct!==null?' Entre estos casos clasificados, el '+model.markedNoShowPct+'% figura como no-show.':''}</p>
        <p style={{opacity:.85}}>No calculamos tasa real de asistencia sobre todas las reservas mientras existan estados «Sin llegar» sin resolver.</p>
      </div>
      <div className="dashboard-panel">
        <h3>Oportunidades y datos por revisar</h3>
        {model.insights.length===0?<p>No hay observaciones automáticas nuevas. El análisis se limita a los datos disponibles.</p>:
          <div style={{display:'grid',gap:12}}>
            {model.insights.map((item,i)=><div key={i}
              style={{borderBottom:'1px solid rgba(130,130,130,.25)',paddingBottom:10}}>
              <strong>{item.kind==='warning'?'⚠ ':'ℹ '}{item.title}</strong>
              <p>{item.description}</p>
              {item.action&&<a href="/manager/reservas">{item.action}</a>}
            </div>)}
          </div>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16}}>
        <Bars rows={model.service} metric="active_guests"
          label={r=>SERVICE_LABELS[r.service]||r.service}
          description="Plazas solicitadas por servicio (pendientes + confirmadas)"/>
        <Bars rows={model.weekdays.slice().sort((a,b)=>a.weekday-b.weekday)}
          metric="active_guests" label={r=>WEEKDAYS[r.weekday]||r.weekday}
          description="Demanda por día de la semana (plazas solicitadas)"/>
        <Bars rows={model.lead} metric="requests"
          label={r=>LEAD_LABELS[r.bucket]||r.bucket}
          description="Anticipación de la reserva (solicitudes)"/>
        <Bars rows={model.origin} metric="requests"
          label={r=>SOURCE_LABELS[r.origin]||r.origin}
          description="Origen declarado (no distingue chatbot del formulario)"/>
      </div>
      <div className="dashboard-panel">
        <h3>Preferencias de confirmación</h3>
        <p>Preferencia indicada al solicitar la reserva; no demuestra que se haya enviado un mensaje.</p>
        <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
          {model.channel.map((row,i)=><div key={i}
            style={{border:'1px solid rgba(130,130,130,.22)',borderRadius:10,padding:12}}>
            <strong>{CHANNEL_LABELS[row.channel_preference]||row.channel_preference}</strong>
            <p>{amount(row.requests)} solicitudes</p>
          </div>)}
        </div>
      </div>
      <div className="dashboard-panel">
        <h3>Actividad por fecha de reserva</h3>
        <p>Son fechas del servicio solicitado, no fechas en que se recibió la petición.</p>
        {model.days.length===0?<p>No hay solicitudes de reserva en este mes.</p>:
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
              <thead><tr>{[
                'Fecha','Solicitudes','Activas','Plazas solicitadas','Llegadas marcadas','No-show','Canceladas','Sin clasificar (pasadas)'
              ].map(x=><th key={x} style={{padding:9,borderBottom:'1px solid rgba(130,130,130,.5)',whiteSpace:'nowrap'}}>{x}</th>)}</tr></thead>
              <tbody>{model.days.map(row=><tr key={row.day}>
                {[
                  row.day,row.requests,row.active,row.active_guests,row.arrived,
                  row.no_show,row.cancelled,row.past_unmarked
                ].map((val,i)=><td key={i} style={{padding:8,borderBottom:'1px solid rgba(130,130,130,.2)',whiteSpace:'nowrap'}}>{val}</td>)}
              </tr>)}</tbody>
            </table>
          </div>}
      </div>
      <div className="dashboard-panel">
        <h3>Contexto: comensales del registro diario de Analytics</h3>
        <p>Estas cifras proceden de los servicios registrados manualmente, no de las reservas.
          Pueden incluir clientes sin reserva y días pendientes de registro; no son directamente comparables.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
          <Metric title="Días registrados" value={amount(model.dailyRegister?.recorded_days||0)}
            note="No se presuponen los días ausentes"/>
          <Metric title="Días finalizados" value={amount(model.dailyRegister?.finalized_days||0)}
            note="Estado del registro diario"/>
          <Metric title="Comensales anotados" value={model.dailyRegister?.recorded_covers==null?'—':amount(model.dailyRegister.recorded_covers)}
            note="Solo de las fechas presentes; pueden incluir walk-ins"/>
        </div>
        <p><strong>No calculamos:</strong> conversión de visitantes web a reservas, repetición
          de clientes, ingresos por reserva o ticket individual. No existen datos verificados
          suficientes para atribuir esas métricas sin una integración adicional con TPV
          y un diseño de privacidad específico.</p>
      </div>
    </>}
  </div>
}
