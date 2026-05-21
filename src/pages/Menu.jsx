import React from 'react'

export default function Menu() {
  const sections = [
    'Antipasti',
    'Primi piatti',
    'Secondi piatti',
    'Contorni',
    'Dolci',
    'Vini e cocktail'
  ]

  return (
    <section className="content-page">
      <p className="eyebrow">Menu</p>
      <h2>Una carta corta, controllata e redditizia</h2>
      <p>
        Il menu sarà collegato ai dati di costing, margine e controllo operativo.
        Per ora questa è la base visuale pubblica.
      </p>

      <div className="menu-section-grid">
        {sections.map((section) => (
          <article key={section} className="menu-section-card">
            <h3>{section}</h3>
            <p>Visualizzazione dettagliata in arrivo.</p>
          </article>
        ))}
      </div>
    </section>
  )
}