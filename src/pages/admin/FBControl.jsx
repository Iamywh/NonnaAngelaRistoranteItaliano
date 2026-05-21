import React from 'react'
import menuCostReport from '../../data/menuCostReport.json'

export default function FBControl({ setCurrentPage }) {
  const items = menuCostReport.items || []
  const highFoodCost = items
    .filter((item) => item.food_cost_percent >= 20)
    .sort((a, b) => b.food_cost_percent - a.food_cost_percent)

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')}>
        ← Torna alla dashboard
      </button>

      <p className="eyebrow">F&B control</p>
      <h2>Controllo menu e marginalità</h2>
      <p className="page-intro">
        Visione manageriale del menu: margini, food cost, alert e decisioni commerciali.
      </p>

      <div className="dashboard-panel">
        <h3>Piatti con food cost più alto</h3>
        <div className="risk-list">
          {highFoodCost.map((item) => (
            <article className="risk-item" key={item.menu_item_id}>
              <div>
                <strong>{item.name_it}</strong>
                <span>{item.category}</span>
              </div>
              <b>{item.food_cost_percent}%</b>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}