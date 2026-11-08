// Phase 14A: validation and observational metrics, never automatic attribution.
export const CHANNELS=Object.freeze({
  instagram:'Instagram',google_ads:'Google Ads',google_business:'Google Business',
  organic:'Orgánico / contenido',offline:'Acción en sala',other:'Otro'
})
export const OBJECTIVES=Object.freeze({
  bookings:'Generar reservas',visibility:'Visibilidad de marca',
  weekday_demand:'Mejorar demanda de turnos',special_event:'Evento especial'
})
export const SERVICES=Object.freeze({lunch:'Almuerzo',dinner:'Cena',both:'Ambos turnos'})
export const STATUSES=Object.freeze({
  draft:'Borrador',planned:'Planificada',running:'En curso',
  finished:'Finalizada',cancelled:'Cancelada'
})
export const METRIC_KEYS=['impressions','clicks','inquiries','code_bookings']
const ISO=/^([0-9]{4})-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/
const money=/^(?:0|[1-9][0-9]{0,6})(?:[.,][0-9]{1,2})?$/
const integer=/^(?:0|[1-9][0-9]{0,8})$/
const read=v=>String(v??'').trim()
const daysUTC=date=>{
  const m=ISO.exec(read(date))
  if(!m)throw Error('Fecha ISO no válida (AAAA-MM-DD)')
  const y=Number(m[1]),month=Number(m[2]),day=Number(m[3])
  const dt=new Date(Date.UTC(y,month-1,day))
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==month-1||dt.getUTCDate()!==day)
    throw Error('Fecha calendario inexistente')
  return Math.round(dt.getTime()/86400000)
}
const moneyVal=(v,optional=false)=>{
  const text=read(v)
  if(optional&&text==='')return null
  if(!money.test(text))throw Error('Importe en euros inválido, sin miles y hasta 2 decimales')
  const num=Number(text.replace(',','.'))
  if(!Number.isFinite(num)||num>1000000)throw Error('Importe fuera de rango')
  return num
}
const intVal=(v,optional=false)=>{
  const text=read(v)
  if(optional&&text==='')return null
  if(!integer.test(text))throw Error('Recuento inválido; entero positivo o cero')
  const num=Number(text)
  if(!Number.isSafeInteger(num)||num>100000000)
    throw Error('Recuento demasiado grande')
  return num
}
export function emptyGrowthForm(){
  return {id:null,expected_revision:null,name:'',channel:'instagram',
    objective:'bookings',target_service:'dinner',status:'draft',
    start_date:'',end_date:'',planned_budget:'0',
    actual_spend:'',impressions:'',clicks:'',inquiries:'',code_bookings:'',
    tracking_code:'',notes:''}
}
export function growthFormFromRecord(r){
  const result=emptyGrowthForm()
  for(const key of Object.keys(result)) {
    if(key==='expected_revision')result[key]=r.revision
    else if(key==='id')result[key]=r.id
    else result[key]=r[key]==null?'':String(r[key])
  }
  return result
}
export function validateGrowthPayload(form){
  const name=read(form.name),notes=read(form.notes),
    code=read(form.tracking_code).toUpperCase()
  if(name.length<3||name.length>100)throw Error('Nombre entre 3 y 100 caracteres')
  if(notes.length>500)throw Error('Notas: máximo 500 caracteres')
  if(!Object.hasOwn(CHANNELS,form.channel))throw Error('Canal no reconocido')
  if(!Object.hasOwn(OBJECTIVES,form.objective))throw Error('Objetivo no reconocido')
  if(!Object.hasOwn(SERVICES,form.target_service))throw Error('Turno no reconocido')
  if(!Object.hasOwn(STATUSES,form.status))throw Error('Estado no reconocido')
  if(code&&!/^[A-Z0-9_-]{4,24}$/.test(code))
    throw Error('Código: 4–24 caracteres A-Z, 0-9, guion o guion bajo')
  const start=daysUTC(form.start_date),end=daysUTC(form.end_date)
  if(end<start||end-start>365)
    throw Error('El período debe durar entre 1 y 366 días')
  const budget=moneyVal(form.planned_budget)
  const spend=moneyVal(form.actual_spend,true)
  const impressions=intVal(form.impressions,true),
    clicks=intVal(form.clicks,true),
    inquiries=intVal(form.inquiries,true),
    codeBookings=intVal(form.code_bookings,true)
  if((codeBookings||0)>0&&!code)throw Error('No declares reservas con código sin un código de campaña')
  const id=form.id||null
  if(id&&(!/^[0-9a-f-]{36}$/i.test(id)||
    !Number.isInteger(Number(form.expected_revision))||
    Number(form.expected_revision)<1))
    throw Error('Revisión de campaña no válida; recarga antes de guardar')
  return {
    ...(id?{id,expected_revision:Number(form.expected_revision)}:{}),
    name,channel:form.channel,objective:form.objective,
    target_service:form.target_service,status:form.status,
    start_date:form.start_date,end_date:form.end_date,
    planned_budget:budget,actual_spend:spend,
    impressions,clicks,inquiries,code_bookings:codeBookings,
    tracking_code:code||null,notes
  }
}
const checkMoney=(v,k,nullable=false)=>{
  if(nullable&&v===null)return null
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1000000||
    Math.abs(v*100-Math.round(v*100))>0.00001)
    throw Error('Importe no válido: '+k)
  return v
}
const checkCount=(v,k)=>{
  if(v===null)return null
  if(!Number.isSafeInteger(v)||v<0||v>100000000)
    throw Error('Recuento no válido: '+k)
  return v
}
export function analyzeGrowthCampaigns(records){
  if(!Array.isArray(records)||records.length>200)
    throw Error('Respuesta incompleta o demasiado grande')
  const ids=new Set()
  let planned=0,spent=0,unknownSpend=0,campaignsWithSpend=0
  const channels=new Map()
  const cards=[]
  for(const row of records) {
    if(!row?.id||ids.has(row.id)||
      !Object.hasOwn(CHANNELS,row.channel)||!Object.hasOwn(OBJECTIVES,row.objective)||
      !Object.hasOwn(SERVICES,row.target_service)||!Object.hasOwn(STATUSES,row.status))
      throw Error('Campaña agregada duplicada o inválida')
    ids.add(row.id)
    const name=read(row.name)
    if(name.length<3||name.length>100)throw Error('Nombre inválido en respuesta')
    const d=daysUTC(row.start_date),e=daysUTC(row.end_date)
    if(e<d||e-d>365)throw Error('Fechas inválidas en respuesta')
    if(!Number.isInteger(row.revision)||row.revision<1)
      throw Error('Versión de campaña inválida')
    const budget=checkMoney(row.planned_budget,'presupuesto')
    const actual=checkMoney(row.actual_spend,'gasto real',true)
    const counts=Object.fromEntries(METRIC_KEYS.map(k=>[k,checkCount(row[k],k)]))
    planned+=budget
    if(actual===null)unknownSpend++
    else {spent+=actual;campaignsWithSpend++}
    const aggregate=channels.get(row.channel)||{channel:row.channel,campaigns:0,planned:0,spentKnown:0,unknownSpend:0}
    aggregate.campaigns++;aggregate.planned+=budget
    if(actual===null)aggregate.unknownSpend++
    else aggregate.spentKnown+=actual
    channels.set(row.channel,aggregate)
    const calcRate=(a,b,mult=1)=>a==null||b==null||b===0?null:
      Math.round((a/b)*mult*100)/100
    const derived={
      ...row,
      ctrPct:calcRate(counts.clicks,counts.impressions,100),
      costPerClick:calcRate(actual,counts.clicks),
      costPerReportedCodeBooking:calcRate(actual,counts.code_bookings),
      reportedBookingsWithoutCode:counts.code_bookings>0&&!row.tracking_code
    }
    cards.push(derived)
  }
  const alerts=[]
  for(const c of cards){
    if(c.actual_spend!==null&&c.planned_budget>0&&
      c.actual_spend>c.planned_budget)
      alerts.push({id:c.id,level:'review',
        title:'Gasto declarado supera presupuesto',
        detail:c.name+': '+(c.actual_spend-c.planned_budget).toFixed(2)+' € por encima de lo previsto.'})
    if(c.reportedBookingsWithoutCode)
      alerts.push({id:c.id,level:'review',
        title:'Reservas con código sin código registrado',
        detail:c.name+': revisa la fuente del recuento declarado.'})
    if(c.actual_spend===null&&c.status==='finished')
      alerts.push({id:c.id,level:'info',
        title:'Campaña finalizada sin gasto documentado',
        detail:c.name+': el gasto desconocido no equivale a gasto cero.'})
  }
  return {
    campaigns:cards,channels:[...channels.values()],
    totals:{campaigns:cards.length,planned,spentKnown:spent,unknownSpend,campaignsWithSpend},
    alerts
  }
}
