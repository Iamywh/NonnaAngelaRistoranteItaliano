import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import {
  EDITORIAL_PLATFORMS,EDITORIAL_FORMATS,EDITORIAL_ROLES,
  EDITORIAL_LANGUAGES,EDITORIAL_STATUSES,EDITORIAL_ACTIONS,EDITORIAL_CHECKS,
  editorialMonth,changeEditorialMonth,emptyEditorialItem,editorialItemForm,
  canReviewEditorial,editorialAllowedActions,validateEditorialPayload,analyzeEditorialItems
} from '../../lib/analyticsEditorial.mjs'

const canaryDate=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date())
const week=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const dropdown=options=>Object.entries(options).map(([value,label])=>
  <option value={value} key={value}>{label}</option>)
const cardBorder='1px solid rgba(138,124,100,.3)'
const groupStyle={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(205px,1fr))',gap:12}
const fieldStyle={display:'grid',gap:6,minWidth:0}
const inputStyle={width:'100%',minWidth:0,padding:10,borderRadius:8,
  border:'1px solid rgba(137,123,106,.45)',background:'transparent',color:'inherit'}
const badge=(value)=>({
  draft:'Borrador',in_review:'En revisión',approved:'Aprobado',
  published:'Publicado',cancelled:'Cancelado'
})[value]||value
function Field({label,children,small}) {
  return <label style={fieldStyle}>
    <span>{label}</span>{children}
    {small&&<small style={{opacity:.75}}>{small}</small>}
  </label>
}
function ItemCard({item,onEdit,onAction,busy,publicationUrl,onPublicationUrl}) {
  const actions=editorialAllowedActions(item)
  const checklistCount=EDITORIAL_CHECKS.filter(x=>item[x.key]===true).length
  return <div style={{border:cardBorder,borderRadius:12,padding:15,display:'grid',gap:9}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
      <div>
        <h4 style={{margin:'0 0 6px'}}>{item.title}</h4>
        <small>{EDITORIAL_PLATFORMS[item.platform]} · {EDITORIAL_FORMATS[item.content_kind]} ·
          {' '}{item.scheduled_time||'Hora por definir'}</small>
      </div>
      <strong>{badge(item.status)}</strong>
    </div>
    <small>Responsable: {EDITORIAL_ROLES[item.owner_role]} ·
      Idioma: {EDITORIAL_LANGUAGES[item.language]} · Versión {item.revision}</small>
    {item.campaign_name&&<small>Campaña: {item.campaign_name}</small>}
    {item.copy_text&&<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',margin:'3px 0'}}>
      {item.copy_text.length>360?item.copy_text.slice(0,360)+'…':item.copy_text}
    </p>}
    {item.cta&&<small><strong>CTA:</strong> {item.cta}</small>}
    {item.hashtags&&<small style={{overflowWrap:'anywhere'}}><strong>Hashtags:</strong> {item.hashtags}</small>}
    <small>Checklist: {checklistCount}/4 ·
      {canReviewEditorial(item)?' listo para revisión':' requiere comprobaciones'}</small>
    {item.status==='published'&&<p>
      Marcado como publicado / ejecutado el {new Date(item.published_at).toLocaleDateString('es-ES')}.
      {item.published_url&&<> {' '}<a href={item.published_url}
        target="_blank" rel="noreferrer">Abrir enlace público</a></>}
    </p>}
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      {!['published','cancelled'].includes(item.status)&&
        <button type="button" className="ghost-button" disabled={busy} onClick={()=>onEdit(item)}>
          Editar borrador / contenido
        </button>}
      {actions.filter(x=>x!=='publish').map(action=>
        <button key={action} type="button"
          className={action==='approve'||action==='submit'?'primary-button':'ghost-button'}
          disabled={busy} onClick={()=>onAction(item,action)}>
          {EDITORIAL_ACTIONS[action]}
        </button>)}
    </div>
    {actions.includes('publish')&&<div style={{display:'grid',gap:9,marginTop:3}}>
      <Field label="Enlace público (opcional; solo HTTPS)"
        small="Si todavía no se publicó fuera del sitio, NO marques el contenido como publicado.">
        <input type="url" style={inputStyle} value={publicationUrl||''}
          disabled={busy} placeholder="https://www.instagram.com/p/..."
          onChange={e=>onPublicationUrl(e.target.value)}/>
      </Field>
      <button type="button" className="primary-button" disabled={busy}
        onClick={()=>onAction(item,'publish')}>{EDITORIAL_ACTIONS.publish} (confirmación manual)</button>
    </div>}
  </div>
}

export default function EditorialCalendar({onNavigate}) {
  const [month,setMonth]=useState(()=>canaryDate().slice(0,7))
  const [selectedDate,setSelectedDate]=useState(canaryDate)
  const [filter,setFilter]=useState('all')
  const [revision,setRevision]=useState(0)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [items,setItems]=useState([])
  const [ready,setReady]=useState(false)
  const [campaigns,setCampaigns]=useState([])
  const [campaignWarning,setCampaignWarning]=useState('')
  const [draft,setDraft]=useState(null)
  const [publicationLinks,setPublicationLinks]=useState({})
  const calendar=useMemo(()=>{try{return editorialMonth(month)}catch{return null}},[month])

  useEffect(()=>{
    let active=true
    if(!calendar){
      setError('Selecciona un mes válido');setLoading(false);setReady(false)
      return()=>{active=false}
    }
    async function load(){
      setLoading(true);setReady(false);setItems([]);setError('');setCampaignWarning('')
      const [editorial,growth]=await Promise.all([
        supabase.rpc('analytics_editorial_list',{
          p_start_date:calendar.start,p_end_date:calendar.end
        }),
        supabase.rpc('analytics_growth_list',{
          p_start_date:calendar.start,p_end_date:calendar.end
        })
      ])
      if(!active)return
      if(editorial.error){
        setError('No se pudo cargar el calendario: '+editorial.error.message)
      }else if(!editorial.data?.ok||
        !Array.isArray(editorial.data.items)||
        editorial.data.count!==editorial.data.items.length){
        setError('El servidor devolvió un calendario incompleto')
      }else{
        try{
          analyzeEditorialItems(editorial.data.items,month)
          setItems(editorial.data.items);setReady(true)
        }catch(e){setError('Calendario inconsistente: '+e.message)}
      }
      if(growth.error||!growth.data?.ok||!Array.isArray(growth.data.campaigns)){
        setCampaigns([])
        setCampaignWarning('No se ha podido leer Growth Planner; puedes crear contenido sin campaña vinculada.')
      }else{
        setCampaigns(growth.data.campaigns)
      }
      setLoading(false)
    }
    load()
    return()=>{active=false}
  },[calendar,month,revision])

  const model=useMemo(()=>{
    if(!ready)return null
    try{return analyzeEditorialItems(items,month)}
    catch(e){return {error:e.message}}
  },[items,ready,month])
  const visible=(model?.byDate?.get(selectedDate)||[])
    .filter(item=>filter==='all'||item.status===filter)
  const gotoMonth=next=>{
    try{
      const info=editorialMonth(next)
      setMonth(next)
      setSelectedDate(info.month===canaryDate().slice(0,7)?canaryDate():info.start)
      setDraft(null);setNotice('');setPublicationLinks({});setFilter('all')
    }catch(e){setError(e.message)}
  }
  const refresh=()=>{
    setDraft(null);setNotice('');setPublicationLinks({})
    setRevision(v=>v+1)
  }
  const edit=(item)=>{
    setDraft(editorialItemForm(item));setError('');setNotice('')
  }
  const create=()=>{
    setDraft(emptyEditorialItem(selectedDate))
    setError('');setNotice('')
  }
  const change=(key,value)=>setDraft(form=>({...form,[key]:value}))
  const save=async event=>{
    event.preventDefault()
    if(saving||!draft)return
    let payload
    try{payload=validateEditorialPayload(draft)}
    catch(e){setError(e.message);return}
    setError('');setNotice('')
    const changedApproved=Boolean(draft.id&&
      ['approved','in_review'].includes(items.find(r=>r.id===draft.id)?.status))
    const confirm=changedApproved?
      '¿Guardar cambios? La aprobación anterior se ANULARÁ y el contenido volverá a borrador.':
      '¿Guardar este borrador en el calendario? No se publicará nada automáticamente.'
    if(!window.confirm(confirm))return
    setSaving(true)
    const {data,error:rpcError}=await supabase.rpc('analytics_editorial_save',{
      p_item:payload
    })
    setSaving(false)
    if(rpcError){
      setError('No se pudo guardar: '+rpcError.message+
        (draft.id?' Si otra sesión ha editado el contenido, actualiza antes de reintentar.':''))
      return
    }
    if(!data?.ok||!data.item?.id){
      setError('Respuesta incompleta. Revisa el calendario antes de reintentar.')
      return
    }
    setDraft(null);setNotice('Contenido guardado en borrador con historial de cambios.')
    setRevision(n=>n+1)
  }
  const action=async(item,act)=>{
    if(saving)return
    if(!editorialAllowedActions(item).includes(act)){
      setError('Acción no disponible para este estado');return
    }
    const link=(publicationLinks[item.id]||'').trim()
    if(act==='publish'&&link&&(!/^https:\/\/[^\s]+$/.test(link)||link.length>500)){
      setError('Enlace público inválido: utiliza HTTPS, sin espacios (máximo 500 caracteres).')
      return
    }
    const question={
      submit:'¿Confirmas que el contenido y las cuatro verificaciones están completos para revisión?',
      approve:'¿Has revisado contenido, fechas, precios, derechos y material? ¿Aprobar?',
      publish:'¿CONFIRMAS que este contenido YA fue publicado o ejecutado FUERA del sitio? Este botón NO publica posts.',
      return_draft:'¿Devolver el contenido a borrador? Se perderá la aprobación.',
      cancel:'¿Cancelar este contenido? Conservará el historial, pero no podrá editarse después.'
    }[act]
    if(!window.confirm(question))return
    setSaving(true);setError('');setNotice('')
    const {data,error:rpcError}=await supabase.rpc('analytics_editorial_action',{
      p_id:item.id,p_expected_revision:item.revision,p_action:act,
      p_published_url:act==='publish'?link||null:null
    })
    setSaving(false)
    if(rpcError){
      setError('Cambio no aplicado: '+rpcError.message+
        ' Actualiza el calendario si cambió en otra sesión.')
      return
    }
    if(!data?.ok||!data.item?.id){
      setError('Respuesta de transición incompleta. Revisa el contenido antes de repetir.')
      return
    }
    setNotice('Estado actualizado y registrado en el historial. No se ha enviado contenido a plataformas externas.')
    setDraft(null);setRevision(n=>n+1)
  }

  const candidates=campaigns.filter(c=>!['cancelled','finished'].includes(c.status)||
    c.id===draft?.campaign_id)
  return <div style={{display:'grid',gap:16}}>
    <div className="dashboard-panel">
      <h3>Calendario editorial y de eventos · Fase 14B</h3>
      <p>Organiza Reel, Stories, carruseles, Google Business, eventos y promociones.
        Los horarios se interpretan en <strong>hora local de Canarias</strong>.
        Ningún cambio aquí publica posts, activa anuncios o envía mensajes.</p>
      <p><strong>Flujo:</strong> borrador → revisión → aprobado → publicado / ejecutado
        (confirmación manual). Si editas un contenido aprobado vuelve a borrador.</p>
      <div style={{display:'flex',gap:12,alignItems:'end',flexWrap:'wrap'}}>
        <button type="button" className="ghost-button" disabled={loading||saving}
          onClick={()=>gotoMonth(changeEditorialMonth(month,-1))}>← Mes anterior</button>
        <Field label="Mes editorial">
          <input type="month" style={inputStyle} min="2000-01" max="2099-12"
            value={month} disabled={loading||saving} onChange={e=>gotoMonth(e.target.value)}/>
        </Field>
        <button type="button" className="ghost-button" disabled={loading||saving}
          onClick={()=>gotoMonth(changeEditorialMonth(month,1))}>Mes siguiente →</button>
        <button type="button" className="ghost-button" disabled={loading||saving}
          onClick={refresh}>Actualizar</button>
        <button type="button" className="primary-button"
          disabled={loading||saving||!ready} onClick={create}>+ Crear contenido</button>
        <button type="button" className="ghost-button" onClick={()=>onNavigate?.('growth')}>
          Ir a Growth Planner
        </button>
      </div>
      {loading&&<p role="status">Cargando calendario privado de Supabase…</p>}
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {campaignWarning&&<p role="status">{campaignWarning}</p>}
    </div>
    {model?.error&&<p role="alert" className="manager-error">{model.error}</p>}
    {ready&&model&&!model.error&&<>
      <div className="dashboard-panel">
        <h3>Estado del contenido · {month}</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(125px,1fr))',gap:10}}>
          {Object.entries(EDITORIAL_STATUSES).map(([value,label])=>
            <div key={value} style={{padding:12,border:cardBorder,borderRadius:10}}>
              <small>{label}</small>
              <p style={{fontWeight:700,fontSize:27,margin:'7px 0'}}>{model.counts[value]}</p>
            </div>)}
        </div>
      </div>
      <div className="dashboard-panel">
        <h3>Agenda mensual</h3>
        <p>Selecciona una fecha para ver y editar el contenido.
          Cada número indica piezas planificadas para ese día, incluidas las canceladas.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:5}}>
          {week.map(day=><strong key={day}
            style={{textAlign:'center',fontSize:12,padding:'8px 0'}}>{day}</strong>)}
          {model.calendar.cells.map((day,index)=>day?
            <button key={day} type="button"
              aria-label={day+': '+(model.byDate.get(day)?.length||0)+' contenidos'}
              aria-pressed={day===selectedDate} disabled={saving}
              onClick={()=>{setSelectedDate(day);setDraft(null);setError('')}}
              style={{minHeight:76,padding:7,textAlign:'left',display:'grid',
                alignContent:'space-between',gap:7,borderRadius:10,
                border:day===selectedDate?'2px solid #987242':cardBorder,
                background:day===selectedDate?'rgba(148,103,56,.12)':'transparent',
                color:'inherit',cursor:'pointer'}}>
              <strong style={{fontSize:15}}>{Number(day.slice(-2))}</strong>
              {(model.byDate.get(day)||[]).length>0&&<small
                style={{background:'rgba(132,99,52,.19)',padding:'3px 5px',
                  borderRadius:6,textAlign:'center'}}>
                {(model.byDate.get(day)||[]).length} pieza(s)
              </small>}
            </button>:
            <div key={'empty-'+index} aria-hidden="true"/>)}
        </div>
      </div>
      <div className="dashboard-panel">
        <div style={{display:'flex',justifyContent:'space-between',gap:10,
          alignItems:'end',flexWrap:'wrap'}}>
          <div>
            <h3 style={{marginBottom:4}}>Contenido del día {selectedDate}</h3>
            <p>{visible.length} contenidos con este filtro.</p>
          </div>
          <Field label="Filtrar por estado">
            <select style={inputStyle} value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="all">Todos los estados</option>{dropdown(EDITORIAL_STATUSES)}
            </select>
          </Field>
          <button type="button" className="primary-button" disabled={saving}
            onClick={create}>+ Contenido para este día</button>
        </div>
        {visible.length===0?<p>No hay contenido en este día con el filtro seleccionado.</p>:
          <div style={{display:'grid',gap:12}}>
            {visible.map(item=><ItemCard key={item.id} item={item}
              onEdit={edit} onAction={action} busy={saving}
              publicationUrl={publicationLinks[item.id]||''}
              onPublicationUrl={value=>setPublicationLinks(old=>({...old,[item.id]:value}))}/>)}
          </div>}
      </div>
    </>}
    {draft&&<div className="dashboard-panel"
      style={{border:'2px solid rgba(147,107,60,.55)'}}>
      <h3>{draft.id?'Editar contenido':'Crear contenido editorial'}</h3>
      <p>Guarda el borrador antes de enviar a revisión. La checklist debe estar
        completa y el texto debe tener al menos 20 caracteres para solicitar la aprobación.
        Evita datos personales de clientes en cualquier campo.</p>
      <form onSubmit={save} style={{display:'grid',gap:15}}>
        <div style={groupStyle}>
          <Field label="Título interno">
            <input style={inputStyle} value={draft.title} required maxLength={120}
              disabled={saving} onChange={e=>change('title',e.target.value)}
              placeholder="Ej. Reel Carbonara · jueves"/>
          </Field>
          <Field label="Plataforma / espacio">
            <select style={inputStyle} value={draft.platform} disabled={saving}
              onChange={e=>change('platform',e.target.value)}>
              {dropdown(EDITORIAL_PLATFORMS)}
            </select>
          </Field>
          <Field label="Formato">
            <select style={inputStyle} value={draft.content_kind} disabled={saving}
              onChange={e=>change('content_kind',e.target.value)}>
              {dropdown(EDITORIAL_FORMATS)}
            </select>
          </Field>
          <Field label="Equipo responsable">
            <select style={inputStyle} value={draft.owner_role} disabled={saving}
              onChange={e=>change('owner_role',e.target.value)}>
              {dropdown(EDITORIAL_ROLES)}
            </select>
          </Field>
          <Field label="Idioma">
            <select style={inputStyle} value={draft.language} disabled={saving}
              onChange={e=>change('language',e.target.value)}>
              {dropdown(EDITORIAL_LANGUAGES)}
            </select>
          </Field>
          <Field label="Fecha prevista">
            <input type="date" required style={inputStyle}
              disabled={saving} value={draft.scheduled_date}
              onChange={e=>change('scheduled_date',e.target.value)}/>
          </Field>
          <Field label="Hora prevista (Canarias; opcional)">
            <input type="time" style={inputStyle} disabled={saving}
              value={draft.scheduled_time||''}
              onChange={e=>change('scheduled_time',e.target.value)}/>
          </Field>
          <Field label="Campaña vinculada (opcional)">
            <select style={inputStyle} value={draft.campaign_id||''}
              disabled={saving||Boolean(campaignWarning)}
              onChange={e=>change('campaign_id',e.target.value)}>
              <option value="">Sin campaña</option>
              {candidates.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}
              {draft.campaign_id&&!candidates.some(c=>c.id===draft.campaign_id)&&
                <option value={draft.campaign_id}>Campaña previa (no disponible en este filtro)</option>}
            </select>
          </Field>
        </div>
        <Field label="Copy / texto para publicación">
          <textarea rows={5} maxLength={5000} style={inputStyle}
            value={draft.copy_text} disabled={saving}
            placeholder="Texto en español, historia del plato y llamada a reservar…"
            onChange={e=>change('copy_text',e.target.value)}/>
        </Field>
        <Field label="Brief visual y preparación">
          <textarea rows={3} maxLength={1000} style={inputStyle} disabled={saving}
            value={draft.creative_brief}
            placeholder="Fotos a grabar, plano, formato 1080 × 1350, props necesarios…"
            onChange={e=>change('creative_brief',e.target.value)}/>
        </Field>
        <div style={groupStyle}>
          <Field label="CTA (opcional)">
            <input style={inputStyle} maxLength={160} disabled={saving}
              value={draft.cta} onChange={e=>change('cta',e.target.value)}
              placeholder="Reserva tu mesa · Ven a probarlo"/>
          </Field>
          <Field label="Hashtags (para Instagram: orientativamente 5)">
            <input style={inputStyle} maxLength={500} disabled={saving}
              value={draft.hashtags} onChange={e=>change('hashtags',e.target.value)}
              placeholder="#NonnaAngela #Tenerife ..."/>
          </Field>
        </div>
        <fieldset style={{border:cardBorder,borderRadius:12,padding:13}}>
          <legend>Checklist editorial (requerida antes de revisión)</legend>
          {EDITORIAL_CHECKS.map(check=>
            <label key={check.key} style={{display:'flex',gap:9,
              alignItems:'start',margin:'9px 0'}}>
              <input type="checkbox" disabled={saving}
                checked={draft[check.key]===true}
                onChange={e=>change(check.key,e.target.checked)}/>
              {check.label}
            </label>)}
        </fieldset>
        {draft.id&&<p><strong>Versión editada:</strong> {draft.expected_revision}.
          Si otra sesión ha modificado el contenido, Supabase rechazará el guardado.</p>}
        <div style={{display:'flex',gap:11,flexWrap:'wrap'}}>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving?'Guardando…':'Guardar como borrador'}
          </button>
          <button type="button" className="ghost-button" disabled={saving}
            onClick={()=>setDraft(null)}>Cancelar edición</button>
        </div>
        <small>El guardado no publica, no crea Stories y no envía mensajes a clientes.
          El estado «publicado» debe confirmarse después de hacerlo fuera del sitio.</small>
      </form>
    </div>}
  </div>
}
