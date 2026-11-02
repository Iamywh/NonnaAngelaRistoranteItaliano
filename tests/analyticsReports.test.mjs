import test from 'node:test'
import assert from 'node:assert/strict'
import {reportMonths,reportMonthEnd,buildAnalyticsReport} from '../src/lib/analyticsReports.mjs'
import {createAnalyticsXlsx} from '../src/lib/analyticsXlsx.mjs'

const day=(date,revenue,covers,basis='gross',final='draft')=>({
 business_date:date,status:final,lunch_status:'open',dinner_status:'closed',
 analytics_service_entries:[{
  service_type:'lunch',covers,food_revenue_amount:revenue,
  beverage_revenue_amount:0,tax_basis:basis
 }]
})
const history=(month,revenue,basis='gross',quality='verified')=>({
 month_start:month+'-01',revenue_total:revenue,covers:400,
 tax_basis:basis,data_quality:quality
})
const closed=(month,revenue)=>({
 month_start:month+'-01',revenue_source:'history',
 revenue_net:revenue,covers:500,food_consumption_net:4000,
 beverage_consumption_net:1000,other_expenses_net:6000,
 operating_result_net:revenue-11000,
 source_fingerprint:'123',closed_at:'2026-11-01T14:00:00Z'
})
const prepare=(overrides={})=>buildAnalyticsReport({
 months:['2026-09','2026-10','2026-11'],
 days:[],history:[],expenses:[],inventories:[],targets:[],closures:[],
 closeChecks:{},...overrides
})
test('range 3, 6, 12 and year boundaries preserve months',()=>{
 assert.deepEqual(reportMonths('2026-01',3),['2025-11','2025-12','2026-01'])
 assert.equal(reportMonths('2026-11',12).length,12)
 assert.equal(reportMonthEnd('2026-12'),'2027-01-01')
 assert.throws(()=>reportMonths('2026-11',2),/inválido/)
})
test('stored closure is exclusive source even if historic and daily numbers exist',()=>{
 const result=prepare({
  closures:[closed('2026-10',20000)],history:[history('2026-10',25000)],
  days:[day('2026-10-31',1000,20)],
  closeChecks:{'2026-10-01':'consistent'}
 })
 const m=result.months[1]
 assert.equal(m.revenue,20000)
 assert.equal(m.status,'closed')
 assert.equal(m.operatingResult,9000)
 assert.equal(m.foodConsumption,4000)
 assert.ok(m.warnings.some(w=>w.includes('Historico y Registro diario')))
})
test('verified consolidated history supersedes incomplete daily, never added',()=>{
 const result=prepare({
  history:[history('2026-10',22000)],
  days:[day('2026-10-31',1500,30)]
 })
 assert.equal(result.months[1].revenue,22000)
 assert.equal(result.months[1].status,'verified')
 assert.equal(result.months[1].operatingResult,null)
})
test('estimation not mistaken for consolidated confirmed figures',()=>{
 const result=prepare({history:[history('2026-10',20000,'gross','estimated')]})
 const m=result.months[1]
 assert.equal(m.status,'estimated')
 assert.equal(m.revenue,20000)
 assert.equal(result.summary.revenueTotal,null)
})
test('a partial month is shown as partial; cannot create a valid period subtotal',()=>{
 const result=prepare({days:[day('2026-10-31',250,10)]})
 assert.equal(result.months[1].status,'partial')
 assert.equal(result.months[1].revenue,250)
 assert.equal(result.summary.revenueTotal,null)
})
test('mixed gross and net prevent summing consolidated revenue',()=>{
 const result=buildAnalyticsReport({
 months:['2026-09','2026-10'],
 history:[history('2026-09',17000,'net'),history('2026-10',22000,'gross')]
 })
 assert.equal(result.summary.revenueTotal,null)
 assert.equal(result.summary.revenueBasis,null)
})
test('complete verified periods with equal basis allow total, never profit',()=>{
 const result=buildAnalyticsReport({
 months:['2026-09','2026-10'],
 history:[history('2026-09',17000,'gross'),history('2026-10',22000,'gross')]
 })
 assert.equal(result.summary.revenueTotal,39000)
 assert.equal(result.summary.fullyVerified,true)
 assert.equal(result.months[0].operatingResult,null)
})
test('if expenses overlap between daily and monthly, subtotal hidden and warned',()=>{
 const result=prepare({expenses:[
  {period_date:'2026-10-01',period_kind:'monthly',category:'payroll',amount:1000,tax_basis:'net'},
  {period_date:'2026-10-06',period_kind:'daily',category:'payroll',amount:400,tax_basis:'net'}
 ]})
 assert.equal(result.months[1].expenseTotal,null)
 assert.ok(result.months[1].warnings.some(w=>w.includes('duplicidades')))
})
test('modified closure sources create audit warning; snapshot amount unchanged',()=>{
 const result=prepare({
  closures:[closed('2026-10',17000)],
  closeChecks:{'2026-10-01':'changed'}
 })
 const m=result.months[1]
 assert.equal(m.revenue,17000)
 assert.equal(m.closureStatus,'changed')
 assert.ok(m.warnings.some(w=>w.includes('Fuentes modificadas')))
})
test('xlsx is an actual ZIP based Excel workbook with expected 4 sheets',()=>{
 const result=prepare({history:[history('2026-10',22000)]})
 const bytes=createAnalyticsXlsx(result)
 assert.equal(bytes[0],0x50)
 assert.equal(bytes[1],0x4b)
 const textBuffer=Buffer.from(bytes).toString('utf8')
 for(const path of ['xl/workbook.xml','xl/worksheets/sheet1.xml',
   'xl/worksheets/sheet2.xml','xl/worksheets/sheet3.xml',
   'xl/worksheets/sheet4.xml','[Content_Types].xml'])
  assert.ok(textBuffer.includes(path),'Workbook should contain '+path)
 assert.ok(textBuffer.includes('Avisos'))
 assert.ok(textBuffer.includes('Gastos'))
 assert.ok(textBuffer.includes('22000'))
})
test('formula-shaped text remains inline string, never a formula cell',()=>{
 const result=prepare({
  expenses:[{period_date:'2026-10-06',period_kind:'daily',
    category:'=HYPERLINK("https://example.com","click")',amount:100,tax_basis:'net'}]
 })
 const workbook=Buffer.from(createAnalyticsXlsx(result)).toString('utf8')
 assert.ok(workbook.includes('t="inlineStr"'))
 assert.ok(!workbook.includes('<f>'))
 assert.ok(workbook.includes('&quot;'))
})
test('duplicate month selection rejected',()=>{
 assert.throws(()=>buildAnalyticsReport({months:['2026-10','2026-10']}),/invalidos/)
})
