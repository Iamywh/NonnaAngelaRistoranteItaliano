import React from 'react'
import KpiCard from '../../components/KpiCard.jsx'

export default function AdminDashboard() {
  return (
    <section className="admin-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Admin control</p>
          <h2>Dashboard manageriale</h2>
          <p>
            Centro di controllo per food cost, beverage, ordini, menu engineering
            e decisioni operative.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Food cost medio" value="~13%" detail="Stima attuale menu" tone="good" />
        <KpiCard label="Piatti completi" value="22+" detail="Costing collegato" />
        <KpiCard label="Alert attivi" value="4" detail="Da validare con Manu" tone="warning" />
        <KpiCard label="Margine medio" value="Alto" detail="Prezzi Manu sostenibili" tone="good" />
      </div>

      <div className="admin-grid">
        <button className="admin-module">
          <span>Food</span>
          <strong>Food cost, fornitori cucina, ordini food</strong>
        </button>

        <button className="admin-module">
          <span>Beverage</span>
          <strong>Vini, soft drink, liquori, ordini bar</strong>
        </button>

        <button className="admin-module">
          <span>F&amp;B Control</span>
          <strong>Menu completo, margini, alert, riserve e takeaway futuri</strong>
        </button>

        <button className="admin-module">
          <span>Reports</span>
          <strong>Trend, storico ordini, export e analisi manageriale</strong>
        </button>
      </div>
    </section>
  )
}