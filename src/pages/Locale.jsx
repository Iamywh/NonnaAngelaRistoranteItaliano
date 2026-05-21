import React from 'react'

export default function Locale() {
  return (
    <section className="content-page">
      <p className="eyebrow">Il locale</p>
      <h2>Un bistrot italiano con anima di famiglia</h2>
      <p>
        Nonna Angela nasce per distinguersi dai ristoranti italiani turistici:
        meno confusione, più identità, meno menu infinito, più controllo.
      </p>

      <div className="info-grid">
        <article>
          <h3>Servizio</h3>
          <p>Accoglienza calda, attenzione al tavolo e racconto dei piatti.</p>
        </article>
        <article>
          <h3>Cucina</h3>
          <p>Preparazioni organizzate, ragù, paste, carni e dolci tradizionali.</p>
        </article>
        <article>
          <h3>Esperienza</h3>
          <p>Piatti semplici, ma presentati e raccontati con valore.</p>
        </article>
      </div>
    </section>
  )
}