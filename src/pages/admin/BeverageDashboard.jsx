import React, { useEffect, useMemo, useState } from 'react'
import KpiCard from '../../components/KpiCard.jsx'
import beverageInventory from '../../data/beverageInventory.json'
import { supabase } from '../../lib/supabaseClient.js'
import '../../styles/beverage-inventory.css'

const INVENTORY_STORAGE_KEY = 'nonna_beverage_inventory_v1'

function cloneInitialCategories() {
  return JSON.parse(JSON.stringify(beverageInventory.categories || []))
}

function getLocalCategories(key) {
  if (typeof window === 'undefined') return null

  try {
    const savedInventory = window.localStorage.getItem(key)
    if (!savedInventory) return null

    const parsedInventory = JSON.parse(savedInventory)
    return Array.isArray(parsedInventory) && parsedInventory.length ? parsedInventory : null
  } catch {
    return null
  }
}

function inventoryDraftKey(userId, version) {
  return `${INVENTORY_STORAGE_KEY}:draft:${userId}:${version}`
}

function normalizeQuantity(value) {
  const numericValue = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(numericValue)) return 0
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

export default function BeverageDashboard({ userId, onBack, onSignOut, authBusy }) {
  const [categories, setCategories] = useState([])
  const [snapshot, setSnapshot] = useState(null)
  const [saving, setSaving] = useState(false)
  const [managerMessage, setManagerMessage] = useState(null)
  const hasChanges = snapshot && categories !== snapshot.categories
  const canEdit = Boolean(snapshot) && !saving

  useEffect(() => {
    let active = true
    async function loadInventory() {
      try {
        const { data, error } = await supabase.rpc('beverage_inventory_load')
        if (error) throw error
        if (!active) return
        const saved = data || {
          categories: getLocalCategories(INVENTORY_STORAGE_KEY) || cloneInitialCategories(),
          version: 0,
          updated_at: null
        }
        setSnapshot(saved)
        setCategories(getLocalCategories(inventoryDraftKey(userId, saved.version)) || saved.categories)
      } catch {
        if (active) setManagerMessage({ tone: 'error', text: 'Impossibile caricare l’inventario condiviso. Ricarica la pagina e riprova.' })
      }
    }
    loadInventory()
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!hasChanges) return
    try {
      window.localStorage.setItem(inventoryDraftKey(userId, snapshot.version), JSON.stringify(categories))
    } catch {
      // The draft stays in memory even when browser storage is unavailable.
    }
  }, [categories, hasChanges, snapshot, userId])

  const saveInventory = async () => {
    if (!canEdit || (!hasChanges && snapshot.version > 0)) return
    setSaving(true)
    setManagerMessage(null)
    try {
      const { data, error } = await supabase.rpc('beverage_inventory_save', {
        p_categories: categories,
        p_expected_version: snapshot.version
      })
      if (error) throw error
      if (!data?.updated_at || data.version !== snapshot.version + 1) {
        throw new Error('unexpected_inventory_response')
      }
      setSnapshot({ ...data, categories })
      setManagerMessage({ tone: 'success', text: 'Inventario condiviso salvato.' })
      try {
        window.localStorage.removeItem(inventoryDraftKey(userId, snapshot.version))
      } catch {
        // The inventory has already been saved on the server.
      }
    } catch (error) {
      const text = error?.message === 'inventory_conflict'
        ? 'Un’altra persona ha già salvato una versione più recente. Usa “Copia JSON” per conservare le tue modifiche prima di ricaricare la pagina.'
        : 'Salvataggio non riuscito. Le modifiche sono ancora qui. Riprova.'
      setManagerMessage({ tone: 'error', text })
    } finally {
      setSaving(false)
    }
  }

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
    setManagerMessage(null)
  }

  const adjustItemQuantity = (categoryId, itemName, delta) => {
    setCategories((currentCategories) => updateInventoryItem(currentCategories, categoryId, itemName, (item) => ({
      ...item,
      quantity: normalizeQuantity(Number(item.quantity || 0) + delta)
    })))
    setManagerMessage(null)
  }

  const resetInventory = () => {
    const confirmed = window.confirm('Ripristinare il conteggio iniziale nella bozza? L’inventario condiviso cambierà solo dopo il salvataggio.')
    if (!confirmed) return

    setCategories(cloneInitialCategories())
    setManagerMessage(null)
  }

  const copyInventoryJson = async () => {
    const serializedInventory = JSON.stringify({ updated_at: new Date().toISOString(), categories }, null, 2)

    try {
      await navigator.clipboard.writeText(serializedInventory)
      setManagerMessage({ tone: 'success', text: 'JSON copiato negli appunti.' })
    } catch {
      setManagerMessage({ tone: 'error', text: 'Impossibile copiare il JSON negli appunti.' })
    }
  }

  return (
    <section className="admin-page">
      <button className="back-button" onClick={onBack} type="button">
        ← Indietro
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
          <button className="primary-button" type="button" onClick={saveInventory} disabled={!canEdit || (!hasChanges && snapshot.version > 0)}>
            {saving ? 'Salvataggio…' : 'Salva inventario'}
          </button>
          <button className="ghost-button" type="button" onClick={copyInventoryJson} disabled={!canEdit}>Copia JSON</button>
          <button className="ghost-button" type="button" onClick={resetInventory} disabled={!canEdit}>Reset iniziale</button>
          <button className="ghost-button" type="button" onClick={onSignOut} disabled={authBusy || saving}>Esci</button>
        </div>
      </div>

      {managerMessage && (
        <p className={`form-message ${managerMessage.tone} beverage-save-message`} role={managerMessage.tone === 'error' ? 'alert' : 'status'}>
          {managerMessage.text}
        </p>
      )}
      {!snapshot && !managerMessage && <p role="status">Caricamento inventario…</p>}
      {snapshot?.version === 0 && <p>Controlla il conteggio iniziale prima di pubblicarlo come inventario condiviso.</p>}
      {hasChanges && <p>Modifiche in attesa di salvataggio.</p>}
      {snapshot?.updated_at && (
        <p>Ultimo salvataggio condiviso: {new Date(snapshot.updated_at).toLocaleString('it-IT', { timeZone: 'Atlantic/Canary' })}</p>
      )}

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
            <span>Scrivi la quantità reale e premi “Salva inventario” per condividerla con lo staff.</span>
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
                      disabled={!canEdit}
                      value={item.quantity}
                      onChange={(event) => setItemQuantity(category.id, item.name, event.target.value)}
                    />
                    <small>{category.unit}</small>
                    <div className="beverage-stock-actions">
                      <button type="button" disabled={!canEdit} onClick={() => adjustItemQuantity(category.id, item.name, -1)}>−1</button>
                      <button type="button" disabled={!canEdit} onClick={() => adjustItemQuantity(category.id, item.name, 1)}>+1</button>
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
