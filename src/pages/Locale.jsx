import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const menuStory =
  'En Italia, las mejores recetas no nacen en los restaurantes, sino alrededor de una mesa familiar. En Nonna Angela queremos compartir precisamente esa tradición: platos preparados con tiempo, ingredientes seleccionados y el cariño de la cocina de casa. Nuestra propuesta está inspirada en los sabores que han acompañado a generaciones de familias italianas: pastas artesanales, salsas cocinadas lentamente, embutidos, quesos y vinos cuidadosamente elegidos para acompañar cada momento. Más que un restaurante, queremos ser un lugar donde disfrutar sin prisas, compartir, brindar y sentirse como en casa. Benvenuti a Nonna Angela.'

const initialReservation = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  reservation_date: '',
  reservation_time: '',
  guests: 2,
  area_preference: 'indiferente',
  notes: '',
}

export default function Locale() {
  const [reservation, setReservation] = useState(initialReservation)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const handleChange = (event) => {
    const { name, value } = event.target

    setReservation((current) => ({
      ...current,
      [name]: name === 'guests' ? Number(value) : value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage(null)
    setError(null)

    const payload = {
      customer_name: reservation.customer_name.trim(),
      customer_phone: reservation.customer_phone.trim(),
      customer_email: reservation.customer_email.trim() || null,
      reservation_date: reservation.reservation_date,
      reservation_time: reservation.reservation_time,
      guests: reservation.guests,
      area_preference: reservation.area_preference,
      notes: reservation.notes.trim() || null,
      status: 'pending',
      source: 'website',
    }

    const { error: insertError } = await supabase
      .from('reservations')
      .insert([payload])

    if (insertError) {
      setError('No hemos podido enviar la solicitud. Inténtalo de nuevo o llámanos directamente.')
      console.error(insertError)
    } else {
      setMessage('Solicitud recibida. La reserva será válida solo después de la confirmación del equipo de Nonna Angela.')
      setReservation(initialReservation)
    }

    setIsSubmitting(false)
  }

  return (
    <section className="content-page locale-page">
      <div className="locale-hero">
        <div className="locale-hero-copy">
          <p className="eyebrow">El restaurante</p>
          <h2>Un bistrot italiano con alma familiar</h2>
          <p>
            Nonna Angela nace para diferenciarse de los restaurantes italianos
            turísticos: menos confusión, más identidad, menos carta infinita y más
            control en cada plato.
          </p>
        </div>

        <blockquote className="locale-story-card">
          <p>{menuStory}</p>
        </blockquote>
      </div>

      <div className="locale-experience-block">
        <div className="info-grid locale-info-grid">
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
      </div>

      <section className="reservation-section">
        <div className="reservation-copy">
          <p className="eyebrow">Reservas</p>
          <h3>Reserva tu mesa</h3>
          <p>
            Envíanos tu solicitud y nuestro equipo confirmará la reserva lo antes posible.
            La reserva no será válida hasta recibir confirmación.
          </p>
        </div>

        <form className="reservation-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Nombre
              <input
                type="text"
                name="customer_name"
                value={reservation.customer_name}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Teléfono
              <input
                type="tel"
                name="customer_phone"
                value={reservation.customer_phone}
                onChange={handleChange}
                required
              />
            </label>
          </div>

          <label>
            Email opcional
            <input
              type="email"
              name="customer_email"
              value={reservation.customer_email}
              onChange={handleChange}
            />
          </label>

          <div className="form-row">
            <label>
              Fecha
              <input
                type="date"
                name="reservation_date"
                value={reservation.reservation_date}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Hora
              <input
                type="time"
                name="reservation_time"
                value={reservation.reservation_time}
                onChange={handleChange}
                required
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Personas
              <input
                type="number"
                name="guests"
                min="1"
                max="20"
                value={reservation.guests}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Zona preferida
              <select
                name="area_preference"
                value={reservation.area_preference}
                onChange={handleChange}
              >
                <option value="indiferente">Indiferente</option>
                <option value="terrazza">Terrazza</option>
                <option value="sala">Sala</option>
                <option value="coworking">Coworking</option>
              </select>
            </label>
          </div>

          <label>
            Notas
            <textarea
              name="notes"
              value={reservation.notes}
              onChange={handleChange}
              rows="4"
              placeholder="Alergias, carrito de bebé, celebración, preferencia..."
            />
          </label>

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando...' : 'Enviar solicitud'}
          </button>

          {message && <p className="form-message success">{message}</p>}
          {error && <p className="form-message error">{error}</p>}
        </form>
      </section>

      <section className="reviews-section">
        <div>
          <p className="eyebrow">Google Reviews</p>
          <h3>¿Ya nos has visitado?</h3>
          <p>
            Tu valoración ayuda a Nonna Angela a crecer y a que más personas descubran
            nuestra cocina italiana.
          </p>
        </div>

        <a
          className="primary-button review-button"
          href="https://g.page/r/CQb-RYyd7PNAEBM/review"
          target="_blank"
          rel="noreferrer"
        >
          Valóranos en Google
        </a>
      </section>
    </section>
  )
}
