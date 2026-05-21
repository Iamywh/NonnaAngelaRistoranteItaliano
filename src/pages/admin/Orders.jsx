import React, { useMemo, useState } from 'react'
import ingredients from '../../data/ingredients.json'
import beverages from '../../data/beverages.json'
import barIngredients from '../../data/barIngredients.json'
import suppliers from '../../data/suppliers.json'

function normalizeProduct(item, source, areaFallback) {
  return {
    id: item.id,
    name: item.name_it || item.name || item.id,
    supplier: item.supplier || 'to_define',
    unit: item.unit || 'unit',
    area: item.area || areaFallback,
    category: item.category || 'general',
    source
  }
}

export default function Orders({ setCurrentPage }) {
  const [orderType, setOrderType] = useState('food')
  const [supplier, setSupplier] = useState('all')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [orders, setOrders] = useState([])

  const productList = useMemo(() => {
    const foodProducts = ingredients
      .filter((item) => item.active !== false)
      .map((item) => normalizeProduct(item, 'ingredients', 'food'))

    const beverageProducts = [
      ...beverages.map((item) => normalizeProduct(item, 'beverages', 'bar')),
      ...barIngredients.map((item) => normalizeProduct(item, 'barIngredients', 'bar'))
    ].filter((item) => item.id)

    const baseProducts = orderType === 'food' ? foodProducts : beverageProducts

    return baseProducts
      .filter((item) => supplier === 'all' || item.supplier === supplier)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [orderType, supplier])

  const selectedProduct = productList.find((item) => item.id === productId) || productList[0]

  const supplierOptions = [
    { id: 'all', name: 'Tutti i fornitori' },
    ...suppliers.map((item) => ({
      id: item.id,
      name: item.name
    }))
  ]

  const addOrderLine = (event) => {
    event.preventDefault()

    if (!selectedProduct) return

    const newLine = {
      id: crypto.randomUUID(),
      orderType,
      supplier: selectedProduct.supplier,
      productId: selectedProduct.id,
      product: selectedProduct.name,
      quantity: Number(quantity),
      unit: selectedProduct.unit,
      notes,
      createdAt: new Date().toLocaleString()
    }

    setOrders((current) => [newLine, ...current])
    setQuantity(1)
    setNotes('')
  }

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')}>
        ← Torna alla dashboard
      </button>

      <p className="eyebrow">Orders</p>
      <h2>Ordini cucina e barra</h2>
      <p className="page-intro">
        Formulario ordini collegato ai dati reali di ingredienti, beverage, bar inventory e fornitori.
        Per ora le righe restano temporanee nella pagina; il salvataggio su Supabase arriva dopo.
      </p>

      <form className="order-form" onSubmit={addOrderLine}>
        <label>
          Tipo ordine
          <select
            value={orderType}
            onChange={(event) => {
              setOrderType(event.target.value)
              setSupplier('all')
              setProductId('')
            }}
          >
            <option value="food">Food</option>
            <option value="beverage">Beverage</option>
          </select>
        </label>

        <label>
          Fornitore
          <select
            value={supplier}
            onChange={(event) => {
              setSupplier(event.target.value)
              setProductId('')
            }}
          >
            {supplierOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Prodotto
          <select
            value={productId || selectedProduct?.id || ''}
            onChange={(event) => setProductId(event.target.value)}
          >
            {productList.map((item) => (
              <option key={`${item.source}-${item.id}`} value={item.id}>
                {item.name} · {item.unit} · {item.supplier}
              </option>
            ))}
          </select>
        </label>

        <label>
          Quantità
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>

        <label>
          Note
          <input
            type="text"
            value={notes}
            placeholder="Es. urgente, verificare prezzo..."
            onChange={(event) => setNotes(event.target.value)}
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
                  {line.orderType} · {line.supplier} · {line.quantity} {line.unit} · {line.createdAt}
                  {line.notes ? ` · ${line.notes}` : ''}
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