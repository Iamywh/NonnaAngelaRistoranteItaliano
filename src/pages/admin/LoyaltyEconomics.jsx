import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'

const canaryMonth=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit'
}).format(new Date()).slice(0,7)
const integer=value=>new Intl.NumberFormat('es-ES').format(value??0)
const euros=value=>new Intl.NumberFormat('es-ES',{
  style:'currency',currency:'EUR',maximumFractionDigits:2
}).format(Number(value)||0)
const percent=(part,total)=>total>0?Math.round(1000*part/total)/10:null
const numberText=value=>value===null?'—':integer(value)
const parseMoney=value=>{
  const str=String(value).trim()
  if(!/^(?:0|[1-9][0-9]{0,3})(?:[.,][0-9]{1,2})?$/.test(str))return null
  const n=Number(str.replace(',','.'))
  return Number.isFinite(n)&&n<=1000?n:null
}
const KPI=({label,value,explanation})=><div style={{
  border:'1px solid rgba(130,115,90,.35)',padding:14,borderRadius:12
}}>
  <small style={{opacity:.85}}>{label}</small>
  <p style={{fontSize:'clamp(21px,2.8vw,29px)',fontWeight:700,margin:'7px 0'}}>{value}</p>
  <small style={{opacity:.8}}>{explanation}</small>
</div>

export default function LoyaltyEconomics(){
  const [month,setMonth]=useState(canaryMonth)
  const [revision,setRevision]=useState(0)
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [result,setResult]=useState(null)
  const [drafts,setDrafts]=useState({})
  const validMonth=/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(month)&&month<=canaryMonth()
  useEffect(()=>{
    let active=true
    if(!validMonth){setLoading(false);setResult(null);setError('Selecciona un mes válido.');return()=>{active=false}}
    const load=async()=>{
      setLoading(true);setError('');setResult(null)
      const {data,error:rpcError}=await supabase.rpc('loyalty_admin_economics',{
        p_month_start:month+'-01'
      })
      if(!active)return
      if(rpcError){
        setError('No se pudo obtener el análisis: '+rpcError.message)
      }else if(!data||!data.totals||!Array.isArray(data.reward_types)||
        !Array.isArray(data.visits_by_day)){
        setError('Supabase devolvió una respuesta incompleta. No se muestran estimaciones.')
      }else{
        setResult(data)
        const next={}
        for(const r of data.reward_types){
          const key=r.reward_label+'|'+r.reward_threshold
          next[key]=r.estimated_unit_cost==null?'':String(r.estimated_unit_cost)
        }
        setDrafts(next)
      }
      setLoading(false)
    }
    load()
    return()=>{active=false}
  },[month,revision,validMonth])

  const saveCost=async row=>{
    const key=row.reward_label+'|'+row.reward_threshold
    const draft=(drafts[key]||'').trim()
    const value=draft===''?null:parseMoney(draft)
    if(draft!==''&&value===null){
      setError('Introduce un coste estimado entre 0 y 1.000,00 €, con hasta dos decimales.')
      return
    }
    const old=row.estimated_unit_cost==null?null:Number(row.estimated_unit_cost)
    if(old===value)return
    if(!window.confirm(
      '¿Actualizar el coste estimado de «'+row.reward_label+'» a '+
      (value===null?'SIN ESTIMACIÓN':euros(value))+
      '? Se recalcularán los escenarios de todos los meses, incluso anteriores. NO modifica premios ni visitas.'
    ))return
    setBusy(true);setError('');setNotice('')
    const {error:rpcError}=await supabase.rpc('loyalty_admin_set_reward_cost',{
      p_reward_label:row.reward_label,
      p_reward_threshold:row.reward_threshold,
      p_estimated_unit_cost:value
    })
    setBusy(false)
    if(rpcError){setError('No se guardó el coste: '+rpcError.message);return}
    setNotice('Escenario económico actualizado y auditado. No se han modificado tarjetas ni premios.')
    setRevision(n=>n+1)
  }

  const summary=useMemo(()=>{
    if(!result)return null
    const t=result.totals
    const totalCards=Number(t.cards_total)||0
    const visited=Number(t.cards_visited_month)||0
    const returning=Number(t.returning_cards_month)||0
    const unknownRedemptions=Number(t.redemptions_missing_cost)||0
    const unknownOutstanding=Number(t.outstanding_missing_cost)||0
    const costsKnownRedemptions=Number(t.estimated_redemption_cost_known)||0
    const costsKnownOutstanding=Number(t.estimated_outstanding_cost_known)||0
    return {
      totalCards,visited,returning,
      returnShare:percent(returning,visited),
      verifiedRepeatShare:percent(Number(t.cards_with_2plus_visits)||0,totalCards),
      redemptionsCost:unknownRedemptions===0?euros(costsKnownRedemptions):
        euros(costsKnownRedemptions)+' (PARCIAL)',
      outstandingCost:unknownOutstanding===0?euros(costsKnownOutstanding):
        euros(costsKnownOutstanding)+' (PARCIAL)',
      unknownRedemptions,unknownOutstanding
    }
  },[result])

  const distribution=result?.card_progress_distribution
  const values=distribution?[
    ['Sin visitas',distribution.zero],['1 visita',distribution.one],
    ['2 visitas',distribution.two],['3–4 visitas',distribution.three_four],
    ['5+ visitas',distribution.five_plus]
  ]:[]
  const maxVisits=Math.max(1,...(result?.visits_by_day||[]).map(x=>Number(x.visits)||0))

  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>La Famiglia · Loyalty Intelligence</h3>
      <p>Medimos <strong>marcas validadas, tarjetas con visitas repetidas y premios</strong>.
        Los costes son <strong>escenarios manuales</strong> de coste directo por premio, no
        costes reales de facturas, ingresos incrementales, margen ni retorno de inversión.</p>
      <p>Este análisis es agregado, privado y no contiene nombres, teléfonos, emails
        ni datos de reservas. Las tarjetas eliminadas dejan de aparecer en las estadísticas.</p>
      <div style={{display:'flex',alignItems:'end',gap:12,flexWrap:'wrap'}}>
        <label>Mes de actividad
          <input type="month" value={month} min="2000-01" max={canaryMonth()}
            onChange={e=>setMonth(e.target.value)} disabled={busy}/>
        </label>
        <button type="button" className="ghost-button" disabled={busy||loading}
          onClick={()=>setRevision(n=>n+1)}>Actualizar desde Supabase</button>
      </div>
      {loading&&<p role="status">Calculando la actividad de La Famiglia…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
    </div>
    {!loading&&result&&summary&&<>
      <div className="dashboard-panel">
        <h3>Actividad · {result.month}</h3>
        <p>{result.period_closed?'Mes calendario concluido':'Mes en curso: datos parciales hasta hoy'}</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
          <KPI label="Tarjetas emitidas en el mes" value={integer(result.totals.issued_month)}
            explanation="Sin identificar a los clientes"/>
          <KPI label="Visitas verificadas" value={integer(result.totals.stamps_month)}
            explanation="Una marca autorizada por fecha y tarjeta"/>
          <KPI label="Tarjetas con visitas este mes" value={integer(summary.visited)}
            explanation="Tarjetas únicas, no clientes identificados"/>
          <KPI label="Tarjetas que ya tenían una visita anterior" value={integer(summary.returning)}
            explanation={summary.returnShare===null?'Sin base para proporción':
              summary.returnShare+'% de las tarjetas con visitas en este mes'}/>
          <KPI label="Premios entregados este mes" value={integer(result.totals.redemptions_month)}
            explanation="Retiros marcados por personal"/>
          <KPI label="Premios disponibles sin canjear" value={integer(result.totals.rewards_outstanding)}
            explanation="Saldo actual de tarjetas activas, no del cierre histórico"/>
          <KPI label="Coste estimado de premios entregados" value={summary.redemptionsCost}
            explanation={summary.unknownRedemptions?
              summary.unknownRedemptions+' premios carecen de coste estimado':'Escenario, NO coste realizado'}/>
          <KPI label="Coste estimado de premios pendientes" value={summary.outstandingCost}
            explanation={summary.unknownOutstanding?
              summary.unknownOutstanding+' premios sin coste estimado':'Valoración del saldo actual, no deuda contable'}/>
        </div>
        <p style={{marginTop:14}}>Tarjetas actualmente existentes: <strong>{integer(summary.totalCards)}</strong>.
          Con dos o más visitas verificadas: <strong>{integer(result.totals.cards_with_2plus_visits)}</strong>
          {summary.verifiedRepeatShare!==null?' ('+summary.verifiedRepeatShare+'%)':''}.
          Esto es repetición observada entre tarjetas conservadas, <strong>no</strong>
          tasa de fidelización de todos los comensales.</p>
      </div>
      <div className="dashboard-panel">
        <h3>Costes estimados por tipo de recompensa</h3>
        <p>Introduce el coste directo aproximado de entregar una unidad de cada premio
          (ingredientes y otros costes directos conocidos). Puedes dejarlo sin estimación;
          el sistema mostrará los totales monetarios como <strong>parciales</strong>.</p>
        <p><strong>Importante:</strong> cambiar un coste recalcula la estimación también
          para meses anteriores. No se modifica el premio del cliente ni se generan gastos
          en Analytics; cada cambio de supuesto se registra con tu usuario.</p>
        {result.reward_types.length===0?<p>Aún no hay tarjetas emitidas. No hay costes que configurar.</p>:
          <div style={{display:'grid',gap:13}}>
            {result.reward_types.map(row=>{
              const key=row.reward_label+'|'+row.reward_threshold
              return <div key={key} style={{
                border:'1px solid rgba(130,115,90,.35)',borderRadius:12,padding:14
              }}>
                <h4>{row.reward_label}</h4>
                <p>Una recompensa cada {row.reward_threshold} visitas ·
                  {row.issued_cards} tarjetas históricamente emitidas aún existentes ·
                  {row.redeemed_month} premios canjeados este mes ·
                  {row.rewards_outstanding} premios pendientes actualmente</p>
                <div style={{display:'flex',gap:12,alignItems:'end',flexWrap:'wrap'}}>
                  <label>Coste directo estimado por unidad (€)
                    <input type="text" inputMode="decimal" placeholder="Sin estimación"
                      style={{display:'block',padding:9,maxWidth:180,width:'100%'}}
                      value={drafts[key]??''} disabled={busy}
                      onChange={e=>setDrafts(prev=>({...prev,[key]:e.target.value}))}/>
                  </label>
                  <button type="button" className="primary-button" disabled={busy}
                    onClick={()=>saveCost(row)}>Guardar escenario de coste</button>
                </div>
              </div>
            })}
          </div>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))',gap:16}}>
        <div className="dashboard-panel">
          <h3>Marcas actuales por tarjeta</h3>
          <p>Distribución de tarjetas existentes según visitas verificadas acumuladas.</p>
          <div style={{display:'grid',gap:10}}>
            {values.map(([label,value])=><div key={label} style={{
              display:'flex',justifyContent:'space-between',borderBottom:'1px solid rgba(130,130,130,.2)',paddingBottom:8
            }}><span>{label}</span><strong>{integer(value)}</strong></div>)}
          </div>
        </div>
        <div className="dashboard-panel">
          <h3>Visitas por fecha del mes</h3>
          <p>Fechas de marcas aprobadas por el personal, no fechas de reserva.</p>
          {result.visits_by_day.length===0?<p>Sin visitas registradas en este mes.</p>:
            <div style={{display:'grid',gap:10}}>
              {result.visits_by_day.map(row=><div key={row.date}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>{row.date}</span><strong>{integer(row.visits)}</strong>
                </div>
                <div style={{height:8,borderRadius:6,background:'rgba(130,130,130,.2)',overflow:'hidden'}}>
                  <div style={{width:100*(Number(row.visits)||0)/maxVisits+'%',height:'100%',
                    background:'var(--accent-color,#a88150)'}}/>
                </div>
              </div>)}
            </div>}
        </div>
      </div>
      <div className="dashboard-panel">
        <h3>Qué podemos afirmar y qué NO</h3>
        <p><strong>Sí:</strong> número de marcas verificadas y tarjetas que regresaron
          después de una visita anterior, premios entregados y pendientes según el saldo actual.</p>
        <p><strong>No:</strong> que el programa haya generado todas esas visitas; no tenemos
          grupo de control, ingresos asociados al titular ni datos TPV. El coste
          indicado es una hipótesis revisable, no factura real ni ahorro fiscal.</p>
        <p>El coste de premios pendientes es la valoración del <strong>saldo actual</strong>
          de tarjetas activas; al eliminar una tarjeta, desaparecen sus visitas del
          informe. Los meses anteriores también pueden cambiar si se corrigen datos
          o se modifica el supuesto de coste.</p>
      </div>
    </>}
  </div>
}
