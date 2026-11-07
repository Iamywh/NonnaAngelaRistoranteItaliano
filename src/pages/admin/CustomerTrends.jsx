import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import {buildCustomerTrends,recentCompletedMonths} from '../../lib/analyticsCustomerTrends.mjs'

const canaryMonth=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit'
}).format(new Date()).slice(0,7)
const previousMonth=month=>{
  const [year,number]=month.split('-').map(Number)
  const date=new Date(Date.UTC(year,number-2,1))
  return date.toISOString().slice(0,7)
}
const integer=value=>new Intl.NumberFormat('es-ES').format(value??0)
const decimal=value=>new Intl.NumberFormat('es-ES',{minimumFractionDigits:1,maximumFractionDigits:2}).format(value??0)
const pct=value=>value===null?'—':decimal(value)+'%'
const showDelta=value=>value===null?'No comparable':
  (value>0?'+':'')+pct(value)

function Stat({title,value,footnote}){
  return <div style={{padding:14,border:'1px solid rgba(135,135,135,.3)',borderRadius:12}}>
    <small style={{opacity:.8}}>{title}</small>
    <p style={{fontSize:'clamp(20px,2.7vw,28px)',fontWeight:700,margin:'6px 0'}}>{value}</p>
    <small style={{opacity:.8}}>{footnote}</small>
  </div>
}
function Distribution({title,description,items,formatter}){
  const max=Math.max(1,...items.map(item=>item.value))
  return <div className="dashboard-panel">
    <h3>{title}</h3>
    <p>{description}</p>
    <div style={{display:'grid',gap:11}}>
      {items.map(item=><div key={String(item.id)}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12}}>
          <span>{item.label}</span>
          <strong>{integer(item.value)}{formatter&&formatter(item)}</strong>
        </div>
        <div aria-hidden="true" style={{background:'rgba(130,130,130,.2)',height:9,borderRadius:9,overflow:'hidden'}}>
          <div style={{width:(100*item.value/max)+'%',height:'100%',
            borderRadius:9,background:'var(--accent-color,#ae885a)'}}/>
        </div>
      </div>)}
    </div>
  </div>
}
const severityLabel={priority:'Revisión prioritaria',review:'Comprobar',opportunity:'Oportunidad a evaluar',info:'Contexto'}

export default function CustomerTrends({onNavigate}){
  const today=canaryMonth()
  const lastCompleted=previousMonth(today)
  const [endMonth,setEndMonth]=useState(lastCompleted)
  const [periodCount,setPeriodCount]=useState(6)
  const [refresh,setRefresh]=useState(0)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [raw,setRaw]=useState(null)
  const months=useMemo(()=>{
    try{return recentCompletedMonths(endMonth,periodCount,today)}
    catch{return null}
  },[endMonth,periodCount,today])
  useEffect(()=>{
    let active=true
    if(!months){
      setRaw(null);setError('Selecciona un mes completado y un intervalo válido.')
      setLoading(false);return()=>{active=false}
    }
    async function load(){
      setLoading(true);setError('');setRaw(null)
      try {
        // Reuse the protected, aggregated Phase 13A RPC. Never fetch PII.
        // If any request fails, do not display a partial trend as complete.
        const responses=await Promise.all(months.map(month=>
          supabase.rpc('analytics_customer_intelligence',{p_month_start:month+'-01'})
        ))
        if(!active)return
        const bad=responses.find(response=>response.error)
        if(bad)throw Error(bad.error.message||'Fallo de Supabase')
        const records=responses.map((response,i)=>{
          if(!response.data||response.data.month!==months[i]){
            throw Error('Respuesta mensual ausente o incorrecta: '+months[i])
          }
          return response.data
        })
        // Validate entire dataset, including consistency between all breakdowns,
        // before presenting any computed comparison.
        buildCustomerTrends(records,today)
        setRaw(records)
      }catch(e){
        if(active)setError('No se ha podido calcular el período completo: '+e.message)
      }finally{if(active)setLoading(false)}
    }
    load()
    return()=>{active=false}
  },[months,today,refresh])

  const model=useMemo(()=>{
    if(!raw)return null
    try{return buildCustomerTrends(raw,today)}
    catch(e){return {error:e.message}}
  },[raw,today])
  const latest=model?.latest, previous=model?.previous
  const navigate=tab=>{if(typeof onNavigate==='function')onNavigate(tab)}
  const maxMonthRequests=Math.max(1,...(model?.months||[]).map(row=>row.requests))
  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Tendencias y oportunidades · Fase 13B</h3>
      <p>Compara la demanda de reservas durante <strong>meses calendario terminados</strong>.
        Para evitar engaños, el mes actual no entra en estas comparaciones.
        Estos indicadores no representan ocupación del restaurante, ventas ni beneficio.</p>
      <div style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'end'}}>
        <label>Último mes del período
          <input type="month" min="2000-06" max={lastCompleted}
            value={endMonth} onChange={e=>setEndMonth(e.target.value)}/>
        </label>
        <label>Ventana de comparación
          <select value={periodCount} onChange={e=>setPeriodCount(Number(e.target.value))}>
            <option value={3}>3 meses completos</option>
            <option value={6}>6 meses completos</option>
          </select>
        </label>
        <button type="button" className="ghost-button" onClick={()=>setRefresh(n=>n+1)}
          disabled={loading}>Actualizar agregados</button>
        <button type="button" className="ghost-button" onClick={()=>navigate('customers')}>
          Ver Customer Intelligence (mes individual)
        </button>
      </div>
      {loading&&<p role="status">Comparando {months?.length||0} meses mediante estadísticas privadas de Supabase…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {model?.error&&<p role="alert" className="manager-error">{model.error}</p>}
    </div>

    {!loading&&model&&!model.error&&<>
      <div className="dashboard-panel">
        <h3>Resumen · {model.months[0].month} a {latest.month}</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>
          <Stat title="Solicitudes en el período" value={integer(model.totals.requests)}
            footnote="Todas las situaciones, incluidas las canceladas"/>
          <Stat title="Plazas solicitadas activas" value={integer(model.totals.active_guests)}
            footnote="Pendientes + confirmadas, no son comensales atendidos"/>
          <Stat title="Solicitudes último mes" value={integer(latest.requests)}
            footnote={latest.month+' · '+decimal(latest.requestsPerCalendarDay)+' por día calendario'}/>
          <Stat title="Cambio mes a mes" value={showDelta(model.requestTrendPct)}
            footnote={'Solicitudes por día calendario, '+latest.month+' frente a '+previous.month}/>
          <Stat title="Llegadas marcadas" value={integer(model.totals.arrived)}
            footnote="Sentado o completado, no todas las visitas reales"/>
          <Stat title="Casos de no-show marcados" value={integer(model.totals.no_show)}
            footnote={model.markedNoShowPct===null?'Sin casos clasificados':
              pct(model.markedNoShowPct)+' entre llegadas/no-show clasificados'}/>
          <Stat title="Cobertura de estados de servicio" value={pct(model.statusCoveragePct)}
            footnote="De reservas activas, con llegada o no-show marcado"/>
          <Stat title="Reservas antiguas sin clasificar" value={integer(model.totals.past_unmarked)}
            footnote="No equivalen a ausencias confirmadas"/>
        </div>
      </div>
      <div className="dashboard-panel">
        <h3>Evolución mensual de solicitudes</h3>
        <p>Los valores son solicitudes actuales agrupadas por fecha del servicio,
          no nuevas solicitudes recibidas durante ese mes. Los meses tienen distinta duración.</p>
        <div style={{display:'grid',gap:12}}>
          {model.months.map(row=><div key={row.month}>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <strong>{row.month}</strong>
              <span>{integer(row.requests)} solicitudes · {decimal(row.requestsPerCalendarDay)}/día calendario</span>
            </div>
            <div style={{height:13,background:'rgba(120,120,120,.17)',borderRadius:7,overflow:'hidden'}}>
              <div style={{height:'100%',width:100*row.requests/maxMonthRequests+'%',
                background:'var(--accent-color,#ae885a)',borderRadius:7}}/>
            </div>
          </div>)}
        </div>
        <div style={{overflowX:'auto',marginTop:18}}>
          <table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
            <thead><tr>{[
              'Mes','Días calendario','Solicitudes','Solicitudes/día',
              'Plazas activas solicitadas','Llegadas marcadas','No-show','Sin clasificar',
              'Cobertura estados'
            ].map(c=><th key={c} style={{padding:8,borderBottom:'1px solid rgba(130,130,130,.4)',whiteSpace:'nowrap'}}>{c}</th>)}</tr></thead>
            <tbody>{model.months.map(row=><tr key={row.month}>
              {[row.month,row.days,row.requests,decimal(row.requestsPerCalendarDay),
                row.active_guests,row.arrived,row.no_show,row.past_unmarked,pct(row.statusCoveragePct)
              ].map((v,i)=><td key={i} style={{padding:8,borderBottom:'1px solid rgba(130,130,130,.18)',whiteSpace:'nowrap'}}>{v}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <p style={{opacity:.85,marginTop:12}}>{model.caveat}</p>
      </div>
      <div className="dashboard-panel">
        <h3>Acciones comerciales sugeridas</h3>
        <p>Reglas exploratorias, no predicciones. Requieren comprobar
          horarios reales de apertura, disponibilidad, calendario de eventos y costes
          antes de decidir una promoción.</p>
        <div style={{display:'grid',gap:12}}>
          {model.alerts.map((item,i)=><div key={i}
            style={{padding:14,border:'1px solid rgba(130,130,130,.26)',borderRadius:11}}>
            <small>{severityLabel[item.priority]||'Revisar'}</small>
            <h4 style={{margin:'5px 0'}}>{item.title}</h4>
            <p>{item.detail}</p>
          </div>)}
          {model.alerts.length===0&&<p>Sin señales nuevas: revisa el desglose antes de crear campañas.</p>}
        </div>
        <a href="/manager/reservas">Revisar reservas y sus estados en el gestor</a>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(295px,1fr))',gap:16}}>
        <Distribution title="Demanda según turno" items={model.services}
          description="Plazas solicitadas activas; no es ocupación. Los horarios especiales se clasifican aparte."
          formatter={row=>row.share===null?'':' · '+pct(row.share)}/>
        <Distribution title="Demanda según día de la semana" items={model.weekdays}
          description="Plazas solicitadas activas en todo el período. No descuenta los días cerrados."
          formatter={row=>row.share===null?'':' · '+pct(row.share)}/>
        <Distribution title="Anticipación de las reservas" items={model.leads}
          description="Solicitudes de todos los estados, según días entre creación y fecha reservada."
          formatter={row=>row.share===null?'':' · '+pct(row.share)}/>
      </div>
      <div className="dashboard-panel">
        <h3>Qué NO demuestra este informe</h3>
        <p>Una demanda inferior en almuerzo no significa que convenga abrir más: primero
          habría que comprobar cuántos almuerzos se ofrecieron. Tampoco atribuye reservas
          a anuncios de Instagram, calcula rentabilidad por cliente, distingue el
          chatbot del formulario web o supone que los clientes ausentes son no-show.</p>
        <p>Para mejorar estas decisiones en el futuro necesitaremos historial de cambios
          de estado, horarios de apertura efectivos y, si procede, conciliación con TPV.
          No almacenamos datos personales adicionales en esta función.</p>
      </div>
    </>}
  </div>
}
