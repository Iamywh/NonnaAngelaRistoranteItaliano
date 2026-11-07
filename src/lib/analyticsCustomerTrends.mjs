// Phase 13B: read-only business trend analysis over completed calendar months.
// Reuses the existing private, aggregated Phase 13A RPC; never fetches PII.
// Signals are descriptive, not forecasts, capacity measurements or causal claims.
import {prepareCustomerIntelligence,WEEKDAYS,SERVICE_LABELS,LEAD_LABELS} from './analyticsCustomerIntelligence.mjs'

const MONTH_RE=/^(20[0-9]{2})-(0[1-9]|1[0-2])$/
const daysInMonth=month=>{
  const [year,mm]=month.split('-').map(Number)
  return new Date(Date.UTC(year,mm,0)).getUTCDate()
}
const round=(x,digits=1)=>Number(x.toFixed(digits))
const fraction=(part,total)=>total>0?round(100*part/total):null
const safeCount=(value,key)=>{
  if(!Number.isSafeInteger(value)||value<0)throw Error('Recuento no válido: '+key)
  return value
}
function monthOrdinal(month){
  const m=MONTH_RE.exec(month||'')
  if(!m)throw Error('Mes incorrecto: usa AAAA-MM desde el año 2000')
  return Number(m[1])*12+Number(m[2])-1
}
function monthFromOrdinal(index){
  const year=Math.floor(index/12),month=index%12+1
  return String(year)+'-'+String(month).padStart(2,'0')
}
export function recentCompletedMonths(endMonth,count,todayMonth) {
  if(![3,6].includes(count))throw Error('Selecciona 3 o 6 meses completos')
  const end=monthOrdinal(endMonth),today=monthOrdinal(todayMonth)
  if(end>=today)throw Error('El análisis compara solo meses COMPLETOS; el mes actual sigue abierto')
  if(end-count+1<monthOrdinal('2000-01'))throw Error('No hay suficientes meses anteriores a la fecha seleccionada')
  return Array.from({length:count},(_,i)=>monthFromOrdinal(end-count+1+i))
}

function sumBy(rows,key,field){
  const map=new Map()
  for(const row of rows){
    const id=row[key]
    const amount=safeCount(row[field]??0,key+':'+field)
    map.set(id,(map.get(id)||0)+amount)
  }
  return map
}
function asRows(models,property,key,field,ids){
  const flat=models.flatMap(m=>m[property])
  const sums=sumBy(flat,key,field)
  return ids.map(id=>({id,value:sums.get(id)||0}))
}
function checkBreakdowns(model){
  const t=model.totals
  for(const [name,rows] of [
    ['día de la semana',model.weekdays],
    ['anticipación',model.lead],
    ['origen',model.origin],
    ['preferencia de contacto',model.channel]
  ]){
    const sum=rows.reduce((value,item)=>value+safeCount(item.requests,name),0)
    if(sum!==t.requests)throw Error('Desglose mensual incompleto: '+name+' ('+model.month+')')
  }
  for(const [name,rows] of [
    ['servicio',model.service],['día de la semana',model.weekdays]
  ]){
    const sum=rows.reduce((value,item)=>value+safeCount(item.active_guests,name),0)
    if(sum!==t.active_guests)throw Error('Plazas por '+name+' no coinciden con el total ('+model.month+')')
  }
}
export function buildCustomerTrends(rawMonths,todayMonth){
  if(!Array.isArray(rawMonths)||![3,6].includes(rawMonths.length))
    throw Error('Se requieren 3 o 6 meses completos')
  const today=monthOrdinal(todayMonth)
  const months=rawMonths.map(prepareCustomerIntelligence)
  for(let i=0;i<months.length;i++){
    const ord=monthOrdinal(months[i].month)
    if(ord>=today)throw Error('No es un mes cerrado: '+months[i].month)
    if(i>0&&ord!==monthOrdinal(months[i-1].month)+1)
      throw Error('Los meses deben ser consecutivos, sin duplicados')
    checkBreakdowns(months[i])
  }
  const points=months.map(m=>{
    const t=m.totals,days=daysInMonth(m.month)
    const settled=t.arrived+t.no_show
    return {
      month:m.month,days,requests:t.requests,pending:t.pending,confirmed:t.confirmed,
      cancelled:t.cancelled,rejected:t.rejected,other_status:t.other_status,
      active:t.active,active_guests:t.active_guests,arrived:t.arrived,
      arrived_guests:t.arrived_guests,no_show:t.no_show,
      past_unmarked:t.past_unmarked,
      requestsPerCalendarDay:round(t.requests/days,2),
      activeGuestsPerCalendarDay:round(t.active_guests/days,2),
      statusCoveragePct:fraction(settled,t.active),
      markedNoShowPct:fraction(t.no_show,settled)
    }
  })
  const totals=Object.fromEntries([
    'requests','pending','confirmed','cancelled','rejected','active',
    'active_guests','arrived','arrived_guests','no_show','past_unmarked'
  ].map(key=>[key,points.reduce((sum,p)=>sum+p[key],0)]))
  totals.marked=totals.arrived+totals.no_show
  const services=asRows(months,'service','service','active_guests',['lunch','dinner','outside'])
    .map(row=>({...row,label:SERVICE_LABELS[row.id],share:fraction(row.value,totals.active_guests)}))
  const weekdays=asRows(months,'weekdays','weekday','active_guests',[1,2,3,4,5,6,7])
    .map(row=>({...row,label:WEEKDAYS[row.id],share:fraction(row.value,totals.active_guests)}))
  const leads=asRows(months,'lead','bucket','requests',
    ['same_day','one_two','three_seven','eight_plus','late_entry','unknown'])
    .map(row=>({...row,label:LEAD_LABELS[row.id],share:fraction(row.value,totals.requests)}))
  const latest=points.at(-1),previous=points.at(-2)
  const priorAverage=previous.requests/previous.days
  const latestAverage=latest.requests/latest.days
  const requestTrendPct=priorAverage>0?
    round(100*(latestAverage/priorAverage-1)):null
  const latestCount=latest.requests+previous.requests
  const alerts=[]
  const add=(priority,title,detail)=>alerts.push({priority,title,detail})
  if(totals.requests===0){
    add('info','Sin solicitudes registradas',
      'El período elegido no tiene reservas en este origen de datos. No supone que el restaurante estuviera cerrado.')
  } else {
    if(totals.active>=10 && totals.past_unmarked>=5 &&
       totals.past_unmarked/totals.active>=0.2){
      add('priority','Completar el estado de las mesas',
        totals.past_unmarked+' reservas de meses pasados siguen «Sin llegar». '+
        'Antes de evaluar no-show o conversión, el equipo debe registrar sentados/completados/no-show.')
    }
    if(latestCount>=20&&previous.requests>=10&&latest.requests>=5&&
       requestTrendPct!==null&&requestTrendPct<=-20){
      add('review','Revisar la caída reciente de solicitudes',
        'La media de solicitudes por día calendario de '+latest.month+
        ' cayó '+Math.abs(requestTrendPct)+'% respecto a '+previous.month+
        '. Comprueba días de apertura, promociones, festivos y cambios de horario antes de atribuir una causa.')
    }
    if(totals.requests>=30){
      const lunch=services.find(s=>s.id==='lunch')
      const dinner=services.find(s=>s.id==='dinner')
      const high=Math.max(lunch.value,dinner.value)
      const low=Math.min(lunch.value,dinner.value)
      if(high>=20&&low/high<=0.6){
        const weaker=lunch.value<=dinner.value?lunch:dinner
        add('opportunity','Turno con menos plazas solicitadas: '+weaker.label,
          'En el período comparado registra '+weaker.value+' plazas solicitadas activas. '+
          'Comprueba si se ofrece ese turno, cuántos días abre y su capacidad real antes de lanzar una promoción.')
      }
      const sameDay=leads.find(l=>l.id==='same_day')
      if(sameDay.value>=12&&sameDay.share>=35){
        add('opportunity','Demanda de última hora',
          sameDay.share+'% de las solicitudes se hicieron para el mismo día. '+
          'Prueba contenidos de Instagram de última hora únicamente tras verificar disponibilidad real de mesas.')
      }
      if(totals.cancelled>=5&&totals.cancelled/totals.requests>=0.15){
        add('review','Revisar reservas canceladas',
          totals.cancelled+' solicitudes figuran canceladas ('+
          fraction(totals.cancelled,totals.requests)+'%). '+
          'Revisa horarios y motivos disponibles; no se conoce automáticamente la razón de cancelación.')
      }
      const max=Math.max(...weekdays.map(x=>x.value))
      const less=weekdays.filter(x=>x.value<=max*0.4)
      if(max>=15&&less.length&&less.length<7){
        add('opportunity','Días de demanda comparativamente baja',
          less.map(x=>x.label).join(', ')+
          ' registran menos plazas solicitadas que los días de mayor demanda. '+
          'Antes de invertir, comprueba cuáles son días y turnos realmente abiertos.')
      }
    } else {
      add('info','Muestra limitada para decisiones comerciales',
        'Hay '+totals.requests+' solicitudes en el período. No se generan recomendaciones de promoción basadas en diferencias pequeñas.')
    }
  }
  if(totals.requests>0 && totals.active>0 &&
     fraction(totals.marked,totals.active)<70) {
    add('review','Cobertura incompleta de resultados de servicio',
      'Solo '+fraction(totals.marked,totals.active)+'% de las reservas activas tiene estado «llegó» o «no-show». '+
      'La proporción de no-show de las reservas clasificadas no representa al conjunto de clientes.')
  }
  return {
    months:points,totals,services,weekdays,leads,
    latest,previous,requestTrendPct,
    markedNoShowPct:fraction(totals.no_show,totals.marked),
    statusCoveragePct:fraction(totals.marked,totals.active),
    alerts,
    caveat:'Comparación de meses calendario COMPLETOS, por fecha de servicio solicitado. '+
      'Datos de reservas en su estado actual (no históricos de cuándo cambió cada estado). '+
      'Las plazas solicitadas NO son aforo ni ventas; la diferencia mensual no demuestra causalidad.'
  }
}
