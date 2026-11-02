import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import {buildAnalyticsReport,reportMonths,reportMonthEnd} from '../../lib/analyticsReports.mjs'
import {createAnalyticsXlsx} from '../../lib/analyticsXlsx.mjs'

const money=n=>n==null?'—':new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n)
const int=n=>n==null?'—':new Intl.NumberFormat('es-ES',{maximumFractionDigits:0}).format(n)
const nowMonth=()=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit'
  }).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))
  return p.year+'-'+p.month
}
const stateLabels={
 closed:'Cierre guardado',verified:'Historico verificado',complete:'Registro diario completo',
 partial:'PARCIAL',estimated:'ESTIMACIÓN',missing:'SIN DATOS'
}
const colorOf={closed:'#44775f',verified:'#44775f',complete:'#44775f',
  partial:'#ad8c48',estimated:'#ad8c48',missing:'#8c8580'}
function downloadBytes(data,type,fileName) {
  const url=URL.createObjectURL(new Blob([data],{type}))
  const a=document.createElement('a')
  a.href=url;a.download=fileName
  document.body.appendChild(a);a.click();a.remove()
  setTimeout(()=>URL.revokeObjectURL(url),30000)
}
export default function AnalyticsReports(){
  const [endMonth,setEndMonth]=useState(nowMonth)
  const [range,setRange]=useState(3)
  const [refresh,setRefresh]=useState(0)
  const [loading,setLoading]=useState(true)
  const [exporting,setExporting]=useState('')
  const [error,setError]=useState('')
  const [raw,setRaw]=useState(null)
  const period=useMemo(()=>{
    try{return reportMonths(endMonth,range)}catch{return null}
  },[endMonth,range])
  const start=period?.[0]+'-01'
  const end=period?reportMonthEnd(period.at(-1)):null
  useEffect(()=>{
    let alive=true
    if(!period){setError('Selecciona un mes válido.');setLoading(false);setRaw(null);return()=>{alive=false}}
    async function load(){
      setLoading(true);setError('');setRaw(null)
      const [days,expenses,inventories,history,targets,closures]=await Promise.all([
        supabase.from('analytics_daily_entries')
          .select('business_date,status,lunch_status,dinner_status,analytics_service_entries(service_type,covers,food_revenue_amount,beverage_revenue_amount,tax_basis)')
          .gte('business_date',start).lt('business_date',end).order('business_date').limit(400),
        supabase.from('analytics_expenses').select('period_date,period_kind,category,amount,tax_basis')
          .gte('period_date',start).lt('period_date',end).order('period_date').limit(1000),
        supabase.from('analytics_monthly_inventory').select(
          'month_start,stock_type,opening_value,closing_value,external_adjustment,valuation_basis,purchases_reconciled,reconciled_purchase_total,reconciled_purchase_count')
          .gte('month_start',start).lt('month_start',end).limit(30),
        supabase.from('analytics_monthly_history')
          .select('month_start,revenue_total,covers,tax_basis,data_quality')
          .gte('month_start',start).lt('month_start',end).limit(15),
        supabase.from('analytics_monthly_targets')
          .select('month_start,revenue_target,revenue_basis')
          .gte('month_start',start).lt('month_start',end).limit(15),
        supabase.from('analytics_monthly_closures')
          .select('month_start,revenue_source,revenue_net,covers,food_consumption_net,beverage_consumption_net,other_expenses_net,operating_result_net,source_fingerprint,closed_at')
          .gte('month_start',start).lt('month_start',end).limit(15)
      ])
      if(!alive)return
      const failed=[days,expenses,inventories,history,targets,closures].find(v=>v.error)
      if(failed){setError('No se pudo cargar el informe: '+failed.error.message);setLoading(false);return}
      if((days.data||[]).length>=400||(expenses.data||[]).length>=1000||
        (inventories.data||[]).length>=30||
        (history.data||[]).length>=15||(targets.data||[]).length>=15||
        (closures.data||[]).length>=15){
        setError('Demasiados registros: no se permite exportar datos truncados. Reduce el período.')
        setLoading(false);return
      }
      const checks={}
      // The comparison RPC is independent for each closed month and does not mutate data.
      await Promise.all((closures.data||[]).map(async row=>{
        const {data:check,error:checkError}=await supabase.rpc(
          'analytics_evaluate_month_close',{
            p_month_start:row.month_start,p_revenue_source:row.revenue_source
          })
        checks[row.month_start]=checkError||!check?.fingerprint?'unavailable':
          check.fingerprint===row.source_fingerprint?'consistent':'changed'
      }))
      if(!alive)return
      setRaw({
        days:days.data||[],expenses:expenses.data||[],
        inventories:inventories.data||[],history:history.data||[],
        targets:targets.data||[],closures:closures.data||[],
        closeChecks:checks
      })
      setLoading(false)
    }
    load()
    return()=>{alive=false}
  },[start,end,refresh])
  const report=useMemo(()=>{
    if(!raw||!period)return null
    try{return buildAnalyticsReport({months:period,...raw})}
    catch{return null}
  },[raw,period])
  const exportFile=async(kind)=>{
    if(!report||loading||exporting)return
    setExporting(kind);setError('')
    const file='nonna_angela_analytics_'+period[0]+'_a_'+period.at(-1)
    try{
      if(kind==='xlsx'){
        const data=createAnalyticsXlsx(report)
        downloadBytes(data,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',file+'.xlsx')
      }else{
        const {downloadAnalyticsPdf}=await import('../../lib/analyticsPdf.js')
        await downloadAnalyticsPdf(report,file+'.pdf')
      }
    }catch(e){setError('Error al exportar: '+e.message)}
    finally{setExporting('')}
  }
  const maxRevenue=report?Math.max(1,...report.months.map(x=>x.revenue||0)):1
  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Reportes · PDF y Excel</h3>
      <p>Informes privados de gestión con fuentes identificadas y advertencias de calidad.
        Los meses incompletos NO se convierten en facturación definitiva.</p>
      <div style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'end'}}>
        <label>Último mes
          <input type="month" value={endMonth} disabled={Boolean(exporting)}
            onChange={e=>{setLoading(true);setEndMonth(e.target.value)}}/>
        </label>
        <label>Período
          <select value={range} disabled={Boolean(exporting)}
            onChange={e=>{setLoading(true);setRange(Number(e.target.value))}}>
            <option value={1}>1 mes</option><option value={3}>3 meses</option>
            <option value={6}>6 meses</option><option value={12}>12 meses</option>
          </select>
        </label>
        <button type="button" className="ghost-button" disabled={loading||Boolean(exporting)}
          onClick={()=>setRefresh(x=>x+1)}>Actualizar desde Supabase</button>
      </div>
      {loading&&<p role="status">Leyendo datos financieros y verificando cierres…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
    </div>
    {!loading&&report&&<>
      <div className="dashboard-panel">
        <h3>Resumen ejecutivo</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:12}}>
          {[
            ['Meses analizados',report.months.length],
            ['Meses cerrados',report.summary.closedMonths],
            ['Meses con ventas verificadas',report.summary.verifiedMonths],
            ['Meses sin datos',report.summary.missingMonths]
          ].map(([label,value])=><div key={label} style={{border:'1px solid rgba(130,130,130,.3)',borderRadius:10,padding:12}}>
            <small>{label}</small><h3>{value}</h3></div>)}
        </div>
        <p style={{marginTop:12}}><strong>Ingresos consolidados: {money(report.summary.revenueTotal)}</strong>
          {' '}{report.summary.revenueBasis?('('+report.summary.revenueBasis+')'):''}</p>
        {!report.summary.fullyVerified&&<p role="status">
          El total global no se calcula: faltan meses verificados o existen bases fiscales distintas.
          Los importes visibles de cada mes NO se han sumado entre sí.
        </p>}
      </div>
      <div className="dashboard-panel">
        <h3>Evolución mensual registrada</h3>
        <div style={{display:'grid',gap:10}}>
          {report.months.map(row=><div key={row.month} style={{display:'grid',gap:4}}>
            <div style={{display:'flex',gap:10,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}}>
              <span><strong>{row.month}</strong> · <span style={{color:colorOf[row.status]}}>{stateLabels[row.status]}</span></span>
              <strong>{money(row.revenue)}</strong>
            </div>
            <div style={{height:12,borderRadius:6,overflow:'hidden',background:'rgba(130,130,130,.15)'}}>
              <div style={{height:'100%',width:row.revenue!=null?
                Math.max(0,row.revenue/maxRevenue*100)+'%':'0%',
                opacity:row.status==='partial'||row.status==='estimated'?.35:.85,
                background:colorOf[row.status]}}/>
            </div>
            <small>Fuente: {row.source} · {row.basis||'sin base fiscal'} ·
              {row.covers==null?' comensales desconocidos':' '+int(row.covers)+' comensales'}
              {row.targetDelta==null?' · objetivo no comparable':
                ' · desvío objetivo '+money(row.targetDelta)}
            </small>
            {row.status==='closed'&&row.operatingResult!=null&&<small>
              Resultado operativo del cierre: {money(row.operatingResult)}
              {row.closureStatus==='changed'?' · fuentes CAMBIADAS':
                row.closureStatus==='unavailable'?' · integridad NO COMPROBADA':''}
            </small>}
          </div>)}
        </div>
      </div>
      <div className="dashboard-panel">
        <h3>Observaciones y cobertura de datos</h3>
        {report.summary.warnings===0?<p>No se encontraron alertas adicionales en los registros analizados.</p>:
          report.months.map(row=>row.warnings.length?<div key={row.month}>
            <h4>{row.month} · {stateLabels[row.status]}</h4>
            <ul>{row.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>
          </div>:null)}
        <p>El resultado de cierre es una fotografía histórica, no un beneficio fiscal certificado.
          Si los registros cambian, el reporte refleja esa discrepancia.</p>
      </div>
      <div className="dashboard-panel">
        <h3>Descargar informe</h3>
        <p>Ambos formatos incluyen límites y procedencia de los datos.
          El Excel tiene cuatro hojas: <strong>Resumen, Meses, Gastos, Avisos</strong>.
          No se generan registros financieros nuevos.</p>
        <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
          <button type="button" className="primary-button"
            disabled={Boolean(exporting)} onClick={()=>exportFile('pdf')}>
            {exporting==='pdf'?'Creando PDF…':'Descargar PDF'}
          </button>
          <button type="button" className="ghost-button"
            disabled={Boolean(exporting)} onClick={()=>exportFile('xlsx')}>
            {exporting==='xlsx'?'Creando Excel…':'Descargar Excel (.xlsx)'}
          </button>
        </div>
      </div>
    </>}
  </div>
}
