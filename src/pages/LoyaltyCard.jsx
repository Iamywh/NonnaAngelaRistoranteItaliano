import React,{useEffect,useState} from 'react'
import {publicSupabase} from '../lib/supabaseClient.js'
import '../styles/loyalty.css'

// A private pass URL uses a fragment, never a query parameter: fragments are
// not sent in HTTP requests or standard referrer headers. The token remains a
// bearer credential: anyone with the link can display/delete that card.
const STORAGE_KEY='nonna_famiglia_card_token'
const TOKEN_RE=/^[0-9a-f]{64}$/
const tokenFromFragment=()=>{
  const raw=window.location.hash.slice(1).replace(/^card=/,'')
  return TOKEN_RE.test(raw)?raw:null
}
const cardLink=token=>window.location.origin+'/famiglia#card='+token
const safeStoredToken=()=>{
  try{
    const saved=window.localStorage.getItem(STORAGE_KEY)
    return TOKEN_RE.test(saved||'')?saved:null
  }catch{return null}
}
export default function LoyaltyCard({onOpenAccount}){
  const [token,setToken]=useState(()=>tokenFromFragment()||safeStoredToken())
  const [program,setProgram]=useState(null)
  const [card,setCard]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [revision,setRevision]=useState(0)
  const [saved,setSaved]=useState(()=>{const actual=tokenFromFragment()||safeStoredToken();return Boolean(actual&&actual===safeStoredToken())})

  useEffect(()=>{
    let active=true
    publicSupabase.rpc('loyalty_public_program').then(({data,error})=>{
      if(active&&!error)setProgram(data)
    }).catch(()=>{})
    return()=>{active=false}
  },[])

  useEffect(()=>{
    let active=true
    if(!token){setCard(null);return()=>{active=false}}
    async function load(){
      setBusy(true);setError('');setMessage('')
      const {data,error:rpcError}=await publicSupabase.rpc('loyalty_public_card',{p_token:token})
      if(!active)return
      if(rpcError){
        setCard(null)
        setError('No hemos podido consultar tu tarjeta. Inténtalo de nuevo.')
      } else if(!data){
        setCard(null)
        setError('Tarjeta no encontrada o enlace incorrecto.')
      }else setCard(data)
      setBusy(false)
    }
    load()
    return()=>{active=false}
  },[token,revision])

  const remember=()=>{
    if(!token)return
    try{
      localStorage.setItem(STORAGE_KEY,token)
      setSaved(true)
      setMessage('Esta tarjeta se ha guardado en este dispositivo.')
    }catch{setError('El navegador no permite guardar la tarjeta. Conserva el enlace privado.')}
  }
  const copyLink=async()=>{
    if(!token)return
    try{
      await navigator.clipboard.writeText(cardLink(token))
      setMessage('Enlace privado copiado. No lo compartas públicamente.')
    }catch{setError('No se ha podido copiar. Puedes guardar la dirección desde el navegador.')}
  }
  const forget=()=>{
    try{localStorage.removeItem(STORAGE_KEY)}catch{/* storage not available */}
    window.history.replaceState({},'',window.location.pathname)
    setToken(null);setCard(null);setSaved(false);setMessage('Tarjeta olvidada en este dispositivo.')
    setError('')
  }
  const erase=async()=>{
    if(!token||busy)return
    if(!window.confirm(
      '¿Borrar DEFINITIVAMENTE esta tarjeta y sus visitas/premios? Esta operación no se puede deshacer.'
    ))return
    setBusy(true);setError('');setMessage('')
    const {data,error:rpcError}=await publicSupabase.rpc('loyalty_public_delete',{p_token:token})
    setBusy(false)
    if(rpcError||!data){
      setError('No ha sido posible borrar la tarjeta. Contacta con el restaurante para solicitar ayuda.')
      return
    }
    forget()
    setMessage('Tarjeta y registros de visitas eliminados.')
  }
  const threshold=Number(card?.reward_threshold)||5
  const visits=Number(card?.visits)||0
  const filled=Number(card?.available_rewards)>0?threshold:(Number(card?.progress)||0)
  return <section className="loyalty-page">
    <div className="loyalty-hero">
      <p className="eyebrow">Nonna Angela Ristorante Italiano</p>
      <h2>La Famiglia di Nonna Angela</h2>
      <p>Un pequeño agradecimiento por cada visita. Sin puntos por gastar más:
        una visita real, una marca. Con cariño, como en casa.</p>
      {!token&&<button className="ghost-button" type="button" onClick={onOpenAccount}>Mi cuenta</button>}
    </div>
    {!token&&<div className="loyalty-panel">
      <h3>{program?.issuing_enabled?'Tu tarjeta de La Famiglia':'La Famiglia · Próximamente'}</h3>
      {program?.issuing_enabled?<>
        <p>Pide tu tarjeta al equipo durante tu próxima visita. Te entregarán
          un enlace privado para que puedas consultar tus marcas y premios.</p>
        <p>Oferta actual para tarjetas nuevas: <strong>{program.reward_label}</strong>
          {' '}por cada <strong>{program.reward_threshold}</strong> visitas verificadas.</p>
      </>:<p>Estamos preparando nuestro programa. Todavía no emitimos tarjetas nuevas.
        Consulta al equipo antes de contar con una recompensa.</p>}
      <p>La inscripción se hace en el restaurante y no requiere nombre, correo
        electrónico ni teléfono. No te enviaremos mensajes comerciales.</p>
      <p>Si ya tienes tu tarjeta, abre el enlace privado que te entregamos.
        Si lo pierdes y no lo guardaste, no podremos recuperarlo por tus datos personales.</p>
    </div>}
    {token&&<div className="loyalty-panel">
      {busy&&!card&&<p role="status">Consultando tu tarjeta…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {card&&<>
        <p className="eyebrow">Tu tarjeta de la Famiglia</p>
        <h3 className="loyalty-code">{card.public_code}</h3>
        <p>Muestra este código al personal para que registre tu visita. Solo
          el equipo puede añadir marcas y entregar premios.</p>
        {card.status!=='active'?<p role="alert">Esta tarjeta está inactiva. Consulta al equipo.</p>:<>
          <p className="loyalty-main-number">{visits} <span>visitas verificadas</span></p>
          <p><strong>Tu recompensa:</strong> {card.reward_label}</p>
          <p><strong>Una recompensa cada {threshold} visitas verificadas.</strong>
            Una visita por día calendario con validación del personal.</p>
          <div className="loyalty-stamps" aria-label={filled+' de '+threshold+' marcas hacia el siguiente premio'}>
            {Array.from({length:threshold},(_,i)=><span
              key={i} className={'loyalty-stamp '+(i<filled?'earned':'')}
              aria-hidden="true">{i<filled?'★':'☆'}</span>)}
          </div>
          {Number(card.available_rewards)>0?<p>¡Ya has completado las marcas para un premio!</p>:
            <p>Próximo premio: {threshold-filled} {threshold-filled===1?'visita':'visitas'} más.</p>}
          {Number(card.available_rewards)>0&&<p className="loyalty-reward-ready">
            🎁 {card.available_rewards} {card.available_rewards===1?'recompensa disponible':'recompensas disponibles'}.
            Pide al personal que la valide cuando visites el restaurante.
          </p>}
          <p>Premios entregados: {card.redeemed||0}.</p>
        </>}
      </>}
      <div className="loyalty-actions">
        {card&&<button type="button" className="ghost-button" onClick={()=>setRevision(n=>n+1)} disabled={busy}>
          Actualizar visitas</button>}
        {card&&!saved&&<button type="button" className="primary-button" onClick={remember}>
          Guardar en este dispositivo</button>}
        {card&&<button type="button" className="ghost-button" onClick={copyLink}>
          Copiar enlace privado</button>}
        <button type="button" className="ghost-button" onClick={forget} disabled={busy}>
          Olvidar tarjeta aquí</button>
      </div>
      {card&&<div className="loyalty-privacy">
        <h4>Privacidad y control</h4>
        <p>Tu enlace es una llave privada. No lo publiques: quien lo conozca podrá
          ver las marcas de esta tarjeta y solicitar su eliminación.
          Guardar la tarjeta en el dispositivo es opcional.</p>
        <p>Solo registramos un código de tarjeta, fechas de visitas aprobadas y
          premios entregados; no utilizamos los datos de tus reservas ni creamos
          una lista de publicidad. Puedes borrar tu tarjeta y sus registros.</p>
        <button type="button" className="ghost-button" onClick={erase} disabled={busy}>
          Eliminar tarjeta y visitas definitivamente</button>
      </div>}
    </div>}
    {message&&<div className="loyalty-panel" role="status">{message}</div>}
    <p className="loyalty-footnote">Las recompensas se validan presencialmente y
      son las indicadas en cada tarjeta. Solo se registra una visita por fecha.
      La tarjeta no acredita pagos ni reservas futuras.</p>
  </section>
}
