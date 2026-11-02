// UI-only preview. Does not create notifications or deliver messages.
export const CANARY_ZONE='Atlantic/Canary'
export function canaryIsoDate(date=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:CANARY_ZONE,year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
  return parts.year+'-'+parts.month+'-'+parts.day
}
export function shiftDay(iso,days){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isInteger(days))throw Error('Fecha inválida')
  const date=new Date(iso+'T12:00:00Z')
  if(Number.isNaN(date.getTime()))throw Error('Fecha inválida')
  date.setUTCDate(date.getUTCDate()+days)
  return date.toISOString().slice(0,10)
}
export function previewDigest({kind,today,days=[]}){
  if(!['daily','weekly'].includes(kind))throw Error('Periodicidad inválida')
  const begin=shiftDay(today,kind==='daily'?-1:-7),end=shiftDay(today,-1)
  const records=days.filter(d=>d.business_date>=begin&&d.business_date<=end)
  const final=records.filter(d=>d.status==='finalized')
  let lunch=0,dinner=0
  for(const day of final)for(const service of day.analytics_service_entries||[]){
    if(service.service_type==='lunch'&&day.lunch_status==='open')lunch+=Number(service.covers)||0
    if(service.service_type==='dinner'&&day.dinner_status==='open')dinner+=Number(service.covers)||0
  }
  return {
    kind,begin,end,recorded:records.length,finalized:final.length,
    lunch,dinner,total:lunch+dinner,provisional:records.length-final.length,
    hasData:records.length>0,
    notes:[
      'Solo se cuentan comensales de jornadas finalizadas.',
      'Los días sin registro no se tratan como ventas o comensales cero.',
      'No se calcula beneficio, IGIC ni incumplimiento de objetivos a partir de días incompletos.'
    ]
  }
}
