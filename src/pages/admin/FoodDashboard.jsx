import '../../styles/costs-procurement.css'
import React, { useEffect, useState } from 'react'
import { foodMenu } from '../../data/foodMenu.js'
import { buildMenuFoodCost } from '../../lib/menuFoodCost.mjs'
import { calculateCostScenario, joinWorkbookMenu } from '../../lib/workbookCosts.mjs'
import { supabase } from '../../lib/supabaseClient.js'
const menu = buildMenuFoodCost(foodMenu)
const euro = n => n == null ? 'Da completare' : Number(n).toFixed(2) + ' €'
const fields = [
  ['fixed_monthly','Budget fisso mensile (€)'],['covers','Coperti previsti al mese'],
  ['dishes_per_cover','Piatti medi per coperto'],['kitchen_share','Quota fissi cucina (0–0,99)'],
  ['tax_rate','IGIC ipotizzato (0,07 = 7%)'],['raw_target','Target materie prime (0,25 = 25%)'],
  ['margin_target','Target residuo operativo (0,10 = 10%)'],['open_days','Giorni aperti'],['ticket','Ticket lordo medio (€)']
]
export default function FoodDashboard({ setCurrentPage, initialFilter = 'all' }) {
  const [record, setRecord] = useState(null)
  const [filter, setFilter] = useState(initialFilter)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const load = async () => {
    setBusy(true); setError('')
    try {
      const { data, error } = await supabase.rpc('manager_cost_load')
      if (error || !data) throw error || new Error('Applica le migrazioni dei costi Excel.')
      setRecord(data); setDirty(false)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const change = fn => { setDirty(true); setMessage(''); setRecord(r => ({ ...r, body: fn(r.body) })) }
  const save = async () => {
    if (!calculateCostScenario(record.body.params)) { setError('Controlla le ipotesi: i target sommati devono essere inferiori a 1.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const params = Object.fromEntries(Object.entries(record.body.params).map(([k,v]) => [k,Number(v)]))
      const rows = record.body.rows.map(r => ({ id:r.id,raw_cost:r.raw_cost,approved:r.approved }))
      const { data,error } = await supabase.rpc('manager_cost_save',{p_version:record.version,p_params:params,p_rows:rows})
      if (error) throw error
      setRecord(data); setDirty(false); setMessage('Costi e ipotesi salvati e condivisi.')
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  const model = record?.body
  const scenario = model && calculateCostScenario(model.params)
  const rows = model ? joinWorkbookMenu(menu.rows,model) : []
  const filtered = rows.filter(r => filter==='missing' ? r.rawCost===null : filter==='costed' ? r.rawCost!==null : filter==='high' ? r.rawFoodCostPercent>=30 : true)
  return <section className="admin-page costs-procurement-page">
    <button className="back-button" disabled={busy} onClick={() => { if (!dirty || window.confirm('Uscire senza salvare le modifiche?')) setCurrentPage('admin') }}>← Dashboard</button>
    <h2>Food cost, margini e budget</h2>
    <p>Stime Excel del 10/11/2026 confrontate con i prezzi della carta attuale. I prezzi pubblici restano quelli della carta.</p>
    {error && <p role="alert" className="manager-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button onClick={() => { if (!dirty || window.confirm('Ricaricare e perdere le modifiche?')) load() }} disabled={busy}>Ricarica dati</button>
    {!model ? <p>{busy ? 'Caricamento…' : 'Costi non disponibili.'}</p> : <>
      <div className="dashboard-panel">
        <h3>Ipotesi mensili</h3>
        <p>Base Excel: personale {euro(model.source_fixed.staff)}, luce {euro(model.source_fixed.electricity)}, acqua {euro(model.source_fixed.water)}, affitto {euro(model.source_fixed.rent)} = {euro(model.source_fixed.total)}.</p>
        <p>Differenza rispetto alla base Excel: {euro(Number(model.params.fixed_monthly)-model.source_fixed.total)} da ripartire. Non sono nuove spese registrate.</p>
        <div className="order-form">{fields.map(([key,label]) => <label key={key}>{label}<input type="number" step="any" min="0" value={model.params[key]} disabled={busy}
          onChange={e => change(b => ({...b,params:{...b.params,[key]:e.target.value}}))}/></label>)}</div>
        {scenario ? <div className="kpi-grid compact">
          {[
            ['Pareggio lordo / mese',euro(scenario.breakEvenGross)],['Coperti al giorno al pareggio',scenario.breakEvenCoversPerDay.toFixed(1)],
            ['Incasso lordo per il target',euro(scenario.targetGross)],['Quota fissi / piatto',euro(scenario.allocatedPerDish)],
            ['Residuo mensile simulato',euro(scenario.operatingResidual)]
          ].map(([label,value]) => <article className="kpi-card" key={label}><p>{label}</p><strong>{value}</strong></article>)}
        </div> : <p role="alert">Ipotesi non valide.</p>}
        <p>Il pareggio usa il target materie prime sull'intero incasso netto; verifica anche il mix bevande e gli altri costi variabili. Il budget fisso è un importo convenzionale: qui non viene detratto IGIC dalle spese. IGIC sulle vendite, coperti, ticket e quota cucina sono ipotesi modificabili. Il residuo non è l'utile netto.</p>
        <p>La quota fissi per piatto è una ripartizione gestionale: non sommarla di nuovo ai costi mensili. I consuntivi, le spese effettive e il piano mensile restano in Backoffice → Analytics.</p>
      </div>
      <label>Mostra <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tutta la carta</option><option value="costed">Con stima approvata</option><option value="missing">Da completare / verificare</option><option value="high">Food cost dal 30% netto</option></select></label>
      <div style={{overflowX:'auto'}}><table><thead><tr>{['Piatto','Carta lorda','Prezzo Excel','Raw','FC su netto','Contributo prima dei fissi','Dopo quota fissi'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>
        {filtered.map(r=><tr key={r.id}><td>{r.name} {r.variant || ''}{r.rawCost===null && <small> · da verificare</small>}</td><td>{euro(r.price)}</td><td>{euro(r.source?.source_price)}</td><td>{euro(r.rawCost)}</td><td>{r.rawFoodCostPercent===null?'—':r.rawFoodCostPercent.toFixed(1)+'%'}</td><td>{euro(r.contribution)}</td><td>{euro(r.afterAllocation)}</td></tr>)}
      </tbody></table></div>
      <div className="dashboard-panel"><h3>Schede e verifiche ricette</h3>
        <p>{model.rows.filter(r=>r.source_row).length} schede Excel. Le ricette differenti non vengono applicate finché non le confermi. Le schede fuori carta restano consultabili.</p>
        {model.rows.map(row=><details key={row.id}><summary>{row.name} {row.variant || ''} · {row.approved?'approvata':'da verificare'}</summary>
          <p>{row.source_row ? `Excel: ${model.source_sheet}, riga ${row.source_row}. Affidabilità originale: ${row.confidence}.` : 'Scheda della carta senza costo Excel.'}</p>
          <p>{row.notes}</p>{row.source_row && <p>Costo base: {euro(row.base_cost)} · correzione: {euro(row.correction)} · extra mercato: {euro(row.market_extra)}.</p>}{row.review && <p><strong>{row.review}</strong></p>}
          <p>Collegamento carta: {menu.rows.find(r=>r.id===row.menu_key)?.name || 'Fuori carta / nessun collegamento'} {row.menu_key?.split(':')[1] || ''}</p>
          <label>Costo ingredienti per porzione (€)<input type="number" step="0.0001" min="0" max="10000" disabled={busy} value={row.raw_cost ?? ''}
            onChange={e=>change(b=>({...b,rows:b.rows.map(r=>r.id===row.id?{...r,raw_cost:e.target.value===''?null:Number(e.target.value),approved:false}:r)}))}/></label>
          <label><input type="checkbox" disabled={busy || !row.menu_key || row.raw_cost===null} checked={row.approved}
            onChange={e=>change(b=>({...b,rows:b.rows.map(r=>r.id===row.id?{...r,approved:e.target.checked}:r)}))}/>Confermo che costo e ricetta corrispondono al piatto in carta</label>
          {row.edited_at && <p>Ultima revisione: {new Date(row.edited_at).toLocaleString()}</p>}
        </details>)}
      </div>
      <button className="primary-button" disabled={busy || !dirty || !scenario} onClick={save}>{busy?'Salvataggio…':'Salva costi e ipotesi'}</button>
      {dirty && <p role="status">Modifiche non salvate.</p>}
      <details><summary>Fonti e priorità di verifica originali</summary><p>{model.source_files.join(' · ')}</p>
        {[...model.sources,...model.verification].filter(r=>r.some(Boolean)).map((r,i)=><p key={i}>{r.filter(v=>v!==null).join(' · ')}</p>)}
      </details>
    </>}
  </section>
}
