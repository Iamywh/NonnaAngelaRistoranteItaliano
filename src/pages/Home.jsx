import React from 'react'

export default function Home({ setCurrentPage }) {
  const goToReservations = () => {
    setCurrentPage('locale')
    setTimeout(() => {
      document.getElementById('reservas')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

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
            onClick={goToReservations}
          >
            Reserva una mesa
          </button>

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
        <p>HORARIO</p>
        <div className="hero-hours">
          <div>
            <strong>Lunes</strong>
            <span>Cerrado</span>
          </div>
          <div>
            <strong>Martes</strong>
            <span>12:30–15:30 / 19:30–22:45</span>
          </div>
          <div>
            <strong>Miércoles</strong>
            <span>12:30–15:30 / 19:30–22:45</span>
          </div>
          <div>
            <strong>Jueves</strong>
            <span>12:30–15:30 / 19:30–22:45</span>
          </div>
          <div>
            <strong>Viernes</strong>
            <span>12:30–15:30 / 19:30–23:00</span>
          </div>
          <div>
            <strong>Sábado</strong>
            <span>12:30–15:30 / 19:30–23:00</span>
          </div>
          <div>
            <strong>Domingo</strong>
            <span>12:30–16:00</span>
          </div>
        </div>
        <span>Te recomendamos reservar.</span>
        <button className="ghost-button" type="button" onClick={goToReservations}>
          Reservar mesa
        </button>
      </div>
    </section>
  )
}
