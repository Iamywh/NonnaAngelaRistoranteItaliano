// Fase 12B/3: deterministic, READ-ONLY month data-quality checks.
// The Supabase analytics_evaluate_month_close RPC is the ONLY authoritative
// source of whether a month can be closed. This module provides diagnostics,
// never mutates records, infers IGIC, or treats absent dates as zero sales.
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/
const SERVICE_TYPES = ['lunch', 'dinner']
const nonnegative = value => value !== null && value !== undefined &&
  value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
const number = value => Number(value)
const monthEndDay = month => {
  const [year,mm] = month.split('-').map(Number)
  return new Date(Date.UTC(year,mm,0)).getUTCDate()
}
export function monthDateRange(month) {
  if (!MONTH.test(month)) throw Error('Mes inválido (AAAA-MM)')
  const [year,mm] = month.split('-').map(Number)
  const start = month+'-01'
  const next = new Date(Date.UTC(year,mm,1)).toISOString().slice(0,10)
  return {start,next,days:monthEndDay(month)}
}
const add = (items,severity,section,title,detail,target,day=null) => {
  items.push({id:'q'+(items.length+1),severity,section,title,detail,target,day})
}
export function buildDataQuality({month,today,days=[],expenses=[],inventories=[],
  history=null,closure=null,closeReport=null}) {
  const {start,next,days:calendarDays}=monthDateRange(month)
  if (!DATE.test(today)) throw Error('Fecha local no válida')
  if (!closeReport || typeof closeReport.ready !== 'boolean' ||
      !Array.isArray(closeReport.issues) || !Array.isArray(closeReport.warnings)) {
    throw Error('Falta evaluación de conciliación del servidor')
  }
  const findings=[]
  const source=closure?.revenue_source || closeReport.source
  if (!['daily','history'].includes(source)) throw Error('Fuente de ingresos no válida')
  const currentMonth=today.slice(0,7)
  const lastElapsed = month < currentMonth ? calendarDays :
    month > currentMonth ? 0 : Math.max(0,Number(today.slice(8))-1)
  const recorded=new Set()
  const pending=[]
  for(let d=1;d<=lastElapsed;d++){
    const date=month+'-'+String(d).padStart(2,'0')
    if(!days.some(row=>row.business_date===date))pending.push(date)
  }
  if(pending.length) {
    add(findings,source==='daily'?'critical':'warning','Registro diario',
      pending.length+' jornadas transcurridas sin registro',
      'Faltan registros, incluidos los días cerrados. No significa que hubiera ventas cero. '+
      (pending.slice(0,6).join(', '))+(pending.length>6?'…':''),
      'daily')
  }
  for(const day of days) {
    if(typeof day.business_date!=='string' || day.business_date<start || day.business_date>=next)
      throw Error('Jornada fuera del período analizado')
    recorded.add(day.business_date)
    const entries=day.analytics_service_entries||[]
    if(day.status!=='finalized') {
      add(findings,'warning','Registro diario','Jornada aún en borrador',
        'La jornada '+day.business_date+' no está finalizada; revisa sus cifras antes de finalizarla.',
        'daily',day.business_date)
    }
    if(entries.length!==2 || new Set(entries.map(e=>e.service_type)).size!==2 ||
      !SERVICE_TYPES.every(t=>entries.some(e=>e.service_type===t))) {
      add(findings,'critical','Registro diario','Servicios incompletos',
        day.business_date+': se esperan exactamente dos servicios (almuerzo y cena).',
        'daily',day.business_date)
    }
    let taxPending=false
    for(const type of SERVICE_TYPES){
      const row=entries.find(e=>e.service_type===type)
      if(!row)continue
      const status=type==='lunch'?day.lunch_status:day.dinner_status
      const label=type==='lunch'?'almuerzo':'cena'
      if(!nonnegative(row.covers)||!Number.isInteger(number(row.covers))||
        !nonnegative(row.food_revenue_amount)||!nonnegative(row.beverage_revenue_amount)) {
        add(findings,'critical','Registro diario','Cifras inválidas',
          day.business_date+' '+label+': importes negativos, incompletos o comensales no enteros.',
          'daily',day.business_date)
        continue
      }
      const total=number(row.food_revenue_amount)+number(row.beverage_revenue_amount)
      if(status==='closed' && (number(row.covers)!==0||total!==0)){
        add(findings,'critical','Registro diario','Servicio cerrado con actividad registrada',
          day.business_date+' '+label+': declarado cerrado pero tiene ingresos o comensales.',
          'daily',day.business_date)
      }
      if(status==='open'&&total>0&&number(row.covers)===0) {
        add(findings,'warning','Registro diario','Ingresos sin comensales',
          day.business_date+' '+label+': revisa si son ventas sin servicio de mesa o un error.',
          'daily',day.business_date)
      }
      if(status==='open'&&total===0&&number(row.covers)>0){
        add(findings,'warning','Registro diario','Comensales sin ingresos',
          day.business_date+' '+label+': comprueba si fue un servicio gratuito o faltan ventas.',
          'daily',day.business_date)
      }
      if(!['gross','net'].includes(row.tax_basis)){
        add(findings,'critical','Fiscalidad','Base fiscal inválida',
          day.business_date+' '+label+': define una base gross/net válida.',
          'daily',day.business_date)
      } else if(row.tax_basis==='gross'&&total>0) {
        add(findings,'warning','Fiscalidad','Ventas registradas en bruto',
          day.business_date+' '+label+': no convertir a neto sin documentos verificados.',
          'daily',day.business_date)
      }
      if(total>0&&row.tax_details?.status==='unverified') taxPending=true
    }
    if(taxPending){
      add(findings,'warning','Fiscalidad','Desglose fiscal sin verificar',
        day.business_date+': al menos un servicio tiene tax_details pendiente de verificación. '+
        'Esto no implica que la base gross/net sea incorrecta.',
        'daily',day.business_date)
    }
  }
  if(days.length!==recorded.size){
    add(findings,'critical','Registro diario','Fechas duplicadas en el resultado',
      'Se han recibido registros duplicados; revisa el origen de los datos.', 'daily')
  }
  if(!expenses.length){
    add(findings,'warning','Gastos','Sin gastos registrados',
      'No hay totales de gastos para este mes; comprueba si faltan datos. No se considera gasto cero.',
      'expenses')
  } else {
    const keys=new Set()
    const kindsByCategory=new Map()
    let gross=0,unknown=0
    for(const row of expenses){
      const key=row.period_kind+'|'+row.period_date+'|'+row.category
      if(keys.has(key))add(findings,'critical','Gastos','Total repetido',
        'Clave duplicada '+key+'; comprueba si el total está contabilizado dos veces.',
        'expenses')
      keys.add(key)
      if(!kindsByCategory.has(row.category))kindsByCategory.set(row.category,new Set())
      kindsByCategory.get(row.category).add(row.period_kind)
      if(row.tax_basis==='gross')gross++
      else if(row.tax_basis!=='net')unknown++
      if(!nonnegative(row.amount)||number(row.amount)===0 ||
         (row.igic_amount!=null&&(!nonnegative(row.igic_amount) ||
         (row.tax_basis==='gross'&&number(row.igic_amount)>number(row.amount))))) {
        add(findings,'critical','Gastos','Importe o IGIC inválido',
          'Revisa el importe declarado para '+row.category+' ('+row.period_date+').',
          'expenses')
      }
    }
    const overlapping=[...kindsByCategory].filter(([,k])=>k.size>1).map(([category])=>category)
    if(overlapping.length)add(findings,'critical','Gastos',
      'Posible solapamiento de totales diarios y mensuales',
      'Categorías con ambos períodos: '+overlapping.join(', ')+
      '. Verifica que no se cuenten dos veces.', 'expenses')
    if(gross)add(findings,'warning','Fiscalidad','Gastos en bruto',
      gross+' totales tienen base gross. La conciliación neta exige comprobación con documentos.',
      'expenses')
    if(unknown)add(findings,'critical','Fiscalidad','Gastos sin base válida',
      unknown+' totales no tienen tax_basis gross/net verificable.', 'expenses')
  }
  for(const type of ['food','beverage']){
    const inv=inventories.find(r=>r.stock_type===type)
    if(!inv) {
      add(findings,'warning','Inventario','Inventario ausente: '+type,
        'No hay valoración de apertura/cierre del stock '+type+'.','inventory')
    } else if(inv.purchases_reconciled!==true ||
      inv.opening_value==null||inv.closing_value==null||
      inv.reconciled_purchase_count==null||inv.reconciled_purchase_total==null) {
      add(findings,'warning','Inventario','Inventario por conciliar: '+type,
        'Revisa compras, existencias y conciliación del stock '+type+'.','inventory')
    }
  }
  if(history&&days.length) {
    add(findings,'warning','Ingresos','Hay Histórico y jornadas diarias para el mismo mes',
      'Son fuentes alternativas; nunca deben sumarse automáticamente.', 'history')
  }
  if(closure){
    if(typeof closeReport.fingerprint!=='string'||!closeReport.fingerprint){
      add(findings,'critical','Cierre mensual','Integridad del cierre no verificable',
        'No se recibió una huella válida del servidor.', 'closing')
    } else if(closeReport.fingerprint!==closure.source_fingerprint){
      add(findings,'critical','Cierre mensual','Datos modificados después del cierre',
        'La huella actual no coincide con la instantánea inmutable del cierre.',
        'closing')
    }
  }
  return {
    month,source,calendarDays,lastElapsed,recordedDays:recorded.size,
    unrecordedDays:pending,findings,
    counts:{critical:findings.filter(f=>f.severity==='critical').length,
      warning:findings.filter(f=>f.severity==='warning').length},
    close:{ready:closeReport.ready,issues:closeReport.issues,
      warnings:closeReport.warnings,closed:Boolean(closure)},
    // Never grant closure based on these informational diagnostics.
    checklistSections:[
      {key:'sales',label:'Caja, ventas y fuente de ingresos revisadas',target:source==='daily'?'daily':'history'},
      {key:'expenses',label:'Gastos completos; sin facturas o períodos duplicados',target:'expenses'},
      {key:'inventory',label:'Existencias y compras reconciliadas',target:'inventory'},
      {key:'igic',label:'Bases fiscales NETAS contrastadas con documentos',target:'expenses'},
      {key:'scope',label:'Entiendo que el cierre es de gestión, no liquidación tributaria',target:'closing'}
    ]
  }
}
