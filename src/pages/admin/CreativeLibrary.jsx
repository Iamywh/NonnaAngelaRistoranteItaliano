import React,{useEffect,useMemo,useState} from 'react'
import {supabase} from '../../lib/supabaseClient.js'
import {
  CREATIVE_BUCKET,CREATIVE_MAX_BYTES,CREATIVE_MIME_TYPES,
  CREATIVE_CATEGORIES,CREATIVE_RIGHTS,CREATIVE_STATUSES,
  creativeFileValidation,creativeStoragePath,newCreativeAsset,
  assetForm,validateCreativeForm,validateCreativeList,creativeCanLink
} from '../../lib/analyticsCreative.mjs'
import {editorialMonth} from '../../lib/analyticsEditorial.mjs'
import '../../styles/creative-library.css'

const canaryMonth=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit'
}).format(new Date()).slice(0,7)
const listOptions=items=>Object.entries(items).map(([key,label])=>
  <option key={key} value={key}>{label}</option>)
const humanSize=value=>Number(value)>=1048576?(Number(value)/1048576).toFixed(1)+' MiB':
  Math.round(Number(value)/1024)+' KiB'
const paginated=(arr,page)=>arr.slice(page*12,(page+1)*12)
const S={display:'grid',gap:7}
const clearMessage='Los derechos deben comprobarse antes de vincular un archivo a una publicación. No incluyas imágenes de clientes sin permiso.'

function EditFields({data,onChange,disabled}){
  const change=(key,value)=>onChange(old=>({...old,[key]:value}))
  return <div className="creative-form-grid">
    <label style={S}>Título del archivo
      <input type="text" required minLength="3" maxLength="120" value={data.title}
        disabled={disabled} onChange={e=>change('title',e.target.value)}/>
    </label>
    <label style={S}>Categoría
      <select value={data.category} disabled={disabled}
        onChange={e=>change('category',e.target.value)}>
        {listOptions(CREATIVE_CATEGORIES)}
      </select>
    </label>
    <label style={S}>Estado de derechos
      <select value={data.rights_status} disabled={disabled}
        onChange={e=>change('rights_status',e.target.value)}>
        {listOptions(CREATIVE_RIGHTS)}
      </select>
    </label>
    <label style={S}>Crédito del creador (si aplica)
      <input type="text" maxLength="160" value={data.credit||''}
        disabled={disabled} onChange={e=>change('credit',e.target.value)}
        placeholder="Fotógrafo / fuente del material"/>
    </label>
    <label style={S}>Etiquetas (máximo 8, separadas por comas)
      <input type="text" value={data.tags||''} disabled={disabled}
        onChange={e=>change('tags',e.target.value)}
        placeholder="carbonara, pasta, reel, verano"/>
    </label>
    <label style={S}>Disponibilidad
      <select value={data.status} disabled={disabled}
        onChange={e=>change('status',e.target.value)}>
        {listOptions(CREATIVE_STATUSES)}
      </select>
    </label>
    <label style={S}>Justificación de derechos (necesaria para marcar «autorizado»)
      <textarea rows={2} maxLength="500" value={data.rights_note||''}
        disabled={disabled} onChange={e=>change('rights_note',e.target.value)}
        placeholder="Ej. Foto propia, realizada por el equipo el 08/11/2026; uso comercial autorizado"/>
    </label>
    <label style={S}>Observaciones / idea de uso
      <textarea rows={2} maxLength="750" value={data.notes||''}
        disabled={disabled} onChange={e=>change('notes',e.target.value)}
        placeholder="Plano sugerido, plato, formato, restricciones de uso…"/>
    </label>
  </div>
}

function Preview({asset,url,error}) {
  if(error)return <p className="creative-preview-note">No se pudo cargar la vista privada. Comprueba los permisos o actualiza.</p>
  if(!url)return <p className="creative-preview-note">Generando vista privada…</p>
  if(asset.mime_type.startsWith('image/')){
    return <img loading="lazy" src={url} alt={asset.title}
      className="creative-preview" referrerPolicy="no-referrer"/>
  }
  return <video className="creative-preview" controls preload="none"
    src={url} aria-label={'Vídeo: '+asset.title}/>
}

export default function CreativeLibrary({onNavigate}) {
  const [records,setRecords]=useState([])
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [reload,setReload]=useState(0)
  const [showArchived,setShowArchived]=useState(false)
  const [category,setCategory]=useState('all')
  const [query,setQuery]=useState('')
  const [page,setPage]=useState(0)
  const [file,setFile]=useState(null)
  const [fileKey,setFileKey]=useState(0)
  const [newDraft,setNewDraft]=useState(newCreativeAsset)
  const [editing,setEditing]=useState(null)
  const [month,setMonth]=useState(canaryMonth)
  const [editorialItems,setEditorialItems]=useState([])
  const [links,setLinks]=useState([])
  const [linkError,setLinkError]=useState('')
  const [selectedEditorial,setSelectedEditorial]=useState({})
  const [urls,setUrls]=useState({})
  const [previewErrors,setPreviewErrors]=useState({})

  useEffect(()=>{
    let active=true
    const load=async()=>{
      setLoading(true);setError('');setRecords([])
      const {data,error:rpcError}=await supabase.rpc('analytics_creative_list',{
        p_include_archived:showArchived
      })
      if(!active)return
      if(rpcError){setError('No se pudo leer la biblioteca: '+rpcError.message)}
      else {
        try{setRecords(validateCreativeList(data))}
        catch(e){setError(e.message)}
      }
      setLoading(false)
    }
    load()
    return()=>{active=false}
  },[showArchived,reload])

  useEffect(()=>{
    let active=true
    const load=async()=>{
      setLinkError('');setEditorialItems([]);setLinks([])
      let range
      try{range=editorialMonth(month)}
      catch{setLinkError('Selecciona un mes editorial válido');return}
      const [editorial,linked]=await Promise.all([
        supabase.rpc('analytics_editorial_list',{
          p_start_date:range.start,p_end_date:range.end
        }),
        supabase.rpc('analytics_creative_month_links',{
          p_start_date:range.start,p_end_date:range.end
        })
      ])
      if(!active)return
      if(editorial.error||linked.error||!editorial.data?.ok||!linked.data?.ok||
        !Array.isArray(editorial.data.items)||!Array.isArray(linked.data.links)||
        linked.data.count!==linked.data.links.length){
        setLinkError('No se pudieron consultar las publicaciones asociadas: '+
          (editorial.error?.message||linked.error?.message||'respuesta incompleta'))
        return
      }
      setEditorialItems(editorial.data.items)
      setLinks(linked.data.links)
    }
    load()
    return()=>{active=false}
  },[month,reload])

  const filtered=useMemo(()=>{
    const needle=query.toLowerCase().trim()
    return records.filter(a=>(category==='all'||a.category===category)&&
      (!needle||[a.title,a.original_filename,a.notes,a.credit,
        ...(a.tags||[])].join(' ').toLowerCase().includes(needle)))
  },[records,category,query])
  const maxPage=Math.max(0,Math.ceil(filtered.length/12)-1)
  const currentPage=Math.min(page,maxPage)
  const visible=useMemo(()=>paginated(filtered,currentPage),[filtered,currentPage])
  const mediaKey=visible.map(x=>x.id+'-'+x.revision).join('|')
  useEffect(()=>{
    let active=true
    setUrls({});setPreviewErrors({})
    const get=async()=>{
      const results=await Promise.all(visible.map(async asset=>{
        try {
          const {data,error:e}=await supabase.storage.from(CREATIVE_BUCKET)
            .createSignedUrl(asset.storage_path,600)
          return {id:asset.id,url:data?.signedUrl,error:e}
        }catch(e){return {id:asset.id,error:e}}
      }))
      if(!active)return
      const next={},failed={}
      for(const result of results){
        if(result.url)next[result.id]=result.url
        else failed[result.id]=true
      }
      setUrls(next);setPreviewErrors(failed)
    }
    get()
    return()=>{active=false}
  },[mediaKey,reload,showArchived])

  const upload=async event=>{
    event.preventDefault()
    if(busy||!file)return
    let meta
    try{
      creativeFileValidation(file)
      meta=validateCreativeForm(newDraft)
      if(file.name.length>180)throw Error('Nombre de archivo demasiado largo (máximo 180 caracteres)')
    }catch(e){setError(e.message);return}
    if(!window.confirm(
      '¿Guardar el archivo en la biblioteca PRIVADA? No se publicará en Instagram ni en la web pública.'
    ))return
    setBusy(true);setError('');setNotice('')
    let path
    try {
      path=creativeStoragePath(file,crypto.randomUUID())
      const {error:uploadError}=await supabase.storage.from(CREATIVE_BUCKET)
        .upload(path,file,{upsert:false,contentType:file.type,cacheControl:'600'})
      if(uploadError)throw Error('Error al subir a Storage: '+uploadError.message)
      const {data,error:saveError}=await supabase.rpc('analytics_creative_save',{
        p_asset:{...meta,storage_path:path,original_filename:file.name}
      })
      if(saveError||!data?.ok||!data.asset?.id){
        const cleanup=await supabase.storage.from(CREATIVE_BUCKET).remove([path])
        throw Error('No se pudo registrar el archivo: '+
          (saveError?.message||'respuesta incompleta')+
          (cleanup.error?'. OJO: revisa en Supabase Storage el archivo huérfano '+path:
            '. Se ha intentado limpiar la subida.'))
      }
      setNotice('Archivo guardado en el bucket privado. Sigue sin publicarse en ningún canal.')
      setFile(null);setFileKey(n=>n+1);setNewDraft(newCreativeAsset())
      setReload(n=>n+1);setPage(0)
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }

  const saveEdit=async event=>{
    event.preventDefault()
    if(!editing||busy)return
    let input
    try{
      input=validateCreativeForm(editing)
    }catch(e){setError(e.message);return}
    if(!window.confirm(
      '¿Guardar metadatos? Si retiras los derechos o archivas un recurso vinculado a contenidos aprobados, estos volverán a borrador.'
    ))return
    setBusy(true);setError('');setNotice('')
    const {data,error:rpcError}=await supabase.rpc('analytics_creative_save',{
      p_asset:{...input,id:editing.id,expected_revision:editing.expected_revision}
    })
    setBusy(false)
    if(rpcError||!data?.ok||!data.asset?.id){
      setError('No se guardaron los cambios: '+(rpcError?.message||'respuesta incompleta')+
        '. Actualiza la biblioteca si el recurso cambió en otra sesión.')
      return
    }
    setEditing(null);setNotice('Metadatos guardados con auditoría y revisión de permisos de uso.')
    setReload(n=>n+1)
  }

  const changeLink=async(asset,unlink=false,editorialId=null)=>{
    if(busy)return
    const selected=editorialId||selectedEditorial[asset.id]
    if(!selected){setError('Selecciona primero un contenido editorial');return}
    if(!unlink&&!creativeCanLink(asset)){
      setError('Solo se pueden vincular activos con derechos autorizados');return
    }
    const item=editorialItems.find(x=>x.id===selected)
    if(!item){setError('Contenido no presente en el calendario del mes elegido');return}
    if(!window.confirm(
      (unlink?'¿Quitar este recurso del contenido «':'¿Vincular el recurso al contenido «')+
      item.title+'»? Si está en revisión o aprobado, volverá a borrador.'
    ))return
    setBusy(true);setError('');setNotice('')
    const {data,error:rpcError}=await supabase.rpc('analytics_creative_link',{
      p_asset_id:asset.id,p_editorial_id:selected,p_unlink:unlink
    })
    setBusy(false)
    if(rpcError||!data?.ok){
      setError('No se pudo modificar el vínculo: '+(rpcError?.message||'respuesta incompleta'))
      return
    }
    setNotice(data.changed?'Vínculo actualizado con auditoría. Revisa de nuevo el contenido.':
      'El recurso ya tenía ese estado de vínculo.')
    setReload(n=>n+1)
  }

  const todayMonth=canaryMonth()
  return <div className="creative-library">
    <div className="dashboard-panel">
      <h3>Creative Library · Fase 14C</h3>
      <p>Banco privado de fotos y vídeos para Nonna Angela: platos, vinos, cócteles,
        restaurante y eventos. Permite buscar recursos y asociarlos al calendario editorial,
        sin publicar ni enviar mensajes automáticamente.</p>
      <p><strong>Privacidad:</strong> los archivos se almacenan en un bucket privado.
        Las vistas previas usan enlaces temporales de 10 minutos; no son URLs públicas
        para Instagram. Solo el equipo owner/admin de Analytics puede consultarlos.</p>
      <p>{clearMessage}</p>
      {error&&<p role="alert" className="manager-error">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {loading&&<p role="status">Abriendo biblioteca privada…</p>}
    </div>
    <div className="dashboard-panel">
      <h3>1 · Subir fotos o vídeos</h3>
      <p>Formatos: JPG, PNG, WebP, MP4 y WebM. Tamaño máximo: 25 MiB.
        Convierte fotos HEIC o vídeos MOV antes de subirlos. Evita almacenar
        fotos de clientes sin autorización.</p>
      <form onSubmit={upload} style={{display:'grid',gap:13}}>
        <label style={S}>Archivo a subir
          <input key={fileKey} type="file" required disabled={busy} accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            onChange={e=>setFile(e.target.files?.[0]||null)}/>
        </label>
        {file&&<small>{file.name} · {humanSize(file.size)} · {file.type||'tipo desconocido'}</small>}
        <EditFields data={newDraft} onChange={setNewDraft} disabled={busy}/>
        <button type="submit" className="primary-button"
          disabled={busy||!file}>{busy?'Guardando…':'Subir a biblioteca privada'}</button>
        <small>Estado inicial recomendado: derechos «no comprobados». El equipo debe
          verificar licencias, personas visibles y música antes de autorizarlos.</small>
      </form>
    </div>
    <div className="dashboard-panel">
      <h3>2 · Explorar material</h3>
      <div className="creative-filter">
        <label style={S}>Buscar por título, etiqueta o notas
          <input type="search" value={query} placeholder="Ej. carbonara, Barolo, terraza…"
            onChange={e=>{setQuery(e.target.value);setPage(0)}}/>
        </label>
        <label style={S}>Categoría
          <select value={category} onChange={e=>{setCategory(e.target.value);setPage(0)}}>
            <option value="all">Todas</option>{listOptions(CREATIVE_CATEGORIES)}
          </select>
        </label>
        <label className="creative-checkbox">
          <input type="checkbox" checked={showArchived}
            onChange={e=>{setShowArchived(e.target.checked);setPage(0)}}/>
          Incluir archivados
        </label>
        <button type="button" className="ghost-button" disabled={loading||busy}
          onClick={()=>setReload(n=>n+1)}>Actualizar</button>
      </div>
      <p>{filtered.length} archivos en el filtro (máximo 300 en la consulta).
        {filtered.length>12?' Se muestran 12 por página.':''}</p>
      <div className="creative-filter">
        <label style={S}>Mes de contenidos a vincular
          <input type="month" value={month} min="2000-01" max="2099-12"
            onChange={e=>{setMonth(e.target.value);setSelectedEditorial({})}}/>
        </label>
        <button type="button" className="ghost-button"
          onClick={()=>onNavigate?.('editorial')}>Abrir Calendario editorial</button>
      </div>
      {linkError&&<p role="alert" className="manager-error">{linkError}</p>}
      {!linkError&&<small>
        {editorialItems.length} contenidos programados en {month||todayMonth}.
        Para enlazar usa solo piezas no publicadas ni canceladas; el servidor
        confirma que el recurso tiene derechos autorizados.
      </small>}
      {!loading&&filtered.length===0&&<p>Aún no hay recursos con este filtro.</p>}
      <div className="creative-gallery">
        {visible.map(asset=>{
          const assetLinks=links.filter(l=>l.asset_id===asset.id)
          const compatible=editorialItems.filter(x=>!['published','cancelled'].includes(x.status))
          return <article key={asset.id} className="creative-card">
            <div className="creative-frame">
              <Preview asset={asset} url={urls[asset.id]} error={previewErrors[asset.id]}/>
            </div>
            <div className="creative-card-body">
              <h4>{asset.title}</h4>
              <p><small>{CREATIVE_CATEGORIES[asset.category]} · {humanSize(asset.file_bytes)} ·
                {asset.mime_type.startsWith('image/')?'Foto':'Vídeo'} · {CREATIVE_STATUSES[asset.status]}</small></p>
              <p className={creativeCanLink(asset)?'creative-status-ok':'creative-status-warning'}>
                {CREATIVE_RIGHTS[asset.rights_status]}
              </p>
              {asset.credit&&<p><small>Créditos: {asset.credit}</small></p>}
              {asset.tags?.length>0&&<p><small>Etiquetas: {asset.tags.join(', ')}</small></p>}
              {asset.rights_note&&<p><small>Derechos: {asset.rights_note}</small></p>}
              {asset.notes&&<p><small>Notas: {asset.notes}</small></p>}
              <p><small>Versión {asset.revision} · {asset.linked_count||0} asociaciones editoriales</small></p>
              <button type="button" className="ghost-button" disabled={busy}
                onClick={()=>{setEditing(assetForm(asset));setError('')}}>
                Editar ficha / derechos
              </button>
              {creativeCanLink(asset)&&!linkError&&compatible.length>0&&<div className="creative-link-box">
                <label style={S}>Asociar al calendario de {month}
                  <select value={selectedEditorial[asset.id]||''} disabled={busy}
                    onChange={e=>setSelectedEditorial(old=>({...old,[asset.id]:e.target.value}))}>
                    <option value="">Elegir publicación</option>
                    {compatible.map(x=><option key={x.id} value={x.id}>
                      {x.scheduled_date} · {x.title} ({x.status})
                    </option>)}
                  </select>
                </label>
                <button type="button" className="ghost-button" disabled={busy||!selectedEditorial[asset.id]}
                  onClick={()=>changeLink(asset)}>Vincular recurso</button>
              </div>}
              {assetLinks.length>0&&<div className="creative-links">
                <strong>Usado en el mes seleccionado</strong>
                {assetLinks.map(link=>{
                  const item=editorialItems.find(x=>x.id===link.editorial_id)
                  return <div key={link.editorial_id} className="creative-link-row">
                    <small>{item?.scheduled_date} · {item?.title||'Contenido editorial'}</small>
                    {!['published','cancelled'].includes(item?.status)&&
                      <button type="button" className="ghost-button" disabled={busy}
                        onClick={()=>changeLink(asset,true,link.editorial_id)}>
                        Desvincular
                      </button>}
                  </div>
                })}
              </div>}
            </div>
          </article>
        })}
      </div>
      {filtered.length>12&&<div className="creative-pagination">
        <button type="button" className="ghost-button" disabled={currentPage===0}
          onClick={()=>setPage(p=>Math.max(0,p-1))}>Anterior</button>
        <span>Página {currentPage+1} / {maxPage+1}</span>
        <button type="button" className="ghost-button" disabled={currentPage>=maxPage}
          onClick={()=>setPage(p=>p+1)}>Siguiente</button>
      </div>}
    </div>
    {editing&&<div className="dashboard-panel creative-edit-panel">
      <h3>3 · Editar ficha de «{editing.title}»</h3>
      <p>Archivar oculta la foto/vídeo de la biblioteca habitual, pero **no borra**
        el archivo de Storage. Quitar derechos o archivar un recurso anulará
        las aprobaciones de contenido pendiente asociado.</p>
      <form onSubmit={saveEdit} style={{display:'grid',gap:14}}>
        <EditFields data={editing} onChange={setEditing} disabled={busy}/>
        <div className="creative-actions">
          <button type="submit" className="primary-button" disabled={busy}>Guardar cambios con auditoría</button>
          <button type="button" className="ghost-button" disabled={busy}
            onClick={()=>setEditing(null)}>Cancelar edición</button>
        </div>
      </form>
    </div>}
  </div>
}
