// Phase 13A read-only presentation helpers. These never infer attendance
// from a pending/not_arrived reservation or assign sales to bookings.
const assertCount=(value,label)=>{
  if(!Number.isSafeInteger(value)||value<0)throw Error('Datos agregados inválidos: '+label)
  return value
}
const percentage=(part,total)=>total>0?Math.round((part/total)*1000)/10:null
export const WEEKDAYS=Object.freeze({
  1:'Lunes',2:'Martes',3:'Miércoles',4:'Jueves',5:'Viernes',6:'Sábado',7:'Domingo'
})
export const LEAD_LABELS=Object.freeze({
  same_day:'Mismo día',one_two:'1–2 días',three_seven:'3–7 días',
  eight_plus:'8 días o más',late_entry:'Creada después de la fecha',unknown:'Sin fecha de creación'
})
export const SERVICE_LABELS=Object.freeze({
  lunch:'Almuerzo',dinner:'Cena',outside:'Fuera de los turnos estándar'
})
export const SOURCE_LABELS=Object.freeze({
  website:'Sitio web (incluye asistente virtual)',other:'Otros',unknown:'No indicado'
})
export const CHANNEL_LABELS=Object.freeze({
  whatsapp:'WhatsApp',email:'Email',other:'Otra o sin preferencia'
})

export function prepareCustomerIntelligence(data){
  if(!data||typeof data!=='object'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month)){
    throw Error('Respuesta mensual no válida')
  }
  const t=data.totals
  if(!t||typeof t!=='object')throw Error('Sin contadores de reservas')
  for(const name of [
    'requests','requested_guests','pending','confirmed','cancelled','rejected',
    'other_status','active','active_guests','arrived','arrived_guests',
    'no_show','no_show_guests','past_unmarked','out_of_window'
  ]) assertCount(t[name],name)
  if(t.pending+t.confirmed+t.cancelled+t.rejected+t.other_status!==t.requests){
    throw Error('Los estados no cuadran con el total de solicitudes')
  }
  if(t.active!==t.pending+t.confirmed||
     t.arrived+t.no_show>t.active||
     t.arrived_guests+t.no_show_guests>t.active_guests){
    throw Error('Los contadores de asistencia son incoherentes')
  }
  const arrays=['by_service','by_weekday','by_date','by_lead','by_origin','by_channel_preference']
  for(const key of arrays)if(!Array.isArray(data[key]))throw Error('Desglose incompleto: '+key)
  if(data.by_date.reduce((sum,x)=>sum+assertCount(x.requests,'día'),0)!==t.requests ||
     data.by_service.reduce((sum,x)=>sum+assertCount(x.requests,'servicio'),0)!==t.requests){
    throw Error('El desglose no corresponde con las solicitudes')
  }
  const markedOutcomes=t.arrived+t.no_show
  const rankedWeekdays=[...data.by_weekday].map(x=>({
    ...x,label:WEEKDAYS[x.weekday]||'Sin clasificar',
    active_guests:assertCount(x.active_guests,'comensales día semana')
  })).sort((a,b)=>b.active_guests-a.active_guests)
  const insights=[]
  if(t.past_unmarked>0)insights.push({
    kind:'warning',title:'Revisar estados de servicio',
    description:t.past_unmarked+' reservas de fechas anteriores siguen como «Sin llegar». No se cuentan como no-show.',
    action:'Ver reservas'
  })
  if(t.out_of_window>0)insights.push({
    kind:'warning',title:'Reservas fuera de turno estándar',
    description:t.out_of_window+' solicitudes tienen horario fuera de los intervalos de almuerzo/cena usados por este informe. Revisa horarios especiales.',
    action:'Ver reservas'
  })
  if(t.other_status>0)insights.push({
    kind:'warning',title:'Estados no clasificados',
    description:t.other_status+' solicitudes usan un estado diferente de pending/confirmed/cancelled/rejected.',
    action:'Ver reservas'
  })
  if(t.requests>0&&markedOutcomes===0)insights.push({
    kind:'info',title:'Asistencia todavía no medida',
    description:'No hay ninguna reserva marcada como sentada, completada o no-show. Las confirmaciones no demuestran asistencia.'
  })
  if(t.no_show>0)insights.push({
    kind:'info',title:'No-show registrados',
    description:t.no_show+' reservas están marcadas explícitamente como no-show. La tasa entre casos resueltos no representa toda la clientela si faltan estados.'
  })
  if(t.requests>=10 && rankedWeekdays.length) {
    const leader=rankedWeekdays[0]
    if(leader.active_guests>0)insights.push({
      kind:'info',title:'Día con más comensales solicitados',
      description:leader.label+' concentra '+leader.active_guests+
        ' plazas solicitadas en reservas pendientes/confirmadas. No es ocupación real ni facturación.'
    })
  }
  return {
    month:data.month,
    totals:t,
    service:data.by_service,
    weekdays:rankedWeekdays,
    days:data.by_date,
    lead:data.by_lead,
    origin:data.by_origin,
    channel:data.by_channel_preference,
    dailyRegister:data.daily_register||null,
    markedOutcomes,
    markedNoShowPct:percentage(t.no_show,markedOutcomes),
    activeSharePct:percentage(t.active,t.requests),
    insights
  }
}
