import React from 'react'

export default function Home({ setCurrentPage }) {
  return (
    <section className="hero-page">
      <div className="hero-copy">
        <p className="eyebrow">Cocina italiana auténtica</p>
        <h2>Nonna Angela</h2>
        <p>
          Un restaurante italiano creado alrededor de recetas sinceras,
          servicio cuidado y platos que hablan de casa, domingo y tradición.
        </p>

        <div className="hero-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => setCurrentPage('menu')}
          >
            Ver el menú
          </button>

          <button
            className="ghost-button"
            type="button"
            onClick={() => setCurrentPage('locale')}
          >
            Descubre el restaurante
          </button>
        </div>
      </div>

      <div className="hero-card">
        <p>Plato signature</p>
        <h3>Paccheri al ragù napoletano</h3>
        <span>Ragú lento, receta de casa, identidad del sur de Italia.</span>
      </div>
    </section>
  )
}