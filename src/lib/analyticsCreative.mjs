// Phase 14C: private Creative Library metadata and media checks.
// Upload limits are duplicated in the private Supabase bucket policies.
export const CREATIVE_BUCKET='nonna-creative-library'
export const CREATIVE_MAX_BYTES=26214400
export const CREATIVE_MIME_TYPES=Object.freeze({
  'image/jpeg':{extension:'jpg',kind:'image'},
  'image/png':{extension:'png',kind:'image'},
  'image/webp':{extension:'webp',kind:'image'},
  'video/mp4':{extension:'mp4',kind:'video'},
  'video/webm':{extension:'webm',kind:'video'}
})
export const CREATIVE_CATEGORIES=Object.freeze({
  platos:'Platos y cocina',vinos:'Vinos',cocktails:'Cócteles',
  local:'El restaurante',eventos:'Eventos',equipo:'Equipo',otros:'Otros'
})
export const CREATIVE_RIGHTS=Object.freeze({
  unverified:'Derechos no comprobados',cleared:'Uso autorizado y comprobado',
  restricted:'Restringido — no usar'
})
export const CREATIVE_STATUSES=Object.freeze({
  active:'Disponible',archived:'Archivado'
})
export function creativeFileValidation(file){
  if(!file||typeof file.size!=='number'||typeof file.type!=='string')
    throw Error('Selecciona una foto o vídeo')
  if(!Object.hasOwn(CREATIVE_MIME_TYPES,file.type))
    throw Error('Formato no admitido. Convierte HEIC/MOV a JPG, PNG, WebP, MP4 o WebM.')
  if(file.size<1||file.size>CREATIVE_MAX_BYTES)
    throw Error('Archivo demasiado grande: máximo 25 MiB por pieza. Comprime el vídeo.')
  if(typeof file.name!=='string'||!file.name.trim())throw Error('Archivo sin nombre')
  return CREATIVE_MIME_TYPES[file.type]
}
export function newCreativeAsset(){
  return {
    title:'',category:'platos',rights_status:'unverified',
    rights_note:'',credit:'',notes:'',tags:'',status:'active'
  }
}
export function assetForm(record){
  return {
    id:record.id,expected_revision:record.revision,
    title:record.title,category:record.category,
    rights_status:record.rights_status,rights_note:record.rights_note||'',
    credit:record.credit||'',notes:record.notes||'',
    tags:(record.tags||[]).join(', '),status:record.status
  }
}
const normalizedTags=value=>String(value||'').split(',')
  .map(s=>s.trim().toLowerCase()).filter(Boolean)
export function validateCreativeForm(form){
  if(!form||typeof form!=='object')throw Error('Formulario de recurso incompleto')
  const title=String(form.title||'').trim(),
    rightsNote=String(form.rights_note||'').trim(),
    credit=String(form.credit||'').trim(),
    notes=String(form.notes||'').trim(),tags=normalizedTags(form.tags)
  if(title.length<3||title.length>120)throw Error('Título: de 3 a 120 caracteres')
  if(!Object.hasOwn(CREATIVE_CATEGORIES,form.category))
    throw Error('Categoría no reconocida')
  if(!Object.hasOwn(CREATIVE_RIGHTS,form.rights_status))
    throw Error('Estado de derechos no reconocido')
  if(!Object.hasOwn(CREATIVE_STATUSES,form.status))
    throw Error('Estado no reconocido')
  if(rightsNote.length>500||credit.length>160||notes.length>750)
    throw Error('Descripción, crédito o nota supera el límite')
  if(tags.length>8||tags.some(tag=>tag.length>32))
    throw Error('Máximo ocho etiquetas de 32 caracteres cada una')
  if(tags.length!==new Set(tags).size)
    throw Error('No repitas etiquetas')
  if(form.rights_status==='cleared'&&rightsNote.length<12)
    throw Error('Antes de autorizar el uso, explica la licencia o consentimiento (12 caracteres mínimo)')
  return {
    title,category:form.category,rights_status:form.rights_status,
    rights_note:rightsNote,credit,notes,tags,status:form.status
  }
}
export function creativeStoragePath(file,randomUUID){
  const {extension}=creativeFileValidation(file)
  if(typeof randomUUID!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(randomUUID))
    throw Error('Identificador aleatorio de archivo inválido')
  return 'media/'+randomUUID.toLowerCase()+'.'+extension
}
export function validateCreativeList(data){
  if(!data?.ok||!Array.isArray(data.assets)||data.assets.length>300||
    data.count!==data.assets.length)throw Error('Biblioteca incompleta')
  const seen=new Set()
  for(const asset of data.assets){
    if(!asset||typeof asset.id!=='string'||seen.has(asset.id)||
      !asset.storage_path?.startsWith('media/')||
      !Object.hasOwn(CREATIVE_CATEGORIES,asset.category)||
      !Object.hasOwn(CREATIVE_RIGHTS,asset.rights_status)||
      !Object.hasOwn(CREATIVE_STATUSES,asset.status)||
      !Object.hasOwn(CREATIVE_MIME_TYPES,asset.mime_type)||
      !Number.isInteger(asset.revision)||asset.revision<1||
      !Array.isArray(asset.tags)||
      !Number.isInteger(asset.linked_count)||asset.linked_count<0)
      throw Error('Archivo no válido o duplicado')
    seen.add(asset.id)
  }
  return data.assets
}
export function creativeCanLink(asset){
  return asset?.rights_status==='cleared'&&asset?.status==='active'
}
