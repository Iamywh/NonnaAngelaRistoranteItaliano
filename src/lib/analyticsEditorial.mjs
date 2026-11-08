// Phase 14B — read-only client checks for a private, manually operated
// editorial calendar. Server RPC enforces the same checklist and permissions.
export const EDITORIAL_PLATFORMS=Object.freeze({
  instagram:'Instagram',google_business:'Google Business',
  in_restaurant:'En el restaurante',other:'Otro canal'
})
export const EDITORIAL_FORMATS=Object.freeze({
  post:'Post',reel:'Reel',story:'Story',carousel:'Carrusel',
  event:'Evento',promotion:'Promoción'
})
export const EDITORIAL_ROLES=Object.freeze({
  marketing:'Marketing',sala:'Sala',cocina:'Cocina',gerencia:'Gerencia'
})
export const EDITORIAL_LANGUAGES=Object.freeze({
  es:'Español',it:'Italiano',en:'Inglés',fr:'Francés',de:'Alemán'
})
export const EDITORIAL_STATUSES=Object.freeze({
  draft:'Borrador',in_review:'En revisión',approved:'Aprobado',
  published:'Publicado / ejecutado',cancelled:'Cancelado'
})
export const EDITORIAL_ACTIONS=Object.freeze({
  submit:'Enviar a revisión',approve:'Aprobar',
  publish:'Marcar como publicado / ejecutado',
  return_draft:'Devolver a borrador',cancel:'Cancelar contenido'
})
export const EDITORIAL_CHECKS=Object.freeze([
  {key:'asset_ready',label:'Fotos, vídeos o material preparados'},
  {key:'copy_ready',label:'Texto y llamadas a la acción revisados'},
  {key:'facts_checked',label:'Precios, horarios, alérgenos y afirmaciones comprobados'},
  {key:'rights_checked',label:'Derechos de imagen y música comprobados'}
])
const ISO=/^([0-9]{4})-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/
const MONTH=/^(20[0-9]{2})-(0[1-9]|1[0-2])$/
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIME=/^([01][0-9]|2[0-3]):[0-5][0-9]$/
const trim=v=>String(v??'').trim()
const isOption=(object,value)=>Object.hasOwn(object,value)
export function validEditorialDate(input){
  const match=ISO.exec(input??'')
  if(!match)return false
  const y=Number(match[1]),m=Number(match[2]),d=Number(match[3])
  const dt=new Date(Date.UTC(y,m-1,d))
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()+1===m&&dt.getUTCDate()===d
}
export function editorialMonth(month){
  if(!MONTH.test(month||''))throw Error('Mes inválido: AAAA-MM')
  const [year,mm]=month.split('-').map(Number)
  const length=new Date(Date.UTC(year,mm,0)).getUTCDate()
  const offset=(new Date(Date.UTC(year,mm-1,1)).getUTCDay()+6)%7
  return {
    month,start:month+'-01',end:month+'-'+String(length).padStart(2,'0'),
    length,offset,
    cells:[...Array(offset).fill(null),
      ...Array.from({length},(_,i)=>month+'-'+String(i+1).padStart(2,'0'))]
  }
}
export function changeEditorialMonth(month,offset){
  if(!Number.isInteger(offset)||Math.abs(offset)>12)throw Error('Mes fuera de rango')
  const {start}=editorialMonth(month)
  const [y,m]=start.split('-').map(Number)
  const date=new Date(Date.UTC(y,m-1+offset,1)).toISOString().slice(0,7)
  if(!MONTH.test(date))throw Error('Mes fuera de rango')
  return date
}
export function emptyEditorialItem(date){
  return {
    id:null,expected_revision:null,campaign_id:'',
    title:'',platform:'instagram',content_kind:'reel',
    owner_role:'marketing',language:'es',
    scheduled_date:date,scheduled_time:'',
    copy_text:'',creative_brief:'',cta:'',hashtags:'',
    asset_ready:false,copy_ready:false,facts_checked:false,rights_checked:false
  }
}
export function editorialItemForm(row){
  const form=emptyEditorialItem(row.scheduled_date)
  for(const key of Object.keys(form)){
    if(key==='expected_revision')form[key]=row.revision
    else if(key==='scheduled_time')form[key]=row.scheduled_time?.slice(0,5)||''
    else if(key==='campaign_id')form[key]=row.campaign_id||''
    else if(key in row)form[key]=row[key]
  }
  return form
}
export function canReviewEditorial(item){
  return trim(item?.copy_text).length>=20 &&
    EDITORIAL_CHECKS.every(x=>item?.[x.key]===true)
}
export function editorialAllowedActions(item){
  if(!item)return []
  switch(item.status){
    case 'draft':return canReviewEditorial(item)?['submit','cancel']:['cancel']
    case 'in_review':return ['approve','return_draft','cancel']
    case 'approved':return ['publish','return_draft','cancel']
    default:return []
  }
}
export function validateEditorialPayload(form){
  if(!form||typeof form!=='object')throw Error('Contenido incompleto')
  const title=trim(form.title),copy=String(form.copy_text??''),
    brief=String(form.creative_brief??''),cta=trim(form.cta),tags=trim(form.hashtags)
  if(title.length<3||title.length>120)throw Error('Título: entre 3 y 120 caracteres')
  if(!isOption(EDITORIAL_PLATFORMS,form.platform))throw Error('Canal no válido')
  if(!isOption(EDITORIAL_FORMATS,form.content_kind))throw Error('Formato no válido')
  if(!isOption(EDITORIAL_ROLES,form.owner_role))throw Error('Responsable no válido')
  if(!isOption(EDITORIAL_LANGUAGES,form.language))throw Error('Idioma no válido')
  if(!validEditorialDate(form.scheduled_date))throw Error('Fecha prevista no válida')
  const time=trim(form.scheduled_time)
  if(time&&!TIME.test(time))throw Error('Hora prevista: utiliza HH:MM (Canarias)')
  if(copy.length>5000||brief.length>1000||cta.length>160||tags.length>500)
    throw Error('Texto, briefing, CTA o hashtags supera el límite permitido')
  if(EDITORIAL_CHECKS.some(x=>typeof form[x.key]!=='boolean'))
    throw Error('Checklist incompleta')
  const campaign=trim(form.campaign_id)
  if(campaign&&!UUID.test(campaign))throw Error('Campaña enlazada no válida')
  const id=form.id||null
  if(id&&(!UUID.test(id)||!Number.isSafeInteger(Number(form.expected_revision))||
    Number(form.expected_revision)<1))
    throw Error('ID o revisión incorrectos: actualiza el calendario')
  return {
    ...(id?{id,expected_revision:Number(form.expected_revision)}:{}),
    campaign_id:campaign||null,title,platform:form.platform,
    content_kind:form.content_kind,owner_role:form.owner_role,
    language:form.language,scheduled_date:form.scheduled_date,
    scheduled_time:time||null,copy_text:copy,creative_brief:brief,
    cta,hashtags:tags,...Object.fromEntries(EDITORIAL_CHECKS.map(x=>[x.key,form[x.key]]))
  }
}
export function analyzeEditorialItems(rows,month) {
  const calendar=editorialMonth(month)
  if(!Array.isArray(rows)||rows.length>250)
    throw Error('No se puede mostrar un calendario incompleto')
  const seen=new Set(),byDate=new Map()
  const counts=Object.fromEntries(Object.keys(EDITORIAL_STATUSES).map(k=>[k,0]))
  const all=[]
  for(const r of rows){
    if(!r||!UUID.test(r.id)||seen.has(r.id)||
      !isOption(EDITORIAL_STATUSES,r.status)||
      !isOption(EDITORIAL_FORMATS,r.content_kind)||
      !isOption(EDITORIAL_PLATFORMS,r.platform)||
      !isOption(EDITORIAL_ROLES,r.owner_role)||
      !isOption(EDITORIAL_LANGUAGES,r.language)||
      !validEditorialDate(r.scheduled_date)||r.scheduled_date<calendar.start||
      r.scheduled_date>calendar.end||
      !Number.isSafeInteger(r.revision)||r.revision<1)
      throw Error('Contenido duplicado, fuera de fecha o inválido')
    seen.add(r.id)
    if(EDITORIAL_CHECKS.some(x=>typeof r[x.key]!=='boolean'))
      throw Error('Checklist de contenido incorrecta')
    if(r.scheduled_time!==null&&!/^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(r.scheduled_time))
      throw Error('Hora de contenido incorrecta')
    if(['approved','published'].includes(r.status)&&!r.approved_at)
      throw Error('Aprobación de contenido sin evidencia')
    if(r.status==='published'&&!r.published_at)
      throw Error('Publicación sin fecha de confirmación')
    counts[r.status]++
    const normalized={...r,scheduled_time:r.scheduled_time?.slice(0,5)||''}
    if(!byDate.has(r.scheduled_date))byDate.set(r.scheduled_date,[])
    byDate.get(r.scheduled_date).push(normalized)
    all.push(normalized)
  }
  for(const daily of byDate.values())daily.sort((a,b)=>
    a.scheduled_time.localeCompare(b.scheduled_time)||a.title.localeCompare(b.title))
  return {calendar,byDate,items:all,counts,total:all.length}
}
