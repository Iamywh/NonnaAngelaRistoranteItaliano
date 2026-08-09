import React from 'react'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import {
  getTranslatedBeverageCategory,
  getTranslatedBeverageItem
} from '../i18n/menuContentTranslations.js'

import bebidas from '../../data/menu/bebidas.json'
import '../styles/bebidas-mobile.css'

function formatPrice(price) {
  return `${price.toFixed(2).replace('.', ',')}€`
}

function DrinkRow({ item }) {
  const { language } = useLanguage()
  const translatedItem = getTranslatedBeverageItem(item, language)

  return (
    <article className="drink-row">
      <span>{translatedItem.name}</span>
      <strong>{formatPrice(translatedItem.price)}</strong>
    </article>
  )
}

function ServicePriceRow({ item }) {
  const { language, t } = useLanguage()
  const translatedItem = getTranslatedBeverageItem(item, language)

  return (
    <article className="drink-row service-price-row">
      <span>{translatedItem.name}</span>
      <div className="service-price-list">
        <div>
          <span>{t('bebidas.glass')}</span>
          <strong>{formatPrice(translatedItem.prices.copa)}</strong>
        </div>
        <div>
          <span>{t('bebidas.shot')}</span>
          <strong>{formatPrice(translatedItem.prices.chupito)}</strong>
        </div>
      </div>
    </article>
  )
}

function CocktailCard({ item }) {
  const { language } = useLanguage()
  const translatedItem = getTranslatedBeverageItem(item, language)

  return (
    <article className="cocktail-card">
      <div className="cocktail-card-top">
        <h3>{translatedItem.name}</h3>
        <strong>{formatPrice(translatedItem.price)}</strong>
      </div>
      <p className="cocktail-ingredients">{translatedItem.ingredients.join(', ')}.</p>
      <p className="cocktail-history">{translatedItem.history}</p>
    </article>
  )
}

function DrinksSection({ category }) {
  const { language } = useLanguage()
  const translatedCategory = getTranslatedBeverageCategory(category, language)
  const isCocktailSection = category.layout === 'cocktail'
  const isServicePriceSection = category.layout === 'service-prices'

  return (
    <section className="drinks-section">
      <div className="drinks-section-heading">
        <p className="eyebrow">{translatedCategory.description}</p>
        <h2>{translatedCategory.title}</h2>
      </div>

      {isCocktailSection ? (
        <div className="cocktail-grid">
          {category.items.map((item) => <CocktailCard key={item.id} item={item} />)}
        </div>
      ) : (
        <div className="drink-list">
          {category.items.map((item) => (
            isServicePriceSection ? <ServicePriceRow key={item.id} item={item} /> : <DrinkRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function Bebidas() {
  const { t } = useLanguage()

  return (
    <section className="content-page drinks-page">
      <div className="drinks-hero">
        <p className="eyebrow">{t('bebidas.eyebrow')}</p>
        <h2>{t('bebidas.title')}</h2>
        <p>{t('bebidas.intro')}</p>
      </div>

      <div className="drinks-sections">
        {bebidas.categories.map((category) => <DrinksSection key={category.id} category={category} />)}
      </div>
    </section>
  )
}
