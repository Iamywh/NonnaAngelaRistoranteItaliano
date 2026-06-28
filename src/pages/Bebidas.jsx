import React from 'react'

import bebidas from '../../data/menu/bebidas.json'

function formatPrice(price) {
  return `${price.toFixed(2).replace('.', ',')}€`
}

function DrinkRow({ item }) {
  return (
    <article className="drink-row">
      <span>{item.name}</span>
      <strong>{formatPrice(item.price)}</strong>
    </article>
  )
}

function ServicePriceRow({ item }) {
  return (
    <article className="drink-row service-price-row">
      <span>{item.name}</span>
      <div className="service-price-list">
        <div>
          <span>Copa</span>
          <strong>{formatPrice(item.prices.copa)}</strong>
        </div>
        <div>
          <span>Chupito</span>
          <strong>{formatPrice(item.prices.chupito)}</strong>
        </div>
      </div>
    </article>
  )
}

function CocktailCard({ item }) {
  return (
    <article className="cocktail-card">
      <div className="cocktail-card-top">
        <h3>{item.name}</h3>
        <strong>{formatPrice(item.price)}</strong>
      </div>

      <p className="cocktail-ingredients">
        {item.ingredients.join(', ')}.
      </p>

      <p className="cocktail-history">{item.history}</p>
    </article>
  )
}

function DrinksSection({ category }) {
  const isCocktailSection = category.layout === 'cocktail'
  const isServicePriceSection = category.layout === 'service-prices'

  return (
    <section className="drinks-section">
      <div className="drinks-section-heading">
        <p className="eyebrow">{category.description}</p>
        <h2>{category.title}</h2>
      </div>

      {isCocktailSection ? (
        <div className="cocktail-grid">
          {category.items.map((item) => (
            <CocktailCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="drink-list">
          {category.items.map((item) => (
            isServicePriceSection ? (
              <ServicePriceRow key={item.id} item={item} />
            ) : (
              <DrinkRow key={item.id} item={item} />
            )
          ))}
        </div>
      )}
    </section>
  )
}

export default function Bebidas() {
  return (
    <section className="content-page drinks-page">
      <div className="drinks-hero">
        <p className="eyebrow">Carta de Bebidas</p>
        <h2>Carta de Bebidas</h2>
        <p>Cócteles, aperitivos, refrescos, cervezas y digestivos.</p>
      </div>

      <div className="drinks-sections">
        {bebidas.categories.map((category) => (
          <DrinksSection key={category.id} category={category} />
        ))}
      </div>
    </section>
  )
}
