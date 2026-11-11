import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { foodMenu } from '../data/foodMenu.js'
import { buildMenuFoodCost } from '../lib/menuFoodCost.mjs'
import { calculateCostScenario, joinWorkbookMenu } from '../lib/workbookCosts.mjs'
export default function WorkbookCostSummary({ setCurrentPage }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    supabase.rpc('manager_cost_load').then(({ data, error }) => {
      if (!active) return
      if (error || !data) setError('Costi Excel non caricati: apri Food cost per verificare la configurazione.')
      else setResult(data.body)
    }).catch(() => { if (active) setError('Impossibile caricare i costi.') })
    return () => { active = false }
  }, [])
  const rows = result ? joinWorkbookMenu(buildMenuFoodCost(foodMenu).rows, result) : []
  const scenario = result && calculateCostScenario(result.params)
  return <div className="dashboard-panel">
    <h3>Costi e obiettivi aggiornati</h3>
    {error ? <p role="alert">{error}</p> : !result ? <p>Caricamento costi…</p> : <>
      <p>{rows.filter(r => r.rawCost !== null).length} porzioni con stima approvata su {rows.length} in carta.</p>
      <p>Budget fisso mensile: <strong>{Number(result.params.fixed_monthly).toLocaleString('it-IT')} €</strong></p>
      {scenario && <p>Pareggio dello scenario: <strong>{scenario.breakEvenGross.toFixed(0)} € lordi/mese</strong>. Consuntivi e riconciliazione restano in Analytics.</p>}
    </>}
    <button className="primary-button" onClick={() => setCurrentPage('admin-food')}>Apri costi, margini e ipotesi</button>
  </div>
}
