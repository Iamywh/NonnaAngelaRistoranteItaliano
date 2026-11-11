import '../../styles/costs-procurement.css'
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
const labels = {pending:'Da inviare',sending:'Invio avviato: verifica Telegram prima di ripetere',sent:'Inviata a Telegram',failed:'Invio fallito: puoi riprovare',uncertain:'Esito incerto: verifica Telegram, invio automatico bloccato'}
const draftKey = id => 'nonna_order_draft_v2:' + id
const emptyDraft = () => ({ id:crypto.randomUUID(),lines:[],submitted:false })
function readDraft(id) {
  try {
    const d=JSON.parse(localStorage.getItem(draftKey(id)))
    return d && typeof d.id==='string' && Array.isArray(d.lines) ? d : emptyDraft()
  } catch { return emptyDraft() }
}
const nullable = v => v==='' || v==null ? null : Number(v)
function ProductRow({ product, suppliers, isAdmin, busy, onSave, onOrder }) {
  const [form,setForm]=useState(product)
  const [dirty,setDirty]=useState(false)
  useEffect(()=>{setForm(product);setDirty(false)},[product])
  const field=(key,value)=>{setDirty(true);setForm(f=>({...f,[key]:value}))}
  return <tr>
    <td>{product.name}<small style={{display:'block'}}>{product.unit} · {suppliers.find(s=>s.id===product.supplier)?.name || 'Fornitore da definire'}</small></td>
    <td>{product.area==='food' ? <input aria-label={'Giacenza '+product.name} type="number" min="0" step="any" value={form.quantity??''} disabled={busy} placeholder="Non contata" onChange={e=>field('quantity',e.target.value)}/> : 'Vedi inventario bevande'}</td>
    <td>{product.area==='food' ? <input aria-label={'Scorta minima '+product.name} type="number" min="0" step="any" value={form.minimum??''} disabled={busy} placeholder="Non definita" onChange={e=>field('minimum',e.target.value)}/> : '—'}</td>
    <td>{isAdmin ? <><select aria-label={'Fornitore '+product.name} value={form.supplier || ''} disabled={busy} onChange={e=>field('supplier',e.target.value || null)}>
      <option value="">Da definire</option>{form.supplier && !suppliers.some(s=>s.id===form.supplier) && <option value={form.supplier}>{form.supplier} · da verificare</option>}
      {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select><input aria-label={'Costo unitario '+product.name} type="number" min="0" step="any" value={form.unit_cost??''} disabled={busy} placeholder="€/unità non disponibile" onChange={e=>field('unit_cost',e.target.value)}/></> : <span>{product.unit_cost==null?'Costo da completare':Number(product.unit_cost).toFixed(2)+' €/'+product.unit}</span>}
      <small style={{display:'block'}}>{product.cost_source || 'Senza costo unitario verificato'}</small></td>
    <td><button disabled={busy || !dirty} onClick={()=>onSave(form)}>Salva inventario</button>{dirty && <small> · non salvato</small>}<small style={{display:'block'}}>{product.notes}</small>{product.updated_at && <small style={{display:'block'}}>Salvato: {new Date(product.updated_at).toLocaleString()}</small>}
      <button disabled={busy || dirty || product.quantity==null || product.minimum==null || product.minimum<=product.quantity} onClick={()=>onOrder(product,product.minimum-product.quantity)}>Aggiungi mancante all'ordine</button>
    </td>
  </tr>
}
export default function Orders({setCurrentPage,userId,isAdmin=false}) {
  const [catalog,setCatalog]=useState(null)
  const [history,setHistory]=useState([])
  const [draft,setDraft]=useState(()=>readDraft(userId))
  const [legacy]=useState(()=>{try{const rows=JSON.parse(localStorage.getItem('nonna_angela_order_history'));return Array.isArray(rows)?rows:[]}catch{return[]}})
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [tab,setTab]=useState('orders')
  const [area,setArea]=useState('food')
  const [supplier,setSupplier]=useState('all')
  const [query,setQuery]=useState('')
  const [productId,setProductId]=useState('')
  const [quantity,setQuantity]=useState('1')
  const [notes,setNotes]=useState('')
  const [lowOnly,setLowOnly]=useState(false)
  const [newSupplier,setNewSupplier]=useState('')
  const [historySupplier,setHistorySupplier]=useState('all')
  const [historyMonth,setHistoryMonth]=useState('')
  const persist = next => {
    try { localStorage.setItem(draftKey(userId),JSON.stringify(next));setDraft(next);return true }
    catch {setError('Impossibile conservare la bozza sul dispositivo. Abilita la memoria del browser prima di inviare.');return false}
  }
  const load = async () => {
    setLoading(true);setError('')
    try {
      const [c,h]=await Promise.all([supabase.rpc('procurement_load'),supabase.rpc('procurement_order_list')])
      if(c.error || h.error) throw c.error || h.error
      setCatalog(c.data);setHistory(h.data || [])
    } catch(e){setError('Caricamento non riuscito: '+e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])
  const products = useMemo(()=>(catalog?.products||[]).filter(p=>(tab==='inventory'?p.area==='food':p.area===area) && (supplier==='all'||p.supplier===supplier) && p.name.toLowerCase().includes(query.toLowerCase()) && (!lowOnly || (p.quantity!=null && p.minimum!=null && p.quantity<p.minimum))),[catalog,tab,area,supplier,query,lowOnly])
  const selected=products.find(p=>p.id===productId)||products[0]
  const supplierName = id => catalog?.suppliers.find(s=>s.id===id)?.name || id
  const add = (p,q,n='') => {
    if(draft.submitted || !p || !Number.isFinite(Number(q)) || Number(q)<=0 || Number(q)>1000000) {setError('Controlla prodotto e quantità positiva.');return}
    if(draft.lines.length>=100){setError('Massimo 100 righe per ordine.');return}
    if(!catalog.suppliers.some(s=>s.id===p.supplier)){setError('Un amministratore deve assegnare il fornitore a '+p.name);return}
    if(persist({...draft,lines:[...draft.lines,{product_id:p.id,quantity:Number(q),notes:n.slice(0,500)}]})){setError('');setMessage('Riga aggiunta alla bozza.');setQuantity('1');setNotes('')}
  }
  const notify = async order => {
    const {data,error}=await supabase.functions.invoke('orders-telegram-notify',{body:{order_id:order.id}})
    if(error || data?.error) {
      let detail=data?.error
      try { detail=detail || (await error.context.json()).error } catch { /* transport error */ }
      throw new Error(detail || 'Notifica non riuscita. L’ordine resta salvato: aggiorna lo storico per verificarne lo stato.')
    }
    setHistory(h=>h.map(o=>o.id===order.id?{...o,notification:data.state}:o))
    return data.state
  }
  const save = async () => {
    if(!draft.lines.length || busy || loading || !catalog)return
    const frozen={...draft,submitted:true}
    if(!persist(frozen))return
    setBusy(true);setError('');setMessage('')
    let saved=false
    try {
      const {data,error}=await supabase.rpc('procurement_order_create',{p_id:frozen.id,p_lines:frozen.lines})
      if(error) {
        // A raised SQL validation error means the whole transaction rolled back.
        if(error.code==='P0001')persist({...frozen,submitted:false})
        throw error
      }
      saved=true
      setHistory(h=>[data,...h.filter(o=>o.id!==data.id)])
      persist(emptyDraft())
      setMessage('Ordine salvato nello storico condiviso. Invio della notifica…')
      const state=await notify(data)
      setMessage('Ordine salvato. '+(labels[state]||state)+'. È una richiesta interna a Manu; nessun invio al fornitore e nessun carico automatico di magazzino.')
    }catch(e){setError((saved?'Ordine salvato. ':'')+e.message)}finally{setBusy(false)}
  }
  const retry = async order => {
    setBusy(true);setError('');setMessage('')
    try{const state=await notify(order);setMessage(labels[state]||state)}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const saveProduct = async p => {
    setBusy(true);setError('');setMessage('')
    try {
      const {data,error}=await supabase.rpc('procurement_product_save',{p_id:p.id,p_version:p.version,p_quantity:nullable(p.quantity),p_minimum:nullable(p.minimum),p_supplier:p.supplier || null,p_unit_cost:nullable(p.unit_cost)})
      if(error)throw error
      setCatalog(c=>({...c,products:c.products.map(x=>x.id===data.id?data:x)}));setMessage('Inventario salvato: '+data.name)
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const addSupplier = async () => {
    setBusy(true);setError('')
    try {
      const {data,error}=await supabase.rpc('procurement_supplier_create',{p_name:newSupplier})
      if(error)throw error
      setCatalog(c=>({...c,suppliers:[...c.suppliers,data]}));setNewSupplier('');setMessage('Fornitore aggiunto; assegnalo ai prodotti.')
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const exportJson = order => {
    const url=URL.createObjectURL(new Blob([JSON.stringify(order,null,2)],{type:'application/json'}))
    const a=document.createElement('a');a.href=url;a.download=order.orderNumber+'.json';a.click();URL.revokeObjectURL(url)
  }
  const exportPdf = order => {
    const pdf=new jsPDF();pdf.setFontSize(16);pdf.text('Nonna Angela · richiesta ordine',14,20)
    pdf.setFontSize(10);pdf.text(order.orderNumber+' · '+new Date(order.createdAt).toLocaleString(),14,30)
    autoTable(pdf,{startY:40,head:[['Prodotto','Quantità','Unità','Fornitore','Note']],body:order.lines.map(l=>[l.product,l.quantity,l.unit,l.supplierName || supplierName(l.supplier),l.notes||''])})
    pdf.save(order.orderNumber+'.pdf')
  }
  return <section className="admin-page costs-procurement-page">
    <button className="back-button" disabled={busy} onClick={()=>setCurrentPage('admin')}>← Dashboard</button>
    <h2>Ordini e inventario ingredienti</h2>
    <p>Richieste interne condivise con Manu. Ogni ordine rimane salvato anche se Telegram non è disponibile. Il conteggio bevande resta in Inventario bevande; qui trovi gli ingredienti cucina e il catalogo per gli ordini.</p>
    {error && <p role="alert" className="manager-error">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="order-actions"><button disabled={busy} onClick={()=>setTab('orders')}>Ordini</button><button disabled={busy} onClick={()=>setTab('inventory')}>Inventario ingredienti</button>{isAdmin && <button disabled={busy} onClick={()=>setTab('catalog')}>Fornitori e prodotti</button>}<button disabled={busy || loading} onClick={()=>{if(window.confirm('Ricaricare? Eventuali modifiche inventario non salvate verranno perse.'))load()}}>Ricarica dati salvati</button></div>
    <p>Ricaricare aggiorna anche le righe inventario: salva prima le modifiche.</p>
    {loading && <p>Caricamento…</p>}
    {catalog && <>
      <fieldset disabled={busy || loading} className="order-form">
        {tab!=='inventory' && <label>Reparto<select value={area} onChange={e=>{setArea(e.target.value);setProductId('')}}><option value="food">Cucina</option><option value="beverage">Bar</option></select></label>}
        <label>Fornitore<select value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="all">Tutti</option>{catalog.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Cerca prodotto<input value={query} onChange={e=>setQuery(e.target.value)}/></label>
        {tab==='inventory' && <label><input type="checkbox" checked={lowOnly} onChange={e=>setLowOnly(e.target.checked)}/>Solo sotto scorta minima</label>}
      </fieldset>
      {tab!=='orders' ? <>
        <p>Vuoto = non contato, 0 = giacenza zero. Quantità espresse nell'unità del catalogo, non in colli. Le scorte sono conteggi operativi: non sostituiscono la valorizzazione mensile in Analytics.</p>
        <p>I costi unitari provengono dal catalogo esistente o da inserimenti manuali; non sono ricavati dalle stime dei piatti. Prezzi e base fiscale vanno verificati con le fatture.</p>
        <div style={{overflowX:'auto'}}><table><thead><tr><th>Ingrediente / unità</th><th>Giacenza</th><th>Minimo</th><th>Fornitore / costo unitario</th><th>Azioni</th></tr></thead><tbody>
          {products.map(p=><ProductRow key={p.id} product={p} suppliers={catalog.suppliers} isAdmin={isAdmin} busy={busy||loading} onSave={saveProduct} onOrder={add}/>)}</tbody></table></div>
        {isAdmin && <div className="dashboard-panel"><h3>Aggiungi fornitore</h3><input maxLength={120} aria-label="Nome nuovo fornitore" value={newSupplier} onChange={e=>setNewSupplier(e.target.value)}/><button disabled={busy || !newSupplier.trim()} onClick={addSupplier}>Salva fornitore</button></div>}
      </> : <>
        <form className="order-form" onSubmit={e=>{e.preventDefault();add(selected,quantity,notes)}}>
          <fieldset disabled={busy||loading||draft.submitted}>
            <label>Prodotto<select value={selected?.id||''} onChange={e=>setProductId(e.target.value)}>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.unit} · {supplierName(p.supplier)}</option>)}</select></label>
            <label>Quantità ({selected?.unit||'unità'})<input type="number" min="0.001" max="1000000" step="any" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
            <label>Note<input maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
            <button type="submit" disabled={!selected}>Aggiungi riga</button>
          </fieldset>
        </form>
        <h3>Bozza su questo dispositivo · {draft.lines.length} righe</h3>
        {draft.submitted && <p role="alert">Richiesta già avviata: riprova il salvataggio con lo stesso identificativo per verificarne l'esito senza duplicare l'ordine.</p>}
        {draft.lines.map((l,i)=><p key={i}>{catalog.products.find(p=>p.id===l.product_id)?.name || l.product_id} · {l.quantity} {catalog.products.find(p=>p.id===l.product_id)?.unit} · {l.notes}
          <button disabled={busy||draft.submitted} onClick={()=>persist({...draft,lines:draft.lines.filter((_,j)=>j!==i)})}>Rimuovi</button></p>)}
        <button className="primary-button" disabled={busy||loading||!draft.lines.length} onClick={save}>{busy?'Salvataggio e invio…':draft.submitted?'Verifica / riprova salvataggio':'Salva ordine e notifica Manu'}</button>
        <p>L'invio a Telegram è un avviso interno. La conferma al fornitore e la registrazione della merce ricevuta restano operazioni distinte.</p>
      </>}
      <h3>Storico condiviso · ultimi 100 ordini</h3>
      <div className="order-form"><label>Fornitore storico<select value={historySupplier} onChange={e=>setHistorySupplier(e.target.value)}><option value="all">Tutti</option>{catalog.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Mese<input type="month" value={historyMonth} onChange={e=>setHistoryMonth(e.target.value)}/></label></div>
      {history.filter(o=>(historySupplier==='all'||o.suppliers.includes(historySupplier))&&(!historyMonth||o.createdAt.slice(0,7)===historyMonth)).map(o=><details key={o.id} className="dashboard-panel"><summary>{o.orderNumber} · {new Date(o.createdAt).toLocaleString()} · {labels[o.notification]||o.notification}</summary>
        {o.lines.map((l,i)=><p key={i}>{l.product} · {l.quantity} {l.unit} · {l.supplierName || supplierName(l.supplier)} · {l.notes}</p>)}
        <button onClick={()=>exportJson(o)}>JSON</button><button onClick={()=>exportPdf(o)}>PDF</button>
        {['pending','failed'].includes(o.notification) && <button disabled={busy} onClick={()=>retry(o)}>Invia / riprova Telegram</button>}
      </details>)}
    </>}
    {legacy.length>0 && <details><summary>Ordini precedenti salvati solo su questo dispositivo ({legacy.length})</summary><p>Archivio locale conservato: non è stato notificato né importato automaticamente nello storico condiviso.</p>{legacy.map((o,i)=><p key={o.id||i}>{o.orderNumber}<button onClick={()=>exportJson(o)}>Esporta JSON</button><button onClick={()=>exportPdf(o)}>PDF</button></p>)}</details>}
  </section>
}
