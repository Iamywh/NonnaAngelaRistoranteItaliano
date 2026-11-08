import React,{useEffect,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import '../../styles/loyalty.css'

const todayCanary=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date())
const settingsInit={issuing_enabled:false,reward_threshold:5,reward_label:''}
const humanError=(error,fallback)=>error?.message||fallback
export default function LoyaltyManager(){
  const [settings,setSettings]=useState(null)
  const [draft,setDraft]=useState(settingsInit)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [issued,setIssued]=useState(null)
  const [code,setCode]=useState('')
  const [card,setCard]=useState(null)
  const [visitDate,setVisitDate]=useState(todayCanary)
  const [witnessed,setWitnessed]=useState(false)

  const refreshSettings=async()=>{
    const {data,error:rpcError}=await supabase.rpc('loyalty_admin_settings')
    if(rpcError)throw Error(humanError(rpcError,'No se pudo cargar el programa'))
    setSettings(data)
    setDraft({issuing_enabled:!!data.issuing_enabled,
      reward_threshold:Number(data.reward_threshold),
      reward_label:data.reward_label||''})
  }
  useEffect(()=>{
    let active=true
    async function load(){
      setLoading(true)
      const {data,error:rpcError}=await supabase.rpc('loyalty_admin_settings')
      if(!active)return
      if(rpcError)setError('No se pudo consultar el programa: '+rpcError.message)
      else{
        setSettings(data)
        setDraft({issuing_enabled:!!data.issuing_enabled,
          reward_threshold:Number(data.reward_threshold),
          reward_label:data.reward_label||''})
      }
      setLoading(false)
    }
    load()
    return()=>{active=false}
  },[])

  const configure=async event=>{
    event.preventDefault()
    setError('');setMessage('')
    const label=draft.reward_label.trim()
    if(!Number.isInteger(draft.reward_threshold)||draft.reward_threshold<3||draft.reward_threshold>12||
      (label&& (label.length<5||label.length>100)) ||
      (draft.issuing_enabled&&!label)){
      setError('Define entre 3 y 12 visitas y un premio de 5 a 100 caracteres al activar la emisión.')
      return
    }
    if(!window.confirm(
      '¿Guardar la nueva oferta para las PRÓXIMAS tarjetas? Las tarjetas ya entregadas mantendrán sus condiciones.'
    ))return
    setBusy(true)
    const {data,error:rpcError}=await supabase.rpc('loyalty_admin_configure',{
      p_issuing_enabled:draft.issuing_enabled,
      p_reward_threshold:draft.reward_threshold,
      p_reward_label:label||null
    })
    setBusy(false)
    if(rpcError){setError('No se guardó: '+rpcError.message);return}
    setSettings(data)
    setDraft({issuing_enabled:data.issuing_enabled,
      reward_threshold:data.reward_threshold,reward_label:data.reward_label||''})
    setMessage('Condiciones guardadas. Se aplican solo a tarjetas nuevas.')
  }

  const createCard=async()=>{
    if(busy||!settings?.issuing_enabled)return
    setError('');setMessage('')
    if(!window.confirm('¿Emitir una tarjeta nueva? El enlace secreto solo se mostrará UNA VEZ.'))return
    setBusy(true);setIssued(null)
    const {data,error:rpcError}=await supabase.rpc('loyalty_admin_issue')
    setBusy(false)
    if(rpcError){setError('No se ha creado la tarjeta: '+rpcError.message);return}
    if(!data?.token||!data?.public_code){
      setError('Respuesta incompleta. Comprueba la tabla antes de reintentar, para evitar duplicados.')
      return
    }
    setIssued(data)
    setMessage('Tarjeta creada. Entrega el enlace privado al cliente antes de cerrar esta pantalla.')
    refreshSettings().catch(()=>{})
  }
  const link=issued?window.location.origin+'/famiglia#card='+issued.token:''
  const copyLink=async()=>{
    if(!issued)return
    try{
      await navigator.clipboard.writeText(link)
      setMessage('Enlace privado copiado. Envíalo solo al titular, nunca en un grupo público.')
    }catch{setError('Copia manualmente el enlace mostrado abajo.')}
  }
  const search=async(event)=>{
    event?.preventDefault?.()
    const normalized=code.trim().toUpperCase()
    setError('');setMessage('');setCard(null);setWitnessed(false)
    if(!/^[A-F0-9]{8}$/.test(normalized)){
      setError('El código de tarjeta tiene 8 caracteres hexadecimales.');return
    }
    setBusy(true)
    const {data,error:rpcError}=await supabase.rpc('loyalty_admin_lookup',{p_public_code:normalized})
    setBusy(false)
    if(rpcError){setError('No se pudo consultar: '+rpcError.message);return}
    if(!data){setError('No existe ninguna tarjeta con ese código.');return}
    setCode(normalized);setCard(data)
  }
  const stamp=async()=>{
    if(!card||!witnessed||busy)return
    if(!window.confirm('¿Confirmas que esta visita fue REAL, verificaste el consumo y la fecha '+visitDate+'?'))return
    setBusy(true);setError('');setMessage('')
    const {data,error:rpcError}=await supabase.rpc('loyalty_admin_stamp',{
      p_public_code:card.public_code,p_visit_date:visitDate
    })
    setBusy(false)
    if(rpcError){setError('No se registró la visita: '+rpcError.message);return}
    setCard(data);setWitnessed(false)
    setMessage('✅ Visita validada y registrada con tu usuario de Analytics.')
    refreshSettings().catch(()=>{})
  }
  const redeem=async()=>{
    if(!card||busy||card.available_rewards<1)return
    if(!window.confirm(
      '¿Has ENTREGADO físicamente el premio «'+card.reward_label+'»? Esta acción gastará una recompensa.'
    ))return
    setBusy(true);setError('');setMessage('')
    const {data,error:rpcError}=await supabase.rpc('loyalty_admin_redeem',{
      p_public_code:card.public_code
    })
    setBusy(false)
    if(rpcError){setError('No se ha canjeado: '+rpcError.message);return}
    setCard(data)
    setMessage('🎁 Premio entregado y descontado de la tarjeta.')
    refreshSettings().catch(()=>{})
  }

  return <div className="loyalty-admin">
    <div className="dashboard-panel">
      <h3>La Famiglia · Programa piloto de fidelización</h3>
      <p>Una tarjeta privada por cliente, una marca por día de visita comprobada.
        No se registran nombres, teléfonos ni emails. Solo los usuarios owner/admin
        de Analytics pueden crear tarjetas, validar visitas y canjear premios.</p>
      <p>El programa nace <strong>desactivado</strong>. Configura el coste del premio
        y activa la emisión expresamente. Los premios de tarjetas anteriores no cambian
        si modificas la oferta para nuevas tarjetas.</p>
      {loading&&<p role="status">Cargando programa…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {message&&<p role="status">{message}</p>}
    </div>
    {!loading&&settings&&<>
      <div className="dashboard-panel">
        <h3>Resumen del piloto</h3>
        <div className="loyalty-stats">
          {[['Tarjetas emitidas',settings.total_cards],
            ['Tarjetas activas',settings.active_cards],
            ['Visitas registradas · 30 días',settings.visits_30_days],
            ['Premios entregados · 30 días',settings.rewards_30_days]
          ].map(([title,value])=><div key={title}><small>{title}</small><strong>{value??0}</strong></div>)}
        </div>
      </div>
      <div className="dashboard-panel">
        <h3>Configurar próximas tarjetas</h3>
        <form onSubmit={configure} className="loyalty-admin-form">
          <label>Visitas necesarias por premio (3 a 12)
            <input type="number" min="3" max="12" step="1" required
              disabled={busy} value={draft.reward_threshold}
              onChange={e=>setDraft(x=>({...x,reward_threshold:Number(e.target.value)}))}/>
          </label>
          <label>Premio ofrecido
            <input type="text" minLength="5" maxLength="100"
              placeholder="Ej. Un tiramisú de la casa (valorar coste)"
              value={draft.reward_label} disabled={busy}
              onChange={e=>setDraft(x=>({...x,reward_label:e.target.value}))}/>
          </label>
          <label className="loyalty-checkbox">
            <input type="checkbox" checked={draft.issuing_enabled} disabled={busy}
              onChange={e=>setDraft(x=>({...x,issuing_enabled:e.target.checked}))}/>
            Permitir emitir tarjetas nuevas
          </label>
          <p>El interruptor controla únicamente la <strong>emisión de nuevas tarjetas</strong>.
            Las tarjetas antiguas pueden seguir recibiendo visitas y canjear premios legítimos.</p>
          <button className="primary-button" type="submit" disabled={busy}>Guardar condiciones</button>
        </form>
      </div>
      <div className="dashboard-panel">
        <h3>1 · Emitir tarjeta durante una visita</h3>
        <p>El cliente puede guardar el enlace en su móvil. Nadie puede auto-emitirse
          tarjetas desde la web. El token privado se enseña <strong>una sola vez</strong>.</p>
        <button className="primary-button" type="button"
          disabled={busy||!settings.issuing_enabled} onClick={createCard}>
          Crear tarjeta La Famiglia
        </button>
        {!settings.issuing_enabled&&<p role="status">Emisión apagada. Guarda y activa primero una oferta real.</p>}
        {issued&&<div className="loyalty-issued" role="region" aria-label="Nueva tarjeta">
          <p><strong>Código de sala:</strong> {issued.public_code}</p>
          <p><strong>Premio:</strong> {issued.reward_label} cada {issued.reward_threshold} visitas.</p>
          <label>Enlace PRIVADO (visible solo esta vez)
            <textarea rows={3} readOnly value={link} onFocus={e=>e.target.select()}/>
          </label>
          <div className="loyalty-actions">
            <button className="ghost-button" type="button" onClick={copyLink}>
              Copiar enlace para entregar al cliente</button>
            <button className="ghost-button" type="button" onClick={()=>setIssued(null)}>
              Enlace entregado · Ocultar ahora</button>
          </div>
          <p>Conserva solo el código corto para el control en sala. El secreto no se
            almacena en la base de datos ni se puede recuperar desde este panel.</p>
        </div>}
      </div>
      <div className="dashboard-panel">
        <h3>2 · Validar visitas y canjear premios</h3>
        <p>Pide al cliente que muestre el código corto de su tarjeta. Antes de
          añadir una marca, comprueba presencialmente que hubo consumo real.</p>
        <form onSubmit={search} className="loyalty-admin-form">
          <label>Código de la tarjeta
            <input type="text" autoCapitalize="characters" maxLength={8}
              placeholder="Ej. A14E59D2" value={code} disabled={busy}
              onChange={e=>{setCode(e.target.value.toUpperCase());setCard(null);setWitnessed(false)}}/>
          </label>
          <button type="submit" className="ghost-button" disabled={busy}>Buscar tarjeta</button>
        </form>
        {card&&<div className="loyalty-issued">
          <h4>Tarjeta {card.public_code}</h4>
          <p>Estado: <strong>{card.status}</strong> · Visitas verificadas: <strong>{card.visits}</strong>
            {' '}· Premios ya entregados: <strong>{card.redeemed}</strong>.</p>
          <p>Recompensa: {card.reward_label} cada {card.reward_threshold} visitas.
            Disponibles: <strong>{card.available_rewards}</strong>.</p>
          <p>Última visita registrada: {card.last_visit||'Ninguna'}.</p>
          <label>Fecha del servicio (hoy o máximo 7 días anteriores)
            <input type="date" value={visitDate} max={todayCanary()}
              disabled={busy||card.status!=='active'} onChange={e=>setVisitDate(e.target.value)}/>
          </label>
          <label className="loyalty-checkbox">
            <input type="checkbox" checked={witnessed} disabled={busy||card.status!=='active'}
              onChange={e=>setWitnessed(e.target.checked)}/>
            He verificado la visita real y que no se ha registrado ya ese día.
          </label>
          <div className="loyalty-actions">
            <button type="button" className="primary-button" disabled={busy||!witnessed||card.status!=='active'}
              onClick={stamp}>Registrar visita verificada</button>
            <button type="button" className="ghost-button" disabled={busy||card.status!=='active'||card.available_rewards<1}
              onClick={redeem}>Marcar premio ENTREGADO</button>
          </div>
          <p>Solo se puede registrar una visita por día natural y entregar un premio
            al día. El servidor vuelve a comprobar todos los saldos antes de canjear.</p>
        </div>}
      </div>
      <div className="dashboard-panel">
        <h3>Control económico y privacidad</h3>
        <p>Antes de empezar, estima el coste real del premio y exige una visita con
          consumo. No asignamos importes de caja ni descuentos automáticos.</p>
        <p>Las tarjetas son portadoras: quien tiene el enlace puede consultarlas.
          No se usan emails ni teléfonos de reservas, no hay campañas y no se hace
          matching de clientes. Si se pierde el enlace, no puede recuperarse a partir
          de nombre o teléfono porque no los guardamos.</p>
        <p>El titular puede eliminar la tarjeta y su historial desde su enlace.
          Para analizar impacto real necesitaremos un piloto controlado con visitas
          y premios verificados, no una estimación de rentabilidad inventada.</p>
      </div>
    </>}
  </div>
}
