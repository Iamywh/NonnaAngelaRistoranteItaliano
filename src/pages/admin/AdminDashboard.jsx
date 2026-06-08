import React from 'react'
import KpiCard from '../../components/KpiCard.jsx'
import AdminModuleCard from '../../components/AdminModuleCard.jsx'
import menuCostReport from '../../data/menuCostReport.json'

function getAverage(items, field) {
    const validItems = items.filter((item) => typeof item[field] === 'number')
    if (!validItems.length) return 0

    const total = validItems.reduce((sum, item) => sum + item[field], 0)
    return total / validItems.length
}

function getRiskItems(items) {
    return items
        .filter((item) => item.food_cost_percent >= 20 || item.costing_status !== 'complete')
        .sort((a, b) => (b.food_cost_percent || 0) - (a.food_cost_percent || 0))
        .slice(0, 5)
}

export default function AdminDashboard({ setCurrentPage }) {
    const items = menuCostReport.items || []

    const completeItems = items.filter((item) => item.costing_status === 'complete')
    const warningItems = items.filter((item) => item.costing_status !== 'complete')
    const avgFoodCost = getAverage(completeItems, 'food_cost_percent')
    const avgMargin = getAverage(completeItems, 'gross_margin')
    const riskItems = getRiskItems(items)

    return (
        <section className="admin-page">
            <div className="admin-header">
                <div>
                    <p className="eyebrow">Admin control</p>
                    <h2>Dashboard manageriale</h2>
                    <p>
                        Centro di controllo per food cost, beverage, ordini, menu engineering
                        e decisioni operative. I dati sotto leggono il report food cost reale.
                    </p>
                </div>
            </div>

            <div className="kpi-grid">
                <KpiCard
                    label="Food cost medio"
                    value={`${avgFoodCost.toFixed(1)}%`}
                    detail="Media sui piatti completi"
                    tone={avgFoodCost <= 25 ? 'good' : 'warning'}
                />
                <KpiCard
                    label="Piatti completi"
                    value={completeItems.length}
                    detail={`${items.length} piatti nel report`}
                />
                <KpiCard
                    label="Alert costing"
                    value={warningItems.length}
                    detail="Piatti da completare o verificare"
                    tone={warningItems.length ? 'warning' : 'good'}
                />
                <KpiCard
                    label="Margine medio"
                    value={`${avgMargin.toFixed(2)}€`}
                    detail="Margine medio per piatto"
                    tone="good"
                />
            </div>

            <div className="dashboard-panel">
                <div>
                    <p className="eyebrow">Controllo rapido</p>
                    <h3>Piatti da monitorare</h3>
                </div>

                <div className="risk-list">
                    {riskItems.map((item) => (
                        <article key={item.menu_item_id} className="risk-item">
                            <div>
                                <strong>{item.name_it}</strong>
                                <span>{item.category}</span>
                            </div>
                            <b>{item.food_cost_percent ? `${item.food_cost_percent}%` : 'Da completare'}</b>
                        </article>
                    ))}
                </div>
            </div>

            <div className="admin-grid">
                <AdminModuleCard
                    title="Food"
                    description="Food cost, fornitori cucina, ordini food"
                    meta="Cucina / ingredienti / ricette"
                    onClick={() => setCurrentPage('admin-food')}
                />

                <AdminModuleCard
                    title="Beverage"
                    description="Vini, soft drink, liquori, ordini bar"
                    meta="Bar / cantina / cocktail"
                    onClick={() => setCurrentPage('admin-beverage')}
                />

                <AdminModuleCard
                    title="F&B Control"
                    description="Menu completo, margini, alert, riserve e takeaway futuri"
                    meta="Controllo manageriale"
                    onClick={() => setCurrentPage('admin-fb')}
                />

                <AdminModuleCard
                    title="Reservas"
                    description="Solicitudes de reserva, confirmaciones y no-show"
                    meta="Sala / reservas / atención cliente"
                    onClick={() => setCurrentPage('admin-reservations')}
                />

                <AdminModuleCard
                    title="Musica"
                    description="Playlist sala, riproduzione e controllo ambiente"
                    meta="Sala / atmosfera / customer experience"
                    onClick={() => setCurrentPage('admin-music')}
                />

                <AdminModuleCard
                    title="Orders"
                    description="Ordini cucina e barra con storico"
                    meta="Food / beverage / fornitori"
                    onClick={() => setCurrentPage('admin-orders')}
                />
                <AdminModuleCard
                    title="Invoices"
                    description="Carica fatture, OCR, storico prezzi prodotti"
                    meta="Fornitori / prezzi / prossimo ordine"
                    onClick={() => setCurrentPage('admin-invoices')}
                />
            </div>
        </section>
    )
}
