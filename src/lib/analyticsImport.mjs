// Phase 12B: strict templates for NEW daily totals / expense totals.
// Data is never merged or silently rounded. Server repeats validation atomically.
export const IMPORT_HEADERS = Object.freeze({
  daily: ['business_date','lunch_status','lunch_covers','lunch_food','lunch_beverage',
    'lunch_tax_basis','dinner_status','dinner_covers','dinner_food','dinner_beverage',
    'dinner_tax_basis','notes'],
  expenses: ['period_kind','period_date','category','amount','tax_basis','igic_amount','notes']
})
export const EXPENSE_CATEGORIES = Object.freeze([
  'food_purchases','beverage_purchases','payroll','rent','utilities','marketing',
  'cleaning_supplies','packaging','maintenance','professional_services','bank_fees','other'
])
export const MAX_IMPORT_ROWS = 60
const moneyPattern = /^(?:0|[1-9][0-9]{0,8})(?:[.,][0-9]{1,2})?$/
const countPattern = /^(?:0|[1-9][0-9]{0,4})$/
const dayPattern = /^([0-9]{4})-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/
const str = value => String(value ?? '').trim()

function strictDay(value) {
  const input = str(value)
  const m = dayPattern.exec(input)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3])
}
function amount(value, zeroAllowed) {
  const raw = str(value)
  if (!moneyPattern.test(raw)) throw Error('Importe no válido (máximo dos decimales, sin miles)')
  const number = Number(raw.replace(',', '.'))
  if (!Number.isFinite(number) || (!zeroAllowed && number <= 0)) throw Error('Importe debe ser positivo')
  return number
}
function covers(value) {
  if (!countPattern.test(str(value))) throw Error('Comensales deben ser un entero entre 0 y 99999')
  return Number(value)
}
function dateField(value, monthly = false) {
  const v = str(value)
  if (!strictDay(v) || (monthly && !v.endsWith('-01'))) {
    throw Error(monthly ? 'Mes: usa AAAA-MM-01' : 'Fecha: usa AAAA-MM-DD (texto ISO)')
  }
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Atlantic/Canary', year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date())
  if (v > today) throw Error('No se pueden importar fechas futuras')
  return v
}
export function validateImportRow(input, kind) {
  const row = Object.fromEntries(Object.entries(input).map(([k,v]) => [k,str(v)]))
  const notes = row.notes || ''
  if (notes.length > 2000) throw Error('Notas: máximo 2000 caracteres')
  if (kind === 'daily') {
    const date = dateField(row.business_date)
    const out = {date,notes,status:'draft'}
    for (const service of ['lunch','dinner']) {
      const status = row[service+'_status']
      const basis = row[service+'_tax_basis']
      if (!['open','closed'].includes(status)) throw Error(service+': status debe ser open o closed')
      if (!['gross','net'].includes(basis)) throw Error(service+': tax_basis debe ser gross o net')
      const c = covers(row[service+'_covers'])
      const food = amount(row[service+'_food'], true)
      const beverage = amount(row[service+'_beverage'], true)
      if (status === 'closed' && (c || food || beverage)) {
        throw Error(service+': un servicio cerrado debe tener todos los importes a cero')
      }
      out[service] = {status,covers:c,food,beverage,basis}
    }
    return {key:date,value:out}
  }
  if (kind === 'expenses') {
    if (!['daily','monthly'].includes(row.period_kind)) throw Error('period_kind: daily o monthly')
    const date = dateField(row.period_date, row.period_kind === 'monthly')
    if (!EXPENSE_CATEGORIES.includes(row.category)) throw Error('Categoría desconocida')
    if (!['gross','net'].includes(row.tax_basis)) throw Error('tax_basis: gross o net')
    const value = amount(row.amount, false)
    const igic = row.igic_amount === '' ? null : amount(row.igic_amount, true)
    if (igic !== null && row.tax_basis === 'gross' && igic > value) {
      throw Error('IGIC conocido no puede superar importe bruto')
    }
    return {key:row.period_kind+'|'+date+'|'+row.category,
      value:{kind:row.period_kind,date,category:row.category,amount:value,
        basis:row.tax_basis,igic,notes}}
  }
  throw Error('Tipo de importación no válido')
}
function parseCells(source,delimiter) {
  const rows=[];let cells=[],field='',inside=false,afterQuote=false
  const pushRow=()=>{cells.push(field);if(cells.some(v=>str(v)!==''))rows.push(cells);cells=[];field='';afterQuote=false}
  for (let i=0;i<source.length;i++) {
    const ch=source[i]
    if (inside) {
      if (ch==='"') {
        if (source[i+1]==='"') {field+='"';i++}
        else {inside=false;afterQuote=true}
      } else field+=ch
    } else if (ch==='"') {
      if (field!=='' || afterQuote) throw Error('Comillas CSV incorrectas')
      inside=true
    } else if (ch===delimiter) {cells.push(field);field='';afterQuote=false}
    else if (ch==='\r'||ch==='\n') {
      if (ch==='\r'&&source[i+1]==='\n') i++
      pushRow()
    } else if (afterQuote && ch!==' ') throw Error('Texto después de comillas CSV')
    else if (!afterQuote) field+=ch
  }
  if (inside) throw Error('Comillas CSV sin cerrar')
  pushRow()
  return rows
}
export function validateImportTable(table,kind) {
  const header=IMPORT_HEADERS[kind]
  if (!header) throw Error('Tipo de importación no reconocido')
  if (table.length < 2 || table.length > MAX_IMPORT_ROWS+1) {
    throw Error('Debe haber entre 1 y '+MAX_IMPORT_ROWS+' registros más la cabecera')
  }
  const actual=table[0].map(x=>str(x).toLowerCase().replace(/^\uFEFF/,''))
  if (actual.length!==header.length || actual.some((x,i)=>x!==header[i])) {
    throw Error('Cabecera exacta requerida: '+header.join(';'))
  }
  const used=new Set()
  return table.slice(1).map((cells,i)=>{
    if (cells.length!==header.length) throw Error('Fila '+(i+2)+': número de columnas incorrecto')
    try {
      const out=validateImportRow(Object.fromEntries(header.map((k,j)=>[k,cells[j]])),kind)
      if (used.has(out.key)) throw Error('Duplicado dentro del archivo: '+out.key)
      used.add(out.key)
      return {line:i+2,...out}
    } catch (e) {throw Error('Fila '+(i+2)+': '+e.message)}
  })
}
export function parseImportCsv(text,kind) {
  if (typeof text!=='string'||text.length>300000) throw Error('CSV demasiado grande')
  const source=text.replace(/^\uFEFF/,'')
  const firstLine=(source.split(/\r?\n/,1)[0]||'')
  const delim=firstLine.includes(';')?';':','
  return validateImportTable(parseCells(source,delim),kind)
}
export function importCsvTemplate(kind) {
  if(!IMPORT_HEADERS[kind]) throw Error('Tipo inválido')
  return '\uFEFF'+IMPORT_HEADERS[kind].join(';')+'\r\n'
}
