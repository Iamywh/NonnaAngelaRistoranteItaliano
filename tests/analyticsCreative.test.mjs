import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  CREATIVE_BUCKET,CREATIVE_MIME_TYPES,CREATIVE_MAX_BYTES,CREATIVE_RIGHTS,
  creativeFileValidation,creativeStoragePath,newCreativeAsset,
  assetForm,validateCreativeForm,validateCreativeList,creativeCanLink
} from '../src/lib/analyticsCreative.mjs'

const sql=readFileSync(new URL(
  '../supabase/migrations/20261108_analytics_creative_library.sql',import.meta.url),'utf8')
const ui=readFileSync(new URL(
  '../src/pages/admin/CreativeLibrary.jsx',import.meta.url),'utf8')
const calendar=readFileSync(new URL(
  '../src/pages/admin/EditorialCalendar.jsx',import.meta.url),'utf8')
const analytics=readFileSync(new URL(
  '../src/pages/admin/Analytics.jsx',import.meta.url),'utf8')
const goodFile={name:'Carbonara.jpg',type:'image/jpeg',size:1024*1024}
const uuid='e9937261-e71d-4f92-a51d-c21d16b729eb'
const metadata=()=>({...newCreativeAsset(),
  title:'Carbonara del ristorante',category:'platos',
  tags:'carbonara, pasta, reel',
  rights_status:'cleared',
  rights_note:'Foto propia del equipo con uso comercial autorizado'
})
const record=(overrides={})=>({
  ...validateCreativeForm(metadata()),id:uuid,revision:1,
  storage_path:'media/'+uuid+'.jpg',original_filename:'Carbonara.jpg',
  mime_type:'image/jpeg',file_bytes:1234,linked_count:0,
  created_at:'2026-11-08T16:00:00Z',
  ...overrides
})
test('Only photos/video allowed within private bucket 25 MiB limit',()=>{
  assert.equal(CREATIVE_BUCKET,'nonna-creative-library')
  assert.equal(CREATIVE_MAX_BYTES,26214400)
  assert.equal(CREATIVE_MIME_TYPES['video/mp4'].kind,'video')
  assert.equal(creativeFileValidation(goodFile).extension,'jpg')
  assert.throws(()=>creativeFileValidation({name:'a.mov',type:'video/quicktime',size:5}),/Formato/)
  assert.throws(()=>creativeFileValidation({name:'a.heic',type:'image/heic',size:5}),/Formato/)
  assert.throws(()=>creativeFileValidation({name:'x.svg',type:'image/svg+xml',size:1}),/Formato/)
  assert.throws(()=>creativeFileValidation({...goodFile,size:26214401}),/grande/)
  assert.throws(()=>creativeFileValidation({...goodFile,size:0}),/grande/)
})
test('Files use random opaque per-upload UUID paths, never user-supplied filenames',()=>{
  assert.equal(creativeStoragePath(goodFile,uuid),'media/'+uuid+'.jpg')
  assert.throws(()=>creativeStoragePath(goodFile,'../../../bad-id'),/Identificador/)
})
test('Metadata rejects unverified rights marked cleared without explanation',()=>{
  const m=validateCreativeForm(metadata())
  assert.equal(m.rights_status,'cleared')
  assert.deepEqual(m.tags,['carbonara','pasta','reel'])
  assert.equal(creativeCanLink({...m,status:'active'}),true)
  assert.equal(creativeCanLink({...m,status:'archived'}),false)
  assert.equal(creativeCanLink({...m,status:'active',rights_status:'unverified'}),false)
  assert.throws(()=>validateCreativeForm({...metadata(),rights_note:'foto'}),/explica/)
  assert.throws(()=>validateCreativeForm({...metadata(),tags:'a,a'}),/repitas/)
  assert.throws(()=>validateCreativeForm({...metadata(),tags:'a,b,c,d,e,f,g,h,i'}),/ocho/)
  assert.throws(()=>validateCreativeForm({...metadata(),title:'A'}),/Título/)
})
test('Editing preserves optimistic revision and storage path cannot be changed',()=>{
  const form=assetForm(record())
  assert.equal(form.id,uuid)
  assert.equal(form.expected_revision,1)
  assert.equal(form.tags,'carbonara, pasta, reel')
  assert.ok(!('storage_path' in form))
  assert.ok(!('file_bytes' in form))
})
test('Library refuses truncated or malformed private records',()=>{
  assert.equal(validateCreativeList({ok:true,count:1,assets:[record()]}).length,1)
  assert.throws(()=>validateCreativeList({ok:true,count:2,assets:[record()]}),/incompleta/)
  assert.throws(()=>validateCreativeList({ok:true,count:2,assets:[record(),record()]}),/duplicado/)
  assert.throws(()=>validateCreativeList({ok:true,count:1,assets:[record({mime_type:'image/svg+xml'})]}),/inválido/)
  assert.throws(()=>validateCreativeList({ok:true,count:1,assets:[record({linked_count:-1})]}),/inválido/)
})
test('Storage bucket is private and RLS enforced for select, upload and cleanup',()=>{
  assert.match(sql,/'nonna-creative-library','nonna-creative-library',false,26214400/)
  assert.match(sql,/allowed_mime_types/)
  assert.match(sql,/CREATE POLICY creative_library_staff_select ON storage[.]objects/)
  assert.match(sql,/CREATE POLICY creative_library_staff_insert ON storage[.]objects/)
  assert.match(sql,/CREATE POLICY creative_library_staff_delete ON storage[.]objects/)
  assert.match(sql,/name ~ '\^media\//)
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public[.]analytics_creative_authorized[(][)] TO authenticated/)
  assert.match(sql,/r[.]role IN [(]'owner','admin'[)]/)
  assert.match(sql,/auth[.]role[(][)]='authenticated'/)
  assert.doesNotMatch(sql,/public=true|CREATE POLICY .+ TO anon/)
})
test('Metadata and links are private SQL tables with restricted RPCs',()=>{
  for(const t of ['analytics_creative_assets','analytics_creative_editorial_links','analytics_creative_audit']){
    assert.ok(sql.includes('CREATE TABLE public.'+t+'(')||sql.includes('CREATE TABLE public.'+t+' ('))
    assert.ok(sql.includes('ALTER TABLE public.'+t+' ENABLE ROW LEVEL SECURITY'))
  }
  for(const name of ['analytics_creative_list','analytics_creative_save',
    'analytics_creative_link','analytics_creative_month_links']){
    assert.ok(sql.includes('CREATE FUNCTION public.'+name+'('))
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+name+'('))
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.'+name+'('))
  }
  assert.equal((sql.match(/^CREATE FUNCTION public[.]analytics_creative_/gm)||[]).length,6)
  assert.equal((sql.match(/^AS [$][$]$/gm)||[]).length,6)
  assert.equal((sql.match(/^[$][$];$/gm)||[]).length,6)
  assert.doesNotMatch(sql,/^AS [$]$/m)
  assert.doesNotMatch(sql,/GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON public[.]analytics_creative_/)
})
test('Asset registration checks real uploaded storage object and MIME',()=>{
  assert.match(sql,/FROM storage[.]objects o/)
  assert.match(sql,/o[.]bucket_id='nonna-creative-library' AND o[.]name=v_path/)
  assert.match(sql,/o[.]metadata->>'mimetype'/)
  assert.match(sql,/o[.]metadata->>'size'/)
  assert.match(sql,/File missing from private Storage or unsupported type\/size/)
  assert.match(sql,/v_rights='cleared' AND char_length[(]v_rights_note[)]<12/)
  assert.match(sql,/v_old[.]revision<>v_revision/)
  assert.match(sql,/FOR UPDATE/)
  assert.match(sql,/INSERT INTO public[.]analytics_creative_audit/g)
})
test('Links need cleared rights and invalidate existing editorial approval',()=>{
  assert.match(sql,/Only active assets with verified usage rights can be linked/)
  assert.match(sql,/Maximum eight assets per editorial item/)
  assert.match(sql,/Published\/cancelled items cannot change asset links/)
  assert.match(sql,/analytics_creative_reset_editorial[(]p_editorial_id[)]/)
  assert.match(sql,/rights_checked=false/)
  assert.match(sql,/status='draft',approved_by=NULL,approved_at=NULL/)
  assert.match(sql,/IF [(]v_old[.]rights_status='cleared' AND v_new[.]rights_status<>'cleared'[)]/)
  assert.match(sql,/v_old[.]status='active' AND v_new[.]status='archived'/)
  assert.match(sql,/INSERT INTO public[.]analytics_editorial_audit/)
})
test('UI uploads without upsert, signs short-lived private previews and links to calendar',()=>{
  assert.match(ui,/\.upload\(path,file,\{upsert:false/)
  assert.match(ui,/\.createSignedUrl\(asset[.]storage_path,600\)/)
  assert.match(ui,/supabase[.]rpc\('analytics_creative_save'/)
  assert.match(ui,/supabase[.]rpc\('analytics_creative_list'/)
  assert.match(ui,/supabase[.]rpc\('analytics_creative_link'/)
  assert.match(ui,/supabase[.]rpc\('analytics_editorial_list'/)
  assert.match(ui,/p_unlink:unlink/)
  assert.match(ui,/\.remove\(\[path\]\)/)
  assert.match(ui,/No se ha podido registrar el archivo|No se pudo registrar el archivo/)
  assert.doesNotMatch(ui,/getPublicUrl|uploadSignedUrl|\.from\('reservations'\)/)
  assert.doesNotMatch(sql,/public[.]reservations|marketing_opt_in|telegram_bot_token/)
  assert.ok(analytics.includes("import CreativeLibrary from './CreativeLibrary.jsx'"))
  assert.ok(analytics.includes("activeTab === 'creative' ? <CreativeLibrary onNavigate={setActiveTab} />"))
})
test('Editorial calendar displays linked resource names and rights warnings',()=>{
  assert.match(calendar,/supabase[.]rpc\('analytics_creative_month_links'/)
  assert.match(calendar,/assets=\{assetLinks[.]filter/)
  assert.match(calendar,/rights_status!=='cleared'/)
  assert.match(calendar,/onOpenLibrary/)
  assert.match(calendar,/onNavigate[?][.]\('creative'\)/)
  assert.match(calendar,/Creative Library no está disponible/)
})
