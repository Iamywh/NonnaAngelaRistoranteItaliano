import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
test('Alertas loads two months, renders missing data, refreshes and handles rejection', async () => {
 const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost'})
 global.window=dom.window;global.document=dom.window.document
 global.IS_REACT_ACT_ENVIRONMENT=true
 const React=await import('react');const {createRoot}=await import('react-dom/client')
 const requests=[];let reject=false
 global.__alertsMock={from(table){const q={select(){return q},gte(k,v){requests.push([table,k,v]);return q},lt(){return q},order(){return q},limit(){return reject?Promise.reject(Error('offline')):Promise.resolve({data:[],error:null})}};return q}}
 const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom',plugins:[{name:'mock-data',enforce:'pre',transform(code,id){
  if(id.endsWith('/src/lib/supabaseClient.js'))return 'export const supabase = globalThis.__alertsMock'
  if(id.endsWith('/src/pages/admin/ManagementAlerts.jsx'))return code.replace('useState(canaryMonth)',"useState('2027-01')")
 }}]})
 const root=createRoot(document.getElementById('root'))
 try{
  const {default:Alerts}=await server.ssrLoadModule('/src/pages/admin/ManagementAlerts.jsx')
  await React.act(async()=>{root.render(React.createElement(Alerts));})
  assert.equal(requests.length,6);assert.equal(requests[0][2],'2026-12-01')
  assert.doesNotMatch(document.body.textContent,/Selecciona un mes válido/)
  assert.equal(document.querySelector('[role="status"]'),null)
  const refresh=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Actualizar desde'))
  await React.act(async()=>refresh.click());assert.equal(requests.length,12)
  reject=true
  await React.act(async()=>refresh.click())
  assert.match(document.querySelector('[role="alert"]').textContent,/No se pudieron/)
 }finally{await React.act(async()=>root.unmount());await server.close();dom.window.close();delete global.window;delete global.document;delete global.__alertsMock;delete global.IS_REACT_ACT_ENVIRONMENT}
})
