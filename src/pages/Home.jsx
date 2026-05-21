import React from 'react'

export default function Home() {
  return (
    <section className="hero-page">
      <div className="hero-copy">
        <p className="eyebrow">Cucina italiana autentica</p>
        <h2>Nonna Angela</h2>
        <p>
          Un ristorante italiano costruito intorno a ricette sincere, servizio curato
          e piatti che raccontano casa, domenica e tradizione.
        </p>

        <div className="hero-actions">
          <button className="primary-button">Vedi il menu</button>
          <button className="ghost-button">Scopri il locale</button>
        </div>
      </div>

      <div className="hero-card">
        <p>Signature</p>
        <h3>Paccheri al ragù napoletano</h3>
        <span>Ragù lento, ricetta di casa, identità del Sud.</span>
      </div>
    </section>
  )
}