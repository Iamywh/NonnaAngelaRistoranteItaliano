import React, { useMemo } from 'react'
import KpiCard from '../../components/KpiCard.jsx'
import beverageInventory from '../../data/beverageInventory.json'
import '../../styles/beverage-inventory.css'

function formatQuantity(value) {
  if (Number.isInteger(value)) return String(value)
  return String(value).replace('.', ',')
}

function getItemStatus(item, category) {
  const quantity = Number(item.quantity || 0)
  const isSoda = category.id === 'sodas'

  if (quantity <= 0) return 'is-empty'
  if (isSoda && quantity <= 8) return 'is-low'
  if (!isSoda && quantity <= 0.5) return 'is-low'
  return ''
}

export default function BeverageDashboard({ setCurrentPage }) {
  const categories = beverageInventory.categories || []

  const stats = useMemo(() => {
    const items = categories.flatMap((category) => (category.items || []).map((item) => ({ ...item, categoryId: category.id })))
    const emptyItems = items.filter((item) => Number(item.quantity || 0) <= 0)
    const lowItems = categories.flatMap((category) => (category.items || [])
      .filter((item) => getItemStatus(item, category) === 'is-low')
      .map((item) => ({ ...item, categoryId: category.id })))
    const sodaUnits = categories.find((category) => category.id === 'sodas')?.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0
    const bottleUnits = categories
      .filter((category) => category.id !== 'sodas')
      .flatMap((category) => category.items || [])
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0)

    return { items, emptyItems, lowItems, sodaUnits, bottleUnits }
  }, [categories])

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')}>
        ← Torna alla dashboard
      </button>

      <p className="eyebrow">Beverage control</p>
      <h2>Beverage dashboard</h2>
      <p className="page-intro">
        Inventario beverage attuale: soft drink, birre, distillati, liquori, vini e bollicine.
        Quando avremo i prezzi di acquisto e vendita, questa sezione diventerà la base per costi,
        marginalità, rotazione e prossimo ordine.
      </p>

      <div className="beverage-inventory-summary">
        <KpiCard label="Referenze" value={stats.items.length} detail="Prodotti inventariati" />
        <KpiCard label="Sodas / birre" value={formatQuantity(stats.sodaUnits)} detail="Unità singole" tone="good" />
        <KpiCard label="Bottiglie" value={formatQuantity(stats.bottleUnits)} detail="Distillati, liquori e vini" tone="good" />
        <KpiCard label="Da riordinare" value={stats.emptyItems.length + stats.lowItems.length} detail="Zero stock o livello basso" tone={(stats.emptyItems.length + stats.lowItems.length) ? 'warning' : 'good'} />
      </div>

      <div className="beverage-inventory-grid">
        {categories.map((category) => {
          const total = (category.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)

          return (
            <article className="dashboard-panel beverage-inventory-panel" key={category.id}>
              <div className="beverage-inventory-panel-header">
                <div>
                  <p className="eyebrow">Inventario</p>
                  <h3>{category.title}</h3>
                </div>
                <span className="beverage-inventory-count">{formatQuantity(total)}</span>
              </div>

              <div className="beverage-inventory-table">
                <div className="beverage-inventory-row inventory-head">
                  <span>Prodotto</span>
                  <span>Stock</span>
                  <span>Unità</span>
                </div>

                {(category.items || []).map((item) => (
                  <div className={`beverage-inventory-row ${getItemStatus(item, category)}`} key={`${category.id}-${item.name}`}>
                    <strong>{item.name}</strong>
                    <span>{formatQuantity(item.quantity)}</span>
                    <small>{category.unit}</small>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </div>

      <article className="dashboard-panel beverage-next-step">
        <p className="eyebrow">Prossima fase</p>
        <h3>Costi, vendite e margini</h3>
        <p>
          Mancano i prezzi di acquisto e i prezzi vendita effettivi. Appena li inseriamo,
          possiamo calcolare costo unitario, margine per prodotto, alert riordino e valore reale
          dell’inventario beverage.
        </p>
      </article>
    </section>
  )
}
