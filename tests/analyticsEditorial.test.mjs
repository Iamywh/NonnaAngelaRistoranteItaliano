import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  editorialMonth,changeEditorialMonth,validEditorialDate,
  emptyEditorialItem,editorialItemForm,validateEditorialPayload,
  canReviewEditorial,editorialAllowedActions,analyzeEditorialItems,
  EDITORIAL_CHECKS,EDITORIAL_PLATFORMS
} from '../src/lib/analyticsEditorial.mjs'

const sql=readFileSync(
  new URL('../supabase/migrations/20261108_analytics_editorial_calendar.sql',import.meta.url),'utf8')
const ui=readFileSync(
  new URL('../src/pages/admin/EditorialCalendar.jsx',import.meta.url),'utf8')
const analytics=readFileSync(
  new URL('../src/pages/admin/Analytics.jsx',import.meta.url),'utf8')

const uuid='f3a7a46b-f61a-4b82-8f72-6ad116da479b'
const another='a3a7a46b-f61a-4b82-8f72-6ad116da479b'
const ready=()=>({
  ...emptyEditorialItem('2026-11-12'),
  title:'Carrusel de vinos italianos',
  platform:'instagram',content_kind:'carousel',
  copy_text:'Una historia auténtica de nuestro vino italiano.',
  creative_brief:'Fotografías de botella y denominación de origen',
  cta:'Reserva tu mesa',hashtags:'#NonnaAngela #VinoItaliano',
  asset_ready:true,copy_ready:true,facts_checked:true,rights_checked:true
})
const row=(overrides={})=>({
  ...ready(),id:uuid,revision:1,status:'draft',
  scheduled_time:'18:30:00',
  campaign_name:null,approved_at:null,published_at:null,
  created_at:'2026-11-08T00:00:00Z',
  ...overrides
})
test('Month grid is Monday-first, leap-year-correct and rollover-safe',()=>{
  const november=editorialMonth('2026-11')
  assert.equal(november.length,30)
  assert.equal(november.offset,6)
  assert.equal(november.cells[6],'2026-11-01')
  assert.equal(november.cells.at(-1),'2026-11-30')
  assert.equal(editorialMonth('2024-02').length,29)
  assert.equal(editorialMonth('2025-02').length,28)
  assert.equal(changeEditorialMonth('2026-12',1),'2027-01')
  assert.equal(changeEditorialMonth('2026-01',-1),'2025-12')
  assert.throws(()=>editorialMonth('2026-13'),/inválido/)
})
test('Calendar rejects missing or impossible dates, without UTC schedule conversion',()=>{
  assert.equal(validEditorialDate('2026-02-29'),false)
  assert.equal(validEditorialDate('2024-02-29'),true)
  assert.equal(validEditorialDate('2026-12-31'),true)
  assert.equal(validEditorialDate('2026-04-31'),false)
  assert.equal(validateEditorialPayload(ready()).scheduled_date,'2026-11-12')
})
test('Draft is editable, requires full checks and meaningful copy for review',()=>{
  const blank=emptyEditorialItem('2026-11-12')
  assert.equal(canReviewEditorial(blank),false)
  assert.deepEqual(editorialAllowedActions({...blank,status:'draft'}),['cancel'])
  assert.equal(canReviewEditorial(ready()),true)
  assert.deepEqual(editorialAllowedActions({...ready(),status:'draft'}),['submit','cancel'])
  assert.equal(EDITORIAL_CHECKS.length,4)
  assert.equal(EDITORIAL_PLATFORMS.google_business,'Google Business')
})
test('Draft can be saved before full review; payload validates all fields',()=>{
  const data=validateEditorialPayload(ready())
  assert.equal(data.title,'Carrusel de vinos italianos')
  assert.equal(data.scheduled_time,null)
  assert.equal(data.campaign_id,null)
  assert.equal(data.copy_text,'Una historia auténtica de nuestro vino italiano.')
  assert.equal(data.rights_checked,true)
  assert.ok(!('status' in data))
  assert.throws(()=>validateEditorialPayload({...ready(),title:'X'}),/Título/)
  assert.throws(()=>validateEditorialPayload({...ready(),platform:'public_email'}),/Canal/)
  assert.throws(()=>validateEditorialPayload({...ready(),scheduled_date:'2026-02-30'}),/Fecha/)
  assert.throws(()=>validateEditorialPayload({...ready(),scheduled_time:'25:30'}),/Hora/)
  assert.throws(()=>validateEditorialPayload({...ready(),rights_checked:'true'}),/Checklist/)
  assert.throws(()=>validateEditorialPayload({...ready(),campaign_id:'not-a-uuid'}),/Campaña/)
})
test('Edit payload carries version and server time is normalized for input type=time',()=>{
  const form=editorialItemForm(row())
  assert.equal(form.scheduled_time,'18:30')
  assert.equal(form.expected_revision,1)
  const saved=validateEditorialPayload(form)
  assert.equal(saved.id,uuid)
  assert.equal(saved.expected_revision,1)
  assert.equal(saved.scheduled_time,'18:30')
})
test('Workflow only offers valid transitions; publication cannot be automatic',()=>{
  assert.deepEqual(editorialAllowedActions(row({status:'in_review'})),
    ['approve','return_draft','cancel'])
  assert.deepEqual(editorialAllowedActions(row({status:'approved'})),
    ['publish','return_draft','cancel'])
  assert.deepEqual(editorialAllowedActions(row({status:'published'})),[])
  assert.deepEqual(editorialAllowedActions(row({status:'cancelled'})),[])
})
test('Month report refuses duplicates, misplaced dates, invalid approval and status',()=>{
  const dataset=[
    row({scheduled_date:'2026-11-12'}),
    row({id:another,scheduled_date:'2026-11-15',status:'approved',
      approved_at:'2026-11-10T12:00:00Z'})
  ]
  const report=analyzeEditorialItems(dataset,'2026-11')
  assert.equal(report.total,2)
  assert.equal(report.counts.draft,1)
  assert.equal(report.counts.approved,1)
  assert.equal(report.byDate.get('2026-11-15').length,1)
  assert.throws(()=>analyzeEditorialItems([dataset[0],dataset[0]],'2026-11'),/duplicado/)
  assert.throws(()=>analyzeEditorialItems([row({scheduled_date:'2026-12-01'})],'2026-11'),/fuera de fecha/)
  assert.throws(()=>analyzeEditorialItems([row({status:'approved'})],'2026-11'),/Aprobación/)
  assert.throws(()=>analyzeEditorialItems([row({status:'published',approved_at:'2026-11-01T00:00:00Z'})],'2026-11'),/Publicación/)
  assert.throws(()=>analyzeEditorialItems([row({asset_ready:null})],'2026-11'),/Checklist/)
})
test('SQL is private, functions have balanced PL/pgSQL quotes, no direct grants',()=>{
  assert.match(sql,/REFERENCES public[.]analytics_growth_campaigns[(]id[)] ON DELETE SET NULL/)
  for(const name of ['analytics_editorial_items','analytics_editorial_audit']){
    assert.ok(sql.includes('CREATE TABLE public.'+name+' ('))
    assert.ok(sql.includes('ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY'))
  }
  assert.ok(sql.includes('REVOKE ALL ON public.analytics_editorial_items,public.analytics_editorial_audit'))
  assert.equal((sql.match(/^CREATE FUNCTION public[.]analytics_editorial_/gm)||[]).length,4)
  assert.equal((sql.match(/^AS [$][$]$/gm)||[]).length,4)
  assert.equal((sql.match(/^[$][$];$/gm)||[]).length,4)
  assert.doesNotMatch(sql,/^AS [$]$/m)
  assert.ok(sql.includes("auth.role()='authenticated'"))
  assert.ok(sql.includes("u.role IN ('owner','admin')"))
  assert.doesNotMatch(sql,/GRANT (?:SELECT|UPDATE|INSERT|DELETE) ON public[.]analytics_editorial_/)
})
test('Workflow approvals are audited and reset if copy or asset is edited',()=>{
  assert.match(sql,/status='draft',approved_at=NULL,approved_by=NULL/)
  assert.match(sql,/WHERE id=v_id RETURNING [*] INTO v_new/)
  assert.match(sql,/IF v_old.revision<>v_revision/)
  assert.match(sql,/IF v_old.revision<>p_expected_revision/)
  assert.match(sql,/FOR UPDATE/)
  assert.match(sql,/INSERT INTO public[.]analytics_editorial_audit/g)
  assert.match(sql,/changed_by[)]/)
  assert.match(sql,/char_length[(]btrim[(]v_old[.]copy_text[)][)]<20/)
  assert.match(sql,/v_old[.]asset_ready AND v_old[.]copy_ready AND/)
  assert.match(sql,/v_old[.]facts_checked AND v_old[.]rights_checked/)
  assert.match(sql,/status IN [(]'approved','published'[)]/)
  assert.match(sql,/Published or cancelled content is immutable/)
  assert.match(sql,/Only approved content can be marked published/)
  assert.doesNotMatch(sql,/DELETE FROM public[.]analytics_editorial_items/)
})
test('No external publisher is triggered; publish is a human attestation only',()=>{
  assert.match(sql,/publish.*human attestation/i)
  assert.match(ui,/Este botón NO publica posts/)
  assert.match(ui,/YA fue publicado o ejecutado FUERA del sitio/)
  assert.match(ui,/p_published_url:act==='publish'/)
  assert.doesNotMatch(ui,/\.from\('reservations'\)|\.insert\(|\.update\(|\.delete\(/)
  assert.doesNotMatch(sql,/public[.]reservations|marketing_opt_in|telegram_bot_token|service_role_key/)
  assert.ok(ui.includes('supabase.rpc(\'analytics_editorial_list\''))
  assert.ok(ui.includes('supabase.rpc(\'analytics_editorial_save\''))
  assert.ok(ui.includes('supabase.rpc(\'analytics_editorial_action\''))
  assert.ok(analytics.includes('import EditorialCalendar from'))
  assert.ok(analytics.includes("activeTab === 'editorial' ? <EditorialCalendar"))
})
