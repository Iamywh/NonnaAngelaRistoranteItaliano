import React from 'react'

export default function Locale() {
  return (
    <section className="content-page">
      <p className="eyebrow">El restaurante</p>
      <h2>Un bistrot italiano con alma familiar</h2>
      <p>
        Nonna Angela nace para diferenciarse de los restaurantes italianos
        turísticos: menos confusión, más identidad, menos carta infinita y más
        control en cada plato.
      </p>

      <div className="info-grid">
        <article>
          <h3>Servicio</h3>
          <p>Acogida cálida, atención en mesa y explicación de los platos.</p>
        </article>

        <article>
          <h3>Cocina</h3>
          <p>
            Preparaciones organizadas, ragú, pastas, carnes y postres
            tradicionales italianos.
          </p>
        </article>

        <article>
          <h3>Experiencia</h3>
          <p>
            Platos sencillos, pero presentados y contados con valor.
          </p>
        </article>
      </div>
    </section>
  )
}