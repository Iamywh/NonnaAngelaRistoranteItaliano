import React from 'react'

export default function BeverageDashboard({ setCurrentPage }) {
  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')}>
        ← Torna alla dashboard
      </button>

      <p className="eyebrow">Beverage control</p>
      <h2>Beverage dashboard</h2>
      <p className="page-intro">
        Qui gestiremo vini, cocktail, soft drinks, liquori, fornitori beverage e ordini bar.
      </p>

      <div className="admin-grid">
        <article className="dashboard-panel">
          <h3>Vini</h3>
          <p>Lista vini, prezzo bottiglia, prezzo calice e margini.</p>
        </article>

        <article className="dashboard-panel">
          <h3>Bar inventory</h3>
          <p>Soft drinks, liquori, ingredienti cocktail e prodotti finiti.</p>
        </article>

        <article className="dashboard-panel">
          <h3>Ordine beverage</h3>
          <p>Formulario ordine bar: prodotto, quantità, fornitore e note.</p>
        </article>

        <article className="dashboard-panel">
          <h3>Storico beverage</h3>
          <p>Spesa settimanale, trend e forecast futuri.</p>
        </article>
      </div>
    </section>
  )
}