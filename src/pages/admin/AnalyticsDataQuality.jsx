import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import {buildDataQuality,monthDateRange} from '../../lib/analyticsDataQuality.mjs'

const canaryToday=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date())
const LABELS={daily:'Registro diario',expenses:'Gastos',inventory:'Inventario',
  history:'Histórico',closing:'Cierre mensual'}
const CHECKS_DESCRIPTION='Esta lista es una guía local de revisión. NO guarda confirmaciones ni sustituye las casillas del Cierre mensual.'
const checklistInitial=()=>({sales:false,expenses:false,inventory:false,igic:false,scope:false})

export default function AnalyticsDataQuality({onNavigate}){
  const [month,setMonth]=useState(()=>canaryToday().slice(0,7))
  const [source,setSource]=useState('history')
  const [reload,setReload]=useState(0)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [raw,setRaw]=useState(null)
  const [checklist,setChecklist]=useState(checklistInitial)
  const monthRange=useMemo(()=>{
    try{return monthDateRange(month)}catch{return null}
  },[month])

  useEffect(()=>{
    let active=true
    if(!monthRange){setLoading(false);setRaw(null);setError('Selecciona un mes válido.');return()=>{active=false}}
    async function load(){
      setLoading(true);setError('');setRaw(null)
      const {start,next}=monthRange
      const [daily,expenses,inventories,history,closure]=await Promise.all([
        supabase.from('analytics_daily_entries')
          .select('id,business_date,status,lunch_status,dinner_status,analytics_service_entries(service_type,covers,food_revenue_amount,beverage_revenue_amount,tax_basis,tax_details)')
          .gte('business_date',start).lt('business_date',next)
          .order('business_date').limit(32),
        supabase.from('analytics_expenses')
          .select('id,period_kind,period_date,category,amount,tax_basis,igic_amount')
          .gte('period_date',start).lt('period_date',next)
          .order('period_date').limit(1001),
        supabase.from('analytics_monthly_inventory')
          .select('month_start,stock_type,opening_value,closing_value,valuation_basis,purchases_reconciled,reconciled_purchase_total,reconciled_purchase_count')
          .eq('month_start',start).limit(3),
        supabase.from('analytics_monthly_history')
          .select('month_start,revenue_total,covers,tax_basis,data_quality')
          .eq('month_start',start).maybeSingle(),
        supabase.from('analytics_monthly_closures')
          .select('month_start,revenue_source,source_fingerprint,closed_at')
          .eq('month_start',start).maybeSingle()
      ])
      if(!active)return
      const fail=[daily,expenses,inventories,history,closure].find(x=>x.error)
      if(fail){
        setError('No se pudieron leer los registros: '+fail.error.message)
        setLoading(false);return
      }
      if((daily.data||[]).length>=32||(expenses.data||[]).length>=1001||
         (inventories.data||[]).length>=3){
        setError('Demasiados registros: los datos podrían estar truncados. No se mostrará un diagnóstico parcial.')
        setLoading(false);return
      }
      const chosen=closure.data?.revenue_source||source
      const {data:closeReport,error:closeError}=await supabase.rpc('analytics_evaluate_month_close',{
        p_month_start:start,p_revenue_source:chosen
      })
      if(!active)return
      if(closeError){
        setError('No se pudo evaluar el cierre en Supabase: '+closeError.message)
        setLoading(false);return
      }
      setRaw({
        days:daily.data||[],expenses:expenses.data||[],
        inventories:inventories.data||[],history:history.data||null,
        closure:closure.data||null,closeReport
      })
      setLoading(false)
    }
    load()
    return()=>{active=false}
  },[monthRange,source,reload])

  const model=useMemo(()=>{
    if(!raw)return null
    try{
      return buildDataQuality({month,today:canaryToday(),...raw})
    }catch(e){return {error:e.message}}
  },[raw,month])

  const updateMonth=value=>{
    setMonth(value);setChecklist(checklistInitial());setRaw(null);setLoading(true)
  }
  const updateSource=value=>{
    setSource(value);setChecklist(checklistInitial());setRaw(null);setLoading(true)
  }
  const refresh=()=>{
    setReload(v=>v+1);setChecklist(checklistInitial());setRaw(null);setLoading(true)
  }
  const navigate=target=>{if(typeof onNavigate==='function')onNavigate(target)}
  const reviewed=model?.checklistSections?.every(item=>checklist[item.key]===true)??false

  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Centro de calidad de datos · Fase 12B</h3>
      <p>Revisión <strong>solo lectura</strong> de ingresos, servicios, gastos, inventarios y conciliación.
        No se crean ni modifican registros. Las ausencias significan <strong>sin registrar</strong>, no ventas cero.</p>
      <p>El estado oficial del cierre lo calcula Supabase; estas alertas son señales para revisar,
        no una certificación fiscal ni una autorización automática de cierre.</p>
      <div style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'end'}}>
        <label>Mes <input type="month" value={month} onChange={e=>updateMonth(e.target.value)}/></label>
        <label>Fuente de ingresos para la conciliación
          <select value={raw?.closure?.revenue_source||source}
            onChange={e=>updateSource(e.target.value)}
            disabled={Boolean(raw?.closure)}>
            <option value="history">Histórico verificado</option>
            <option value="daily">Registro diario finalizado</option>
          </select>
        </label>
        <button type="button" className="ghost-button" disabled={loading} onClick={refresh}>Actualizar desde Supabase</button>
      </div>
      {loading&&<p role="status">Comprobando registros y conciliación…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {model?.error&&<p role="alert" className="manager-error">{model.error}</p>}
    </div>
    {!loading&&model&&!model.error&&<>
      <div className="dashboard-panel">
        <h3>Resultados del mes {month}</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:12}}>
          {[
            ['Revisión prioritaria',model.counts.critical],
            ['Advertencias',model.counts.warning],
            ['Días registrados',model.recordedDays],
            ['Días transcurridos sin registro',model.unrecordedDays.length]
          ].map(([label,value])=><div key={label} style={{border:'1px solid rgba(150,130,110,.35)',borderRadius:10,padding:12}}>
            <small>{label}</small><p style={{fontSize:26,fontWeight:700,margin:'5px 0'}}>{value}</p>
          </div>)}
        </div>
        {model.unrecordedDays.length>0&&<p>
          Días sin registrar (solo días completos): {model.unrecordedDays.join(', ')}.
          Incluye posibles días en que el restaurante estuvo cerrado.
        </p>}
        <p>Fuente analizada: <strong>{model.source==='history'?'Histórico':'Registro diario'}</strong>.
          {model.close.closed?' Mes ya cerrado: no se modificará.':''}</p>
      </div>
      <div className="dashboard-panel">
        <h3>Conciliación oficial · Supabase</h3>
        <p><strong>{model.close.closed?'Cierre ya registrado':
          model.close.ready?'Sin bloqueos según el servidor':'Pendiente de conciliación'}</strong></p>
        {model.close.issues.length>0&&<div role="alert">
          <h4>Bloqueos de cierre</h4>
          <ul>{model.close.issues.map((x,i)=><li key={i}>{x}</li>)}</ul>
        </div>}
        {model.close.warnings.length>0&&<div>
          <h4>Avisos del servidor</h4>
          <ul>{model.close.warnings.map((x,i)=><li key={i}>{x}</li>)}</ul>
        </div>}
        {model.close.ready&&<p>El servidor no detecta bloqueos para esta fuente;
          el responsable aún debe verificar cifras, evidencias y confirmaciones del cierre.</p>}
        <button type="button" className="ghost-button" onClick={()=>navigate('closing')}>
          Ir al Cierre mensual
        </button>
      </div>
      <div className="dashboard-panel">
        <h3>Diagnóstico detallado · sin modificar datos</h3>
        {model.findings.length===0?<p>No se han detectado advertencias en las reglas implementadas.
          Esto NO equivale a una auditoría completa.</p>:
          <div style={{display:'grid',gap:12}}>
            {model.findings.map(item=><div key={item.id}
              style={{borderBottom:'1px solid rgba(130,130,130,.3)',paddingBottom:12}}>
              <p style={{margin:'0 0 5px'}}>
                <strong>{item.severity==='critical'?'⚠ Revisión prioritaria':'ℹ Verificar'}</strong>
                {' · '}{item.section}{item.day?' · '+item.day:''}
              </p>
              <p><strong>{item.title}</strong></p>
              <p>{item.detail}</p>
              <button type="button" className="ghost-button" onClick={()=>navigate(item.target)}>
                Revisar en {LABELS[item.target]||item.section}
              </button>
            </div>)}
          </div>}
      </div>
      <div className="dashboard-panel">
        <h3>Checklist previo al cierre · revisión humana</h3>
        <p>{CHECKS_DESCRIPTION}</p>
        {model.checklistSections.map(item=><label key={item.key}
          style={{display:'flex',gap:10,alignItems:'start',margin:'10px 0'}}>
          <input type="checkbox" checked={checklist[item.key]===true}
            onChange={e=>setChecklist(old=>({...old,[item.key]:e.target.checked}))}/>
          <span>{item.label}</span>
          <button type="button" className="ghost-button" onClick={()=>navigate(item.target)}>
            Revisar
          </button>
        </label>)}
        <p role="status">{Object.values(checklist).filter(Boolean).length} de 5 revisiones marcadas.
          {reviewed?' Lista local completa: realiza las confirmaciones definitivas en Cierre mensual.':''}</p>
        <button type="button" className="primary-button" onClick={()=>navigate('closing')} disabled={!reviewed}>
          Abrir conciliación final
        </button>
        <p>Al cambiar el mes, la fuente o actualizar los datos, se reinicia la checklist.
          No se guarda ni se utiliza para desbloquear el cierre.</p>
      </div>
    </>}
  </div>
}
