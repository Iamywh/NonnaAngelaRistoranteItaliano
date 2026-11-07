import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {IMPORT_HEADERS,EXPENSE_CATEGORIES,importCsvTemplate,
  parseImportCsv,validateImportTable,validateImportRow} from '../src/lib/analyticsImport.mjs'

const sql=readFileSync(new URL('../supabase/migrations/20261107_analytics_import_register_batch.sql',import.meta.url),'utf8')
const xlsx=readFileSync(new URL('../src/lib/analyticsImportXlsx.mjs',import.meta.url),'utf8')
const page=readFileSync(new URL('../src/pages/admin/AnalyticsImport.jsx',import.meta.url),'utf8')
const analytics=readFileSync(new URL('../src/pages/admin/Analytics.jsx',import.meta.url),'utf8')

function daily(date='2025-07-11'){
  return {business_date:date,lunch_status:'open',lunch_covers:'12',
    lunch_food:'120,45',lunch_beverage:'30.50',lunch_tax_basis:'gross',
    dinner_status:'closed',dinner_covers:'0',dinner_food:'0',
    dinner_beverage:'0',dinner_tax_basis:'gross',notes:'Prueba válida'}
}
function expense(date='2025-07-11'){
  return {period_kind:'daily',period_date:date,category:'food_purchases',
    amount:'150,20',tax_basis:'gross',igic_amount:'',notes:'Proveedor A'}
}
const csv=(kind,rows)=>importCsvTemplate(kind)+rows.map(r=>
  IMPORT_HEADERS[kind].map(k=>{
    const val=String(r[k]??'')
    return /[;"\n\r]/.test(val)?'"'+val.replace(/"/g,'""')+'"':val
  }).join(';')).join('\r\n')+'\r\n'

test('Daily services import parses quoted CSV and outputs two exact services',()=>{
  const parsed=parseImportCsv(csv('daily',[{...daily(),notes:'Prueba; con comillas "A"'}]),'daily')
  assert.equal(parsed.length,1)
  assert.equal(parsed[0].key,'2025-07-11')
  assert.equal(parsed[0].value.lunch.covers,12)
  assert.equal(parsed[0].value.lunch.food,120.45)
  assert.equal(parsed[0].value.dinner.beverage,0)
  assert.equal(parsed[0].value.status,'draft')
  assert.equal(parsed[0].value.notes,'Prueba; con comillas "A"')
})
test('Expense imports accept explicit decimal separators, nullable IGIC, and categories',()=>{
  assert.equal(EXPENSE_CATEGORIES.length,12)
  const parsed=parseImportCsv(csv('expenses',[expense()]),'expenses')
  assert.equal(parsed[0].value.amount,150.2)
  assert.equal(parsed[0].value.igic,null)
  assert.equal(parsed[0].value.basis,'gross')
  assert.equal(parsed[0].key,'daily|2025-07-11|food_purchases')
})
test('Reject duplicate day and duplicate expenses in one upload',()=>{
  assert.throws(()=>parseImportCsv(csv('daily',[daily(),daily()]),'daily'),/Duplicado/)
  assert.throws(()=>parseImportCsv(csv('expenses',[expense(),expense()]),'expenses'),/Duplicado/)
})
test('Reject inconsistent closed service, date and money',()=>{
  assert.throws(()=>validateImportRow({...daily(),dinner_food:'1'},'daily'),/cerrado/)
  assert.throws(()=>validateImportRow({...daily(),business_date:'2025-02-31'},'daily'),/Fecha/)
  assert.throws(()=>validateImportRow({...expense(),amount:'1.234,00'},'expenses'),/Importe/)
  assert.throws(()=>validateImportRow({...expense(),igic_amount:'999'},'expenses'),/IGIC/)
  assert.throws(()=>validateImportRow({...expense(),period_kind:'monthly',period_date:'2025-07-11'},'expenses'),/Mes/)
})
test('Reject malformed header and file row count',()=>{
  assert.throws(()=>parseImportCsv('a;b\n1;2','daily'),/Cabecera/)
  assert.throws(()=>validateImportTable([IMPORT_HEADERS.daily], 'daily'),/entre 1/)
  assert.throws(()=>validateImportTable([IMPORT_HEADERS.expenses,...Array(61).fill(
    IMPORT_HEADERS.expenses.map(()=>''))], 'expenses'),/entre 1/)
})
test('SQL import requires signed-in Analytics writer, server dry-run and atomic no-overwrite',()=>{
  assert.match(sql,/auth\.role\(\) IS DISTINCT FROM 'authenticated'/)
  assert.match(sql,/analytics_has_permission\('analytics.write'\)/)
  assert.match(sql,/p_preview boolean DEFAULT true/)
  assert.match(sql,/IF NOT p_preview THEN/)
  assert.match(sql,/v_status<>'ready'/)
  assert.match(sql,/RAISE EXCEPTION 'Import cancelled/)
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.analytics_import_register_batch[\s\S]*FROM PUBLIC,anon,authenticated/)
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.analytics_import_register_batch[\s\S]*TO authenticated/)
  assert.doesNotMatch(sql,/ON CONFLICT[^;]*DO UPDATE/)
  assert.match(sql,/analytics_monthly_closures/)
  assert.match(sql,/pg_advisory_xact_lock/)
  assert.match(sql,/'draft',auth\.uid\(\),auth\.uid\(\)/)
  assert.match(sql,/analytics_expense_audit/)
  assert.match(sql,/analytics_import_rows/)
  assert.doesNotMatch(sql,/public\.reservations/)
})
test('Browser supports local bounded XLSX worksheet read, rejects formulas and no remote libraries',()=>{
  assert.match(xlsx,/DecompressionStream\('deflate-raw'\)/)
  assert.match(xlsx,/readXmlZip/)
  assert.match(xlsx,/LIMIT=2_000_000/)
  assert.match(xlsx,/Fórmulas XLSX no permitidas/)
  assert.match(xlsx,/validateImportTable\(table,kind\)/)
  assert.doesNotMatch(xlsx,/\bfetch\s*\(|\bimport\s*\(\s*['\"]https?:\/\//)
})
test('Analytics import requires explicit preview and confirmation; monthly history remains separate',()=>{
  assert.match(page,/analytics_import_register_batch/)
  assert.match(page,/p_preview:true/)
  assert.match(page,/p_preview:false/)
  assert.match(page,/!ready\|\|!understood/)
  assert.match(page,/window\.confirm/)
  assert.match(page,/XLSX/)
  assert.match(analytics,/import AnalyticsImport/)
  assert.match(analytics,/setActiveTab\('import'\)/)
  assert.match(page,/pestaña Histórico/)
})
