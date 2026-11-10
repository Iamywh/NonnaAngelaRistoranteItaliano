import React, { useState } from 'react'
import { foodMenu } from '../../data/foodMenu.js'
import { buildMenuFoodCost } from '../../lib/menuFoodCost.mjs'

const report = buildMenuFoodCost(foodMenu)
const money = value => value === null ? 'Da completare' : value.toFixed(2) + '€'
const percent = value => value === null ? '—' : value.toFixed(1) + '%'
const variants = { medio: 'Media', entero: 'Intera' }

export default function FoodDashboard({ setCurrentPage, initialFilter = 'all' }) {
  const [filter, setFilter] = useState(initialFilter)
  const rows = report.rows.filter(row => {
    if (filter === 'missing') return row.estimatedCost === null
    if (filter === 'costed') return row.estimatedCost !== null
    if (filter === 'high') return row.estimatedCostPercent !== null && row.estimatedCostPercent >= 30
    return true
  })

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')} type="button">
        ← Torna alla dashboard
      </button>
      <p className="eyebrow">Food control</p>
      <h2>Food cost della carta attuale</h2>
      <p className="page-intro">
        {report.dishesWithCost} piatti con stima di costo su {report.dishCount}. Prezzi e costi provengono
        dalle schede della carta. I costi delle ricette sono stime da verificare con grammature e fatture aggiornate.
      </p>
      <p>
        Il costo operativo include le maggiorazioni presenti nelle schede. Il residuo prezzo meno costo
        precede costi fissi e riconciliazione fiscale. Il risultato del ristorante è in Backoffice → Analytics.
      </p>
      <label>Mostra
        <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">Tutta la carta</option>
          <option value="costed">Con costo stimato</option>
          <option value="missing">Costo da completare</option>
          <option value="high">Costo operativo dal 30% del prezzo</option>
        </select>
      </label>
      <div className="data-table">
        <div className="data-row table-head">
          <span>Piatto / porzione</span>
          <span>Prezzo carta</span>
          <span>Costo ingredienti stimato</span>
          <span>Costo operativo stimato</span>
          <span>Incidenza ingredienti / operativo</span>
          <span>Prezzo meno costo operativo</span>
        </div>
        {rows.map(row => (
          <div className="data-row" key={row.id}>
            <span>{row.name}{row.variant ? ' · ' + (variants[row.variant] || row.variant) : ''}</span>
            <span>{money(row.price)}</span>
            <span>{money(row.rawCost)}</span>
            <span>{money(row.estimatedCost)}</span>
            <span>{percent(row.rawFoodCostPercent)} / {percent(row.estimatedCostPercent)}</span>
            <span>{money(row.priceMinusEstimatedCost)}</span>
          </div>
        ))}
      </div>
      {rows.length === 0 && <p>Nessun piatto per questo filtro.</p>}
    </section>
  )
}
