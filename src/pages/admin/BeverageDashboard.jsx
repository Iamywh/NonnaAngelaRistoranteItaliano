import React, { useEffect, useMemo, useState } from 'react'
import KpiCard from '../../components/KpiCard.jsx'
import beverageInventory from '../../data/beverageInventory.json'
import '../../styles/beverage-inventory.css'

const INVENTORY_STORAGE_KEY = 'nonna_beverage_inventory_v1'

function cloneInitialCategories() {
  return JSON.parse(JSON.stringify(beverageInventory.categories || []))
}

function getInitialCategories() {
  if (typeof window === 'undefined') return cloneInitialCategories()

  try {
    const savedInventory = window.localStorage.getItem(INVENTORY_STORAGE_KEY)
    if (!savedInventory) return cloneInitialCategories()

    const parsedInventory = JSON.parse(savedInventory)
    return Array.isArray(parsedInventory) && parsedInventory.length ? parsedInventory : cloneInitialCategories()
  } catch {
    return cloneInitialCategories()
  }
}

function normalizeQuantity(value) {
  const numericValue = Number(String(value ?? '').replace(',', '.'))
  if (Number.isNaN(numericValue)) return 0
  return Math.max(0, Math.round(numericValue * 100) / 100)
}

function formatQuantity(value) {
  const numericValue = normalizeQuantity(value)
  if (Number.isInteger(numericValue)) return String(numericValue)
  return String(numericValue).replace('.', ',')
}

function getItemStatus(item, category) {
  const quantity = Number(item.quantity || 0)
  const isSoda = category.id === 'sodas'

  if (quantity <= 0) return 'is-empty'
  if (isSoda && quantity <= 8) return 'is-low'
  if (!isSoda && quantity <= 0.5) return 'is-low'
  return ''
}

function updateInventoryItem(categories, categoryId, itemName, updater) {
  return categories.map((category) => {
    if (category.id !== categoryId) return category

    return {
      ...category,
      items: (category.items || []).map((item) => {
        if (item.name !== itemName) return item
        return updater(item)
      })
    }
  })
}

export default function BeverageDashboard({ setCurrentPage }) {
  const [categories, setCategories] = useState(getInitialCategories)
  const [managerMessage, setManagerMessage] = useState('')

  useEffect(() => {
    try {
      window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(categories))
    } catch {
      setManagerMessage('No se ha podido guardar el inventario en este navegador.')
    }
  }, [categories])

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

  const setItemQuantity = (categoryId, itemName, value) => {
    const nextQuantity = normalizeQuantity(value)
    setCategories((currentCategories) => updateInventoryItem(currentCategories, categoryId, itemName, (item) => ({ ...item, quantity: nextQuantity })))
    setManagerMessage('Inventario actualizado y guardado en este navegador.')
  }

  const adjustItemQuantity = (categoryId, itemName, delta) => {
    setCategories((currentCategories) => updateInventoryItem(currentCategories, categoryId, itemName, (item) => ({
      ...item,
      quantity: normalizeQuantity(Number(item.quantity || 0) + delta)
    })))
    setManagerMessage(delta > 0 ? 'Entrada de pedido añadida.' : 'Salida/conteo descontado.')
  }

  const resetInventory = () => {
    const confirmed = window.confirm('¿Restaurar el inventario inicial cargado en el sistema? Se perderán los cambios guardados en este navegador.')
    if (!confirmed) return

    setCategories(cloneInitialCategories())
    try {
      window.localStorage.removeItem(INVENTORY_STORAGE_KEY)
    } catch {
      // Ignore localStorage errors.
    }
    setManagerMessage('Inventario restaurado al conteo inicial.')
  }

  const copyInventoryJson = async () => {
    const serializedInventory = JSON.stringify({ updated_at: new Date().toISOString(), categories }, null, 2)

    try {
      await navigator.clipboard.writeText(serializedInventory)
      setManagerMessage('JSON del inventario copiado al portapapeles.')
    } catch {
      setManagerMessage('No se ha podido copiar el JSON automáticamente.')
    }
  }

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')} type="button">
        ← Torna alla dashboard
      </button>

      <div className="reservation-page-top beverage-page-top">
        <div>
          <p className="eyebrow">Beverage control</p>
          <h2>Beverage dashboard</h2>
          <p className="page-intro">
            Inventario beverage modificabile: aggiungi unità quando arriva un ordine e correggi lo stock
            ogni settimana dopo il conteggio reale. Quando avremo prezzi di acquisto e vendita,
            questa sezione diventerà la base per costi, vendite e margini.
          </p>
        </div>

        <div className="beverage-manager-actions">
          <button className="ghost-button" type="button" onClick={copyInventoryJson}>Copia JSON</button>
          <button className="ghost-button" type="button" onClick={resetInventory}>Reset iniziale</button>
        </div>
      </div>

      {managerMessage && <p className="form-message success beverage-save-message">{managerMessage}</p>}

      <div className="beverage-inventory-summary">
        <KpiCard label="Referenze" value={stats.items.length} detail="Prodotti inventariati" />
        <KpiCard label="Sodas / birre" value={formatQuantity(stats.sodaUnits)} detail="Unità singole" tone="good" />
        <KpiCard label="Bottiglie" value={formatQuantity(stats.bottleUnits)} detail="Distillati, liquori e vini" tone="good" />
        <KpiCard label="Da riordinare" value={stats.emptyItems.length + stats.lowItems.length} detail="Zero stock o livello basso" tone={(stats.emptyItems.length + stats.lowItems.length) ? 'warning' : 'good'} />
      </div>

      <article className="dashboard-panel beverage-howto-panel">
        <p className="eyebrow">Come usarlo</p>
        <div className="beverage-howto-grid">
          <div>
            <strong>Nuovo ordine</strong>
            <span>Premi +1 sulle unità arrivate o scrivi direttamente il nuovo stock.</span>
          </div>
          <div>
            <strong>Conteggio settimanale</strong>
            <span>Scrivi nel campo stock la quantità reale contata: il sistema corregge subito il totale.</span>
          </div>
          <div>
            <strong>Backup</strong>
            <span>Usa “Copia JSON” per salvare o inviarmi il conteggio aggiornato.</span>
          </div>
        </div>
      </article>

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
                <div className="beverage-inventory-row inventory-head inventory-edit-row">
                  <span>Prodotto</span>
                  <span>Stock</span>
                  <span>Unità</span>
                  <span>Movimenti</span>
                </div>

                {(category.items || []).map((item) => (
                  <div className={`beverage-inventory-row inventory-edit-row ${getItemStatus(item, category)}`} key={`${category.id}-${item.name}`}>
                    <strong>{item.name}</strong>
                    <input
                      aria-label={`Stock ${item.name}`}
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      type="number"
                      value={item.quantity}
                      onChange={(event) => setItemQuantity(category.id, item.name, event.target.value)}
                    />
                    <small>{category.unit}</small>
                    <div className="beverage-stock-actions">
                      <button type="button" onClick={() => adjustItemQuantity(category.id, item.name, -1)}>−1</button>
                      <button type="button" onClick={() => adjustItemQuantity(category.id, item.name, 1)}>+1</button>
                    </div>
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
