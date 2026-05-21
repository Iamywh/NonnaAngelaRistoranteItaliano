import React, { useState } from 'react'

const mockProducts = [
  'Guanciale',
  'Paccheri',
  'Rigatoni',
  'Pecorino romano',
  'Pomodoro',
  'Coca-Cola',
  'Prosecco',
  'Aperol'
]

export default function Orders({ setCurrentPage }) {
  const [orderType, setOrderType] = useState('food')
  const [supplier, setSupplier] = useState('orthidal')
  const [product, setProduct] = useState(mockProducts[0])
  const [quantity, setQuantity] = useState(1)
  const [orders, setOrders] = useState([])

  const addOrderLine = (event) => {
    event.preventDefault()

    const newLine = {
      id: crypto.randomUUID(),
      orderType,
      supplier,
      product,
      quantity,
      createdAt: new Date().toLocaleString()
    }

    setOrders((current) => [newLine, ...current])
  }

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')}>
        ← Torna alla dashboard
      </button>

      <p className="eyebrow">Orders</p>
      <h2>Ordini cucina e barra</h2>
      <p className="page-intro">
        Prima versione locale del formulario ordini. Più avanti salveremo tutto su Supabase.
      </p>

      <form className="order-form" onSubmit={addOrderLine}>
        <label>
          Tipo ordine
          <select value={orderType} onChange={(event) => setOrderType(event.target.value)}>
            <option value="food">Food</option>
            <option value="beverage">Beverage</option>
          </select>
        </label>

        <label>
          Fornitore
          <select value={supplier} onChange={(event) => setSupplier(event.target.value)}>
            <option value="orthidal">Orthidal</option>
            <option value="gm">GM</option>
            <option value="pasto_y_bellota">Pasto y Bellota</option>
          </select>
        </label>

        <label>
          Prodotto
          <select value={product} onChange={(event) => setProduct(event.target.value)}>
            {mockProducts.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label>
          Quantità
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>

        <button className="primary-button" type="submit">
          Aggiungi riga ordine
        </button>
      </form>

      <div className="dashboard-panel">
        <h3>Righe ordine temporanee</h3>

        <div className="risk-list">
          {orders.map((line) => (
            <article className="risk-item" key={line.id}>
              <div>
                <strong>{line.product}</strong>
                <span>
                  {line.orderType} · {line.supplier} · {line.createdAt}
                </span>
              </div>
              <b>{line.quantity}</b>
            </article>
          ))}

          {!orders.length && <p>Nessuna riga ordine aggiunta.</p>}
        </div>
      </div>
    </section>
  )
}