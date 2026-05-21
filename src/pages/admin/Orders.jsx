import React, { useEffect, useMemo, useState } from 'react'
import ingredients from '../../data/ingredients.json'
import beverages from '../../data/beverages.json'
import barIngredients from '../../data/barIngredients.json'
import suppliers from '../../data/suppliers.json'

const ORDER_HISTORY_KEY = 'nonna_angela_order_history'

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

function formatCurrency(value) {
    return `${Number(value || 0).toFixed(2)}€`
}

function getCurrentMonth() {
    return new Date().toISOString().slice(0, 7)
}

export default function Orders({ setCurrentPage }) {
    const [orderType, setOrderType] = useState('food')
    const [supplier, setSupplier] = useState('all')
    const [productId, setProductId] = useState('')
    const [quantity, setQuantity] = useState(1)
    const [notes, setNotes] = useState('')
    const [orders, setOrders] = useState([])
    const [savedOrders, setSavedOrders] = useState([])
    const [historySupplier, setHistorySupplier] = useState('all')
    const [historyType, setHistoryType] = useState('all')
    const [historyMonth, setHistoryMonth] = useState(getCurrentMonth())

    useEffect(() => {
        const storedOrders = localStorage.getItem(ORDER_HISTORY_KEY)
        if (storedOrders) {
            setSavedOrders(JSON.parse(storedOrders))
        }
    }, [])

    useEffect(() => {
        localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(savedOrders))
    }, [savedOrders])

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

    const orderSummary = useMemo(() => {
        const totalLines = orders.length
        const foodLines = orders.filter((line) => line.orderType === 'food').length
        const beverageLines = orders.filter((line) => line.orderType === 'beverage').length
        const suppliersInvolved = [...new Set(orders.map((line) => line.supplier))]

        return {
            totalLines,
            foodLines,
            beverageLines,
            suppliersInvolved
        }
    }, [orders])

    const filteredHistory = useMemo(() => {
        return savedOrders.filter((order) => {
            const matchSupplier = historySupplier === 'all' || order.suppliers.includes(historySupplier)
            const matchType = historyType === 'all' || order.orderType === historyType
            const matchMonth = !historyMonth || order.createdAt.slice(0, 7) === historyMonth

            return matchSupplier && matchType && matchMonth
        })
    }, [savedOrders, historySupplier, historyType, historyMonth])

    const historySummary = useMemo(() => {
        const totalOrders = filteredHistory.length
        const totalLines = filteredHistory.reduce((sum, order) => sum + order.lines.length, 0)

        return {
            totalOrders,
            totalLines
        }
    }, [filteredHistory])

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
            createdAt: new Date().toISOString()
        }

        setOrders((current) => [newLine, ...current])
        setQuantity(1)
        setNotes('')
    }

    const saveCurrentOrder = () => {
        if (!orders.length) return

        const suppliersInvolved = [...new Set(orders.map((line) => line.supplier))]
        const hasFood = orders.some((line) => line.orderType === 'food')
        const hasBeverage = orders.some((line) => line.orderType === 'beverage')

        const savedOrder = {
            id: crypto.randomUUID(),
            orderNumber: `NA-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
            orderType: hasFood && hasBeverage ? 'mixed' : hasFood ? 'food' : 'beverage',
            suppliers: suppliersInvolved,
            createdAt: new Date().toISOString(),
            status: 'draft',
            lines: orders
        }

        setSavedOrders((current) => [savedOrder, ...current])
        setOrders([])
    }

    const clearCurrentOrder = () => {
        setOrders([])
    }

    const downloadOrderJson = (order) => {
        const blob = new Blob([JSON.stringify(order, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)

        const link = document.createElement('a')
        link.href = url
        link.download = `${order.orderNumber}.json`
        link.click()

        URL.revokeObjectURL(url)
    }
    const openPrintableOrder = (order) => {
        const orderDate = new Date(order.createdAt).toLocaleString()

        const rows = order.lines
            .map(
                (line) => `
        <tr>
          <td>${line.product}</td>
          <td>${line.quantity}</td>
          <td>${line.unit}</td>
          <td>${line.supplier}</td>
          <td>${line.orderType}</td>
          <td>${line.notes || '-'}</td>
        </tr>
      `
            )
            .join('')

        const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${order.orderNumber}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            color: #2a1c14;
          }

          .header {
            border-bottom: 3px solid #8f1d14;
            padding-bottom: 18px;
            margin-bottom: 26px;
          }

          .brand {
            font-size: 28px;
            font-weight: 800;
            color: #8f1d14;
            margin: 0;
          }

          .subtitle {
            margin: 4px 0 0;
            color: #7a6658;
          }

          .meta {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px 24px;
            margin: 24px 0;
            padding: 18px;
            background: #fff6ec;
            border: 1px solid #ead8c4;
            border-radius: 12px;
          }

          .meta p {
            margin: 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }

          th {
            background: #8f1d14;
            color: white;
            text-align: left;
            padding: 10px;
            font-size: 13px;
          }

          td {
            border-bottom: 1px solid #e5d7c8;
            padding: 10px;
            font-size: 13px;
          }

          .footer {
            margin-top: 34px;
            color: #7a6658;
            font-size: 12px;
          }

          @media print {
            button {
              display: none;
            }

            body {
              margin: 24px;
            }
          }
        </style>
      </head>
      <body>
        <button onclick="window.print()" style="margin-bottom: 20px; padding: 10px 14px; border-radius: 8px; border: 0; background: #8f1d14; color: white; font-weight: 700; cursor: pointer;">
          Stampa / Salva PDF
        </button>

        <section class="header">
          <h1 class="brand">Nonna Angela Ristorante Italiano</h1>
          <p class="subtitle">Ordine fornitore</p>
        </section>

        <section class="meta">
          <p><strong>Numero ordine:</strong> ${order.orderNumber}</p>
          <p><strong>Data:</strong> ${orderDate}</p>
          <p><strong>Tipo:</strong> ${order.orderType}</p>
          <p><strong>Fornitori:</strong> ${order.suppliers.join(', ')}</p>
          <p><strong>Stato:</strong> ${order.status}</p>
          <p><strong>Righe:</strong> ${order.lines.length}</p>
        </section>

        <table>
          <thead>
            <tr>
              <th>Prodotto</th>
              <th>Quantità</th>
              <th>Unità</th>
              <th>Fornitore</th>
              <th>Tipo</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <p class="footer">
          Documento generato da Nonna Angela Admin Dashboard. I costi e lo storico saranno collegati a Supabase nelle prossime versioni.
        </p>
      </body>
    </html>
  `

        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)

        const printWindow = window.open(url, '_blank')

        if (!printWindow) {
            alert('Il browser ha bloccato la finestra di stampa. Abilita i popup per questo sito.')
            URL.revokeObjectURL(url)
            return
        }

        setTimeout(() => {
            URL.revokeObjectURL(url)
        }, 10000)
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
                Le righe possono essere salvate nello storico locale, filtrate e riscaricate.
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

            <div className="kpi-grid compact">
                <article className="kpi-card">
                    <p>Righe ordine</p>
                    <strong>{orderSummary.totalLines}</strong>
                    <span>Totale righe inserite</span>
                </article>

                <article className="kpi-card good">
                    <p>Food</p>
                    <strong>{orderSummary.foodLines}</strong>
                    <span>Righe cucina</span>
                </article>

                <article className="kpi-card">
                    <p>Beverage</p>
                    <strong>{orderSummary.beverageLines}</strong>
                    <span>Righe barra</span>
                </article>

                <article className="kpi-card warning">
                    <p>Fornitori</p>
                    <strong>{orderSummary.suppliersInvolved.length}</strong>
                    <span>{orderSummary.suppliersInvolved.join(', ') || 'Nessuno'}</span>
                </article>
            </div>

            <div className="order-actions">
                <button className="primary-button" type="button" onClick={saveCurrentOrder} disabled={!orders.length}>
                    Salva ordine nello storico
                </button>
                <button className="ghost-button" type="button" onClick={clearCurrentOrder} disabled={!orders.length}>
                    Svuota ordine corrente
                </button>
            </div>

            <div className="dashboard-panel">
                <h3>Righe ordine temporanee</h3>

                <div className="risk-list">
                    {orders.map((line) => (
                        <article className="risk-item" key={line.id}>
                            <div>
                                <strong>{line.product}</strong>
                                <span>
                                    {line.orderType} · {line.supplier} · {line.quantity} {line.unit}
                                    {line.notes ? ` · ${line.notes}` : ''}
                                </span>
                            </div>
                            <b>{line.quantity}</b>
                        </article>
                    ))}

                    {!orders.length && <p>Nessuna riga ordine aggiunta.</p>}
                </div>
            </div>

            <div className="dashboard-panel">
                <div className="panel-heading">
                    <div>
                        <p className="eyebrow">Storico</p>
                        <h3>Ordini salvati</h3>
                    </div>
                </div>

                <div className="history-filters">
                    <label>
                        Fornitore
                        <select value={historySupplier} onChange={(event) => setHistorySupplier(event.target.value)}>
                            {supplierOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label>
                        Tipo
                        <select value={historyType} onChange={(event) => setHistoryType(event.target.value)}>
                            <option value="all">Tutti</option>
                            <option value="food">Food</option>
                            <option value="beverage">Beverage</option>
                            <option value="mixed">Mixed</option>
                        </select>
                    </label>

                    <label>
                        Mese
                        <input
                            type="month"
                            value={historyMonth}
                            onChange={(event) => setHistoryMonth(event.target.value)}
                        />
                    </label>
                </div>

                <div className="kpi-grid compact">
                    <article className="kpi-card">
                        <p>Ordini filtrati</p>
                        <strong>{historySummary.totalOrders}</strong>
                        <span>Numero ordini</span>
                    </article>

                    <article className="kpi-card good">
                        <p>Righe filtrate</p>
                        <strong>{historySummary.totalLines}</strong>
                        <span>Totale righe nello storico</span>
                    </article>
                </div>

                <div className="risk-list">
                    {filteredHistory.map((order) => (
                        <article className="risk-item" key={order.id}>
                            <div>
                                <strong>{order.orderNumber}</strong>
                                <span>
                                    {order.orderType} · {order.suppliers.join(', ')} · {order.lines.length} righe ·{' '}
                                    {new Date(order.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="history-actions">
                                <button className="ghost-button small" onClick={() => downloadOrderJson(order)}>
                                    JSON
                                </button>
                                <button className="primary-button small" onClick={() => openPrintableOrder(order)}>
                                    Stampa/PDF
                                </button>
                            </div>
                        </article>
                    ))}

                    {!filteredHistory.length && <p>Nessun ordine salvato per questi filtri.</p>}
                </div>
            </div>
        </section>
    )
}