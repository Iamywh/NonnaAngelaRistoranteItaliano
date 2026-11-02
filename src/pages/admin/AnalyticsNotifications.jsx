import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import {canaryIsoDate,previewDigest,shiftDay} from '../../lib/analyticsDigest.mjs'
const initial={enabled:false,daily_enabled:true,weekly_enabled:true,telegram_enabled:false}
const pad={border:'1px solid rgba(120,120,120,.3)',padding:14,borderRadius:12}
const dateString=date=>date?new Date(date).toLocaleString('es-ES',{timeZone:'Atlantic/Canary'}):'—'
const iconFor=level=>level==='warning'?'⚠️':'ℹ️'
export default function AnalyticsNotifications({onNavigate}){
  const [settings,setSettings]=useState(initial)
  const [messages,setMessages]=useState([])
  const [readIds,setReadIds]=useState([])
  const [previewRows,setPreviewRows]=useState([])
  const [previewMode,setPreviewMode]=useState('daily')
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [refresh,setRefresh]=useState(0)
  const [dirty,setDirty]=useState(false)
  const today=canaryIsoDate()
  useEffect(()=>{
    let alive=true
    const load=async()=>{
      setLoading(true);setError('');setNotice('')
      const [auth,prefs,inbox,days]=await Promise.all([
        supabase.auth.getUser(),
        supabase.from('analytics_notification_settings')
          .select('enabled,daily_enabled,weekly_enabled,telegram_enabled').eq('singleton',1).maybeSingle(),
        supabase.from('analytics_notifications')
          .select('id,cadence,local_run_date,period_start,period_end,title,body,level,telegram_state,created_at')
          .order('created_at',{ascending:false}).limit(60),
        supabase.from('analytics_daily_entries')
          .select('business_date,status,lunch_status,dinner_status,analytics_service_entries(service_type,covers)')
          .gte('business_date',shiftDay(today,-7)).lt('business_date',today)
          .order('business_date',{ascending:false}).limit(10)
      ])
      if(!alive)return
      const failed=[prefs,inbox,days].find(r=>r.error)
      if(auth.error||failed){
        setError('No se pudo abrir Notificaciones: '+(auth.error?.message||failed?.error?.message))
        setLoading(false);return
      }
      if(!prefs.data){
        setError('Falta la configuración de notificaciones. Ejecuta la migración SQL de la Fase 11.')
        setLoading(false);return
      }
      if((inbox.data||[]).length>=60){
        setNotice('Mostrando los 60 mensajes más recientes; las notificaciones antiguas siguen en Supabase.')
      }
      const ids=(inbox.data||[]).map(x=>x.id)
      let reads={data:[],error:null}
      if(ids.length&&auth.data?.user)reads=await supabase.from('analytics_notification_reads')
        .select('notification_id').eq('user_id',auth.data.user.id).in('notification_id',ids)
      if(!alive)return
      if(reads.error){setError('No se pudo cargar el estado de lectura: '+reads.error.message);setLoading(false);return}
      setSettings(prefs.data)
      setDirty(false)
      setMessages(inbox.data||[])
      setReadIds((reads.data||[]).map(x=>x.notification_id))
      setPreviewRows(days.data||[])
      setLoading(false)
    }
    load()
    return()=>{alive=false}
  },[refresh,today])
  const update=(key,value)=>{
    setSettings(old=>({...old,[key]:value}))
    setDirty(true);setError('');setNotice('')
  }
  const save=async event=>{
    event.preventDefault()
    if(settings.enabled&&!settings.daily_enabled&&!settings.weekly_enabled){
      setError('Activa al menos una periodicidad.');return
    }
    if(settings.enabled&&settings.telegram_enabled&&
      !window.confirm('Telegram enviará resúmenes operativos a un chat privado configurado con secrets del servidor. ¿Has verificado que el destinatario esté autorizado?'))return
    setSaving(true);setError('');setNotice('')
    const {error:writeError}=await supabase.rpc('analytics_save_notification_settings',{
      p_enabled:settings.enabled,p_daily_enabled:settings.daily_enabled,
      p_weekly_enabled:settings.weekly_enabled,p_telegram_enabled:settings.telegram_enabled
    })
    setSaving(false)
    if(writeError){setError('No se guardaron preferencias: '+writeError.message);return}
    setDirty(false)
    setNotice('Preferencias guardadas. La programación depende de la configuración privada del servidor.')
  }
  const read=async id=>{
    if(readIds.includes(id))return
    const {data,error:readError}=await supabase.rpc('analytics_mark_notification_read',{p_notification_id:id})
    if(readError||data!==true){setError('No se pudo marcar como leída.');return}
    setReadIds(old=>[...old,id])
  }
  const preview=useMemo(()=>previewDigest({kind:previewMode,today,days:previewRows}),
    [previewMode,today,previewRows])
  const unread=messages.filter(x=>!readIds.includes(x.id)).length
  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Notificaciones · Resúmenes automáticos</h3>
      <p>Centro privado de notificaciones de Nonna Angela. Los resúmenes son informativos;
        no calculan beneficio ni convierten fechas sin registrar en facturación cero.</p>
      {loading&&<p role="status">Cargando preferencias y mensajes desde Supabase…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      <button className="ghost-button" type="button" disabled={loading||saving}
        onClick={()=>setRefresh(n=>n+1)}>Actualizar bandeja</button>
    </div>
    {!loading&&!error&&<div className="dashboard-panel">
      <h3>1. Preferencias globales del restaurante</h3>
      <form onSubmit={save} style={{display:'grid',gap:14}} noValidate>
        <label style={{display:'flex',gap:10,alignItems:'center'}}>
          <input type="checkbox" checked={settings.enabled} disabled={saving}
            onChange={e=>update('enabled',e.target.checked)}/>
          <strong>Activar generación programada de resúmenes</strong>
        </label>
        <label style={{display:'flex',gap:10,alignItems:'center'}}>
          <input type="checkbox" checked={settings.daily_enabled} disabled={saving}
            onChange={e=>update('daily_enabled',e.target.checked)}/>
          Resumen diario (del día anterior)
        </label>
        <label style={{display:'flex',gap:10,alignItems:'center'}}>
          <input type="checkbox" checked={settings.weekly_enabled} disabled={saving}
            onChange={e=>update('weekly_enabled',e.target.checked)}/>
          Resumen semanal (lunes, sobre la semana anterior)
        </label>
        <label style={{display:'flex',gap:10,alignItems:'center'}}>
          <input type="checkbox" checked={settings.telegram_enabled} disabled={saving}
            onChange={e=>update('telegram_enabled',e.target.checked)}/>
          Permitir Telegram a destinatario financiero autorizado (opcional)
        </label>
        <p>Telegram utiliza <strong>ANALYTICS_TELEGRAM_BOT_TOKEN</strong> y <strong>ANALYTICS_TELEGRAM_CHAT_ID</strong>, ambos específicos de Analytics. No se reutiliza el bot de reservas.
          Sin secrets y sin despliegue de la Edge Function, guardar estas preferencias NO
          genera envíos. Todos los mensajes requieren activación explícita.</p>
        <button type="submit" className="primary-button"
          disabled={saving||!dirty||(settings.enabled&&!settings.daily_enabled&&!settings.weekly_enabled)}>
          {saving?'Guardando…':'Guardar preferencias'}
        </button>
        {dirty&&<small role="status">Tienes cambios sin guardar.</small>}
      </form>
    </div>}
    {!loading&&<div className="dashboard-panel">
      <h3>2. Vista previa (sin guardar ni enviar)</h3>
      <p>Prueba el formato usando únicamente registros ya existentes. Esta simulación
        no crea notificaciones ni envía Telegram.</p>
      <label>Periodicidad de la vista previa
        <select value={previewMode} onChange={e=>setPreviewMode(e.target.value)}>
          <option value="daily">Diario · ayer</option>
          <option value="weekly">Semanal · últimos 7 días completos</option>
        </select>
      </label>
      <div style={pad}>
        <strong>Período: {preview.begin}{preview.begin!==preview.end?' a '+preview.end:''}</strong>
        <p>Jornadas registradas: {preview.recorded} · finalizadas: {preview.finalized}</p>
        {preview.hasData?<>
          <p>Comensales finalizados: almuerzo {preview.lunch}, cena {preview.dinner},
            total <strong>{preview.total}</strong>.</p>
          {preview.provisional>0&&<p role="status">
            {preview.provisional} jornada(s) en borrador: sus comensales no se suman al total final.
          </p>}
        </>:<p>No hay registros disponibles para crear un resumen real de ese período.</p>}
        <small>{preview.notes.join(' ')}</small>
      </div>
      <button type="button" className="ghost-button" onClick={()=>onNavigate?.('daily')}>
        Ir a Registro diario
      </button>
    </div>}
    {!loading&&<div className="dashboard-panel">
      <h3>3. Bandeja privada · {unread} sin leer</h3>
      {messages.length===0?<p>No hay resúmenes programados todavía. Por defecto,
        el sistema está desactivado. La vista previa no crea mensajes.</p>:
        <div style={{display:'grid',gap:12}}>
          {messages.map(row=><div key={row.id} style={{...pad,display:'grid',gap:8}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
              <strong>{iconFor(row.level)} {row.title}</strong>
              <small>{readIds.includes(row.id)?'Leído':'Sin leer'}</small>
            </div>
            <small>{row.period_start} — {row.period_end} · Creado: {dateString(row.created_at)}</small>
            <p style={{whiteSpace:'pre-wrap'}}>{row.body}</p>
            <small>Telegram: {row.telegram_state==='sent'?'enviado':
              row.telegram_state==='disabled'?'no activado':
              row.telegram_state==='pending'?'pendiente de configuración/envío':
              row.telegram_state==='sending'?'intento reservado':'entrega fallida (sin reintento automático)'}</small>
            {!readIds.includes(row.id)&&<button type="button" className="ghost-button"
              onClick={()=>read(row.id)}>Marcar como leído</button>}
          </div>)}
        </div>}
      <p>Se conservan los resúmenes sin duplicar fechas. El scheduler funciona
        aproximadamente a las 09:15 en invierno y 10:15 en verano (Canarias);
        GitHub Actions puede tener retrasos. Para alertas de objetivos o costes,
        utiliza la pestaña <strong>Alertas</strong>.</p>
    </div>}
  </div>
}
