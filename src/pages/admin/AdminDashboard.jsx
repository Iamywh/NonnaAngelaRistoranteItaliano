import React from 'react'
import WorkbookCostSummary from '../../components/WorkbookCostSummary.jsx'
import AdminModuleCard from '../../components/AdminModuleCard.jsx'


const operations = [
    { permission: 'orders', page: 'admin-orders', title: 'Ordini', description: 'Ordini condivisi, inventario ingredienti e notifiche Telegram' },
    { permission: 'beverage', page: 'admin-beverage', title: 'Inventario bevande', description: 'Conteggio condiviso di bar e cantina' },
    { permission: 'reservations', page: 'admin-reservations', title: 'Reservas', description: 'Solicitudes, confirmaciones y mesas' }
]

export default function AdminDashboard({ setCurrentPage, permissions }) {
    if (!permissions.backoffice) {
        return (
            <section className="admin-page">
                <div className="admin-header"><h2>Manager</h2></div>
                <div className="admin-module-grid">
                    {operations.filter(module => permissions[module.permission]).map(module => (
                        <AdminModuleCard key={module.page} title={module.title} description={module.description}
                            onClick={() => setCurrentPage(module.page)} />
                    ))}
                </div>
            </section>
        )
    }

    return (
        <section className="admin-page">
            <div className="admin-header">
                <div>
                    <p className="eyebrow">Admin control</p>
                    <h2>Dashboard manageriale</h2>
                    <p>
                        Centro di controllo per food cost, beverage, ordini, menu engineering
                        e decisioni operative. Costi aggiornati dai file Excel e confrontati con la carta attuale.
                    </p>
                </div>
            </div>

            <div className="admin-control-sections">
                <div className="admin-control-section">
                    <div className="admin-control-section-header">
                        <p className="eyebrow">Operaciones de sala</p>
                        <h3>Operaciones de sala</h3>
                    </div>
                    <div className="admin-module-grid">
                        <AdminModuleCard
                            title="Reservas"
                            description="Solicitudes de reserva, confirmaciones y no-show"
                            meta="Sala / reservas / atención cliente"
                            onClick={() => setCurrentPage('admin-reservations')}
                            variant="featured"
                        />

                        <AdminModuleCard
                            title="Musica"
                            description="Playlist sala, riproduzione e controllo ambiente"
                            meta="Sala / atmosfera / customer experience"
                            onClick={() => setCurrentPage('admin-music')}
                            variant="secondary"
                        />

                        <AdminModuleCard
                            title="Manual Operativo"
                            description="Procedimientos oficiales de apertura, servicio, cierre y control de mesas"
                            meta="Sala / formación / procedimientos"
                            onClick={() => setCurrentPage('admin-manual')}
                            variant="secondary"
                        />
                    </div>
                </div>

                <div className="admin-control-section">
                    <div className="admin-control-section-header">
                        <p className="eyebrow">Carta y contenidos</p>
                        <h3>Gestión de carta</h3>
                    </div>
                    <div className="admin-module-grid">
                        <AdminModuleCard
                            title="Food cost e menu"
                            description="Carta attuale, stime di costo, porzioni e dati da completare"
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
                            title="Orders"
                            description="Ordini condivisi, inventario ingredienti e notifiche Telegram"
                            meta="Food / beverage / fornitori"
                            onClick={() => setCurrentPage('admin-orders')}
                        />

                    </div>
                </div>

                <div className="admin-control-section">
                    <div className="admin-control-section-header">
                        <p className="eyebrow">Control interno</p>
                        <h3>Back office</h3>
                    </div>
                    <div className="admin-module-grid">
                        <AdminModuleCard
                            title="Invoices"
                            description="Carica fatture, OCR, storico prezzi prodotti"
                            meta="Fornitori / prezzi / prossimo ordine"
                            onClick={() => setCurrentPage('admin-invoices')}
                        />
                        <AdminModuleCard
                            title="Analytics"
                            description="Análisis económico, ingresos, gastos y rentabilidad"
                            meta="Acceso privado · Owner / Admin"
                            onClick={() => setCurrentPage('admin-analytics')}
                            variant="featured"
                        />
                    </div>
                </div>
            </div>

            <WorkbookCostSummary setCurrentPage={setCurrentPage} />
        </section>
    )
}
