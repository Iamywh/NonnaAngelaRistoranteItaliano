import React from 'react'
import menuCostReport from '../../data/menuCostReport.json'

export default function FoodDashboard({ setCurrentPage }) {
  const foodItems = (menuCostReport.items || []).filter(
    (item) => item.category !== 'beverage' && item.sale_price !== null
  )

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')}>
        ← Torna alla dashboard
      </button>

      <p className="eyebrow">Food control</p>
      <h2>Food cost cucina</h2>
      <p className="page-intro">
        Controllo dei piatti food con prezzo, costo stimato, food cost e margine.
      </p>

      <div className="data-table">
        <div className="data-row table-head">
          <span>Piatto</span>
          <span>Categoria</span>
          <span>Prezzo</span>
          <span>Costo</span>
          <span>Food cost</span>
          <span>Margine</span>
        </div>

        {foodItems.map((item) => (
          <div className="data-row" key={item.menu_item_id}>
            <span>{item.name_it}</span>
            <span>{item.category}</span>
            <span>{item.sale_price ? `${item.sale_price.toFixed(2)}€` : '-'}</span>
            <span>{item.estimated_cost ? `${item.estimated_cost.toFixed(2)}€` : '-'}</span>
            <span>{item.food_cost_percent ? `${item.food_cost_percent}%` : '-'}</span>
            <span>{item.gross_margin ? `${item.gross_margin.toFixed(2)}€` : '-'}</span>
          </div>
        ))}
      </div>
    </section>
  )
}