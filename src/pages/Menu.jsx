import React, { useMemo, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext.jsx'

import antipastiFreddi from '../../data/menu/AntipastiFreddi.json'
import antipastiCaldi from '../../data/menu/AntipastiCaldi.json'
import primiPiatti from '../../data/menu/PrimiPiatti.json'
import secondiPiatti from '../../data/menu/SecondiPiatti.json'
import especialidadesSemana from '../../data/menu/EspecialidadesSemana.json'
import contorni from '../../data/menu/Contorni.json'
import insalate from '../../data/menu/insalate.json'
import dolci from '../../data/menu/Dolci.json'
import vini from '../../data/menu/vini.json'
import allergenDefinitions from '../data/allergens.json'

const menuCategories = [
  { id: 'especialidades_semana', image: '/images/menu/especialidades-semana.jpg', type: 'food' },
  { id: 'antipasti', image: '/images/menu/antipasti.jpg', type: 'food' },
  { id: 'primi', image: '/images/menu/primi.jpg', type: 'food' },
  { id: 'secondi', image: '/images/menu/secondi.jpg', type: 'food' },
  { id: 'contorni', image: '/images/menu/contorni.jpg', type: 'food' },
  { id: 'dolci', image: '/images/menu/dolci.jpg', type: 'food' },
  { id: 'vini', image: '/images/menu/vini.jpg', type: 'wine' },
  { id: 'bebidas', image: '/images/menu/cocktail.jpg', type: 'drink', navTarget: 'bebidas' }
]

const FOOD_MENU_UNDER_RENOVATION = false
const RENOVATION_VISIBLE_CATEGORIES = ['vini', 'bebidas']
const PRICE_LABELS = { copa: 'glass', chupito: 'shot', combinado: 'combinado' }

const ALLERGENS_BY_ID = new Map(allergenDefinitions.map((allergen) => [allergen.id, allergen]))
const ALLERGEN_ALIASES = {
  gluten: 'gluten', glutine: 'gluten', crustaceos: 'crustaceos', crostacei: 'crustaceos', huevos: 'huevos', uova: 'huevos', pescado: 'pescado', pesce: 'pescado', cacahuetes: 'cacahuetes', arachidi: 'cacahuetes', soja: 'soja', soia: 'soja', leche: 'leche', latte: 'leche', 'frutos secos': 'frutos_secos', 'frutta a guscio': 'frutos_secos', pistacho: 'frutos_secos', pistacchio: 'frutos_secos', apio: 'apio', sedano: 'apio', mostaza: 'mostaza', senape: 'mostaza', sesamo: 'sesamo', sulfitos: 'sulfitos', solfiti: 'sulfitos', altramuces: 'altramuces', lupini: 'altramuces', moluscos: 'moluscos', molluschi: 'moluscos'
}

function FoodMenuRenovationNotice() {
  const { t } = useLanguage()

  return (
    <section className="food-menu-renovation-notice">
      <div className="food-menu-renovation-card">
        <div className="food-menu-renovation-icon" aria-hidden="true">🍷</div>
        <div>
          <h2>{t('menu.renovationTitle')}</h2>
          <p>{t('menu.renovation1')}</p>
          <p>{t('menu.renovation2')}</p>
          <p>{t('menu.renovation3')}</p>
          <p className="thanks-line">{t('menu.thanks')}</p>
        </div>
      </div>
    </section>
  )
}

function normalizeAllergenId(value) {
  const rawValue = typeof value === 'object' && value !== null ? value.id : value
  if (!rawValue) return null

  const normalizedValue = String(rawValue)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

  return ALLERGEN_ALIASES[normalizedValue] || null
}

function getItemAllergens(item) {
  const allergenValues = [item.allergens, item.allergens_es, item.allergens_to_verify]
    .flatMap((value) => {
      if (Array.isArray(value)) return value
      if (typeof value === 'string') return value.split(/[,;/]/)
      return []
    })
    .map(normalizeAllergenId)
    .filter(Boolean)

  return [...new Set(allergenValues)]
}

function getAllergenInfo(allergenId) {
  return ALLERGENS_BY_ID.get(allergenId)
}

function getVisiblePriceEntries(price) {
  if (!price || typeof price !== 'object' || Array.isArray(price)) return []

  return ['copa', 'chupito', 'combinado']
    .map((key) => [key, price[key]])
    .filter(([, value]) => typeof value === 'number')
}

function formatPrice(price, t) {
  if (price === null || price === undefined) return t('menu.undefinedPrice')

  if (typeof price === 'number') return `${price.toFixed(2).replace('.', ',')}€`

  if (typeof price === 'object') {
    return Object.entries(price)
      .map(([key, value]) => {
        if (typeof value !== 'number') return null
        const label = key.charAt(0).toUpperCase() + key.slice(1)
        return `${label}: ${value.toFixed(2).replace('.', ',')}€`
      })
      .filter(Boolean)
      .join(' / ')
  }

  return String(price)
}

function calculateGlassPrice(bottlePrice) {
  if (typeof bottlePrice !== 'number') return null
  const rawGlassPrice = bottlePrice / 5
  return Math.ceil(rawGlassPrice * 2) / 2
}

function getLocalizedField(item, baseField, language) {
  const languageMap = { es: 'es', en: 'en', fr: 'fr', it: 'it' }
  const suffix = languageMap[language] || 'es'

  return item[`${baseField}_${suffix}`] || item[`${baseField}_es`] || item[`${baseField}_it`] || item[baseField]
}

function formatIngredients(item, language, t) {
  const ingredients = getLocalizedField(item, 'ingredients', language) || item.ingredients
  if (!Array.isArray(ingredients) || ingredients.length === 0) return t('menu.ingredientsUpdate')
  return ingredients.join(', ')
}

function getCategoryLabel(category, t) {
  const labels = {
    antipasti_freddi: t('menu.sections.antipastiFreddi.0'),
    antipasti_caldi: t('menu.sections.antipastiCaldi.0'),
    primi_piatti: t('menu.sections.primi.0'),
    secondi_piatti: t('menu.sections.secondi.0'),
    contorni: t('menu.sections.contorni.0'),
    insalate: t('menu.sections.insalate.0'),
    dolci: t('menu.sections.dolci.0'),
    especialidades_semana: t('menu.sections.especialidades.0')
  }

  return labels[category] || category?.replaceAll('_', ' ') || t('nav.menu')
}

function DishCard({ item }) {
  const { language, t } = useLanguage()
  const glassPrice = item.by_glass ? item.recommended_glass_price || calculateGlassPrice(item.recommended_bottle_price) : null
  const servicePrices = getVisiblePriceEntries(item.recommended_price)
  const allergens = getItemAllergens(item)
  const name = getLocalizedField(item, 'name', language) || item.name || t('nav.menu')
  const description = getLocalizedField(item, 'description', language) || item.description || item.notes

  return (
    <article className="dish-card">
      <div className="dish-image-placeholder"><span>Nonna Angela</span></div>

      <div className="dish-card-body">
        {item.image && <img src={item.image} alt={name} className="dish-card-image" loading="lazy" />}
        <div className="dish-topline">
          <p className="dish-kicker">{getCategoryLabel(item.category, t)}</p>
          {item.available === false && <span className="soldout-badge">{t('menu.soldout')}</span>}
        </div>

        <h3>{name}</h3>

        {item.producer && (
          <p className="wine-meta">
            {item.producer}{item.region ? ` · ${item.region}` : ''}{item.denomination ? ` · ${item.denomination}` : ''}
          </p>
        )}

        {!item.producer && item.format && <p className="wine-meta">{item.category}{item.format ? ` · ${item.format}` : ''}</p>}
        {description && <p className="dish-note">{description}</p>}
        <p className="dish-ingredients">{formatIngredients(item, language, t)}</p>

        {allergens.length > 0 && (
          <div className="dish-allergen-list">
            <span className="dish-allergen-title">{t('menu.allergens')}</span>
            <div className="allergen-badges">
              {allergens.map((allergenId) => {
                const allergen = getAllergenInfo(allergenId)
                if (!allergen) return null
                const allergenName = allergen[`name_${language}`] || allergen.name_es || allergen.name

                return (
                  <span className="allergen-badge" key={allergenId}>
                    <span aria-hidden="true">{allergen.icon}</span>
                    {allergenName}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <div className="dish-footer">
          {item.recommended_bottle_price ? (
            <div className="wine-price-block">
              {glassPrice && <div><span>{t('menu.glass')}</span><strong>{formatPrice(glassPrice, t)}</strong></div>}
              <div><span>{t('menu.bottle')}</span><strong>{formatPrice(item.recommended_bottle_price, t)}</strong></div>
            </div>
          ) : servicePrices.length > 0 ? (
            <div className="wine-price-block">
              {servicePrices.map(([key, value]) => (
                <div key={`${item.code || item.name}-${key}`}>
                  <span>{key === 'copa' ? t('menu.glass') : PRICE_LABELS[key] || key}</span>
                  <strong>{formatPrice(value, t)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <>
              <strong>{formatPrice(item.prezzo_consigliato || item.price || item.recommended_price, t)}</strong>
              {item.prezzo_consigliato && <span>{t('menu.winePairing')}</span>}
              {item.recommended_price && <span>{item.format ? t('menu.unit') : t('menu.perfectWith')}</span>}
            </>
          )}
        </div>

        {Array.isArray(item.pairing) && item.pairing.length > 0 && (
          <div className="pairing-list">
            <p>{t('menu.recommendedWith')}</p>
            <ul>{item.pairing.map((pairingItem) => <li key={pairingItem}>{pairingItem}</li>)}</ul>
          </div>
        )}
      </div>
    </article>
  )
}

function MenuLanding({ onSelectCategory, setCurrentPage }) {
  const { t } = useLanguage()
  const visibleCategories = FOOD_MENU_UNDER_RENOVATION
    ? menuCategories.filter((category) => RENOVATION_VISIBLE_CATEGORIES.includes(category.id))
    : menuCategories

  return (
    <>
      <div className="menu-hero">
        <p className="eyebrow">{t('menu.heroEyebrow')}</p>
        <h2>{t('menu.heroTitle')}</h2>
        <p>{t('menu.heroText')}</p>
      </div>

      {FOOD_MENU_UNDER_RENOVATION && <FoodMenuRenovationNotice />}

      <div className="premium-menu-grid">
        {visibleCategories.map((category) => {
          const [title, subtitle] = t(`menu.categories.${category.id}`)

          return (
            <button
              key={category.id}
              className="premium-menu-card"
              onClick={() => {
                if (category.navTarget) {
                  setCurrentPage(category.navTarget)
                  return
                }
                onSelectCategory(category)
              }}
              type="button"
            >
              <div className="premium-menu-image">
                <img src={category.image} alt={title} onError={(event) => { event.currentTarget.style.display = 'none' }} />
              </div>

              <div className="premium-menu-content">
                <span>{category.type === 'food' ? t('menu.kitchen') : t('menu.carta')}</span>
                <h3>{title}</h3>
                <p>{subtitle}</p>
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

function SectionBlock({ title, subtitle, items }) {
  if (!items || items.length === 0) return null

  return (
    <div className="menu-data-section">
      <div className="section-heading">
        <p className="eyebrow">{subtitle}</p>
        <h3>{title}</h3>
      </div>

      {items.map((item, index) => <DishCard key={item.id || item.code || item.name || `${title}-${index}`} item={item} />)}
    </div>
  )
}

function CategoryPage({ category, onBack }) {
  const { t } = useLanguage()
  const [categoryTitle, categorySubtitle] = t(`menu.categories.${category.id}`)

  const sections = useMemo(() => {
    if (category.id === 'antipasti') {
      return [
        { title: t('menu.sections.antipastiFreddi.0'), subtitle: t('menu.sections.antipastiFreddi.1'), items: antipastiFreddi },
        { title: t('menu.sections.antipastiCaldi.0'), subtitle: t('menu.sections.antipastiCaldi.1'), items: antipastiCaldi }
      ]
    }
    if (category.id === 'primi') return [{ title: t('menu.sections.primi.0'), subtitle: t('menu.sections.primi.1'), items: primiPiatti }]
    if (category.id === 'secondi') return [{ title: t('menu.sections.secondi.0'), subtitle: t('menu.sections.secondi.1'), items: secondiPiatti }]
    if (category.id === 'especialidades_semana') return [{ title: t('menu.sections.especialidades.0'), subtitle: t('menu.sections.especialidades.1'), items: especialidadesSemana }]
    if (category.id === 'contorni') {
      return [
        { title: t('menu.sections.contorni.0'), subtitle: t('menu.sections.contorni.1'), items: contorni },
        { title: t('menu.sections.insalate.0'), subtitle: t('menu.sections.insalate.1'), items: insalate }
      ]
    }
    if (category.id === 'dolci') return [{ title: t('menu.sections.dolci.0'), subtitle: t('menu.sections.dolci.1'), items: dolci }]
    if (category.id === 'vini') return [{ title: t('menu.sections.vini.0'), subtitle: t('menu.sections.vini.1'), items: vini.wines || [] }]
    return []
  }, [category.id, t])

  return (
    <section className="category-page">
      <button className="back-button" onClick={onBack} type="button">{t('menu.back')}</button>

      <div className="category-header">
        <p className="eyebrow">{category.type === 'food' ? t('menu.kitchen') : t('menu.carta')}</p>
        <h2>{categoryTitle}</h2>
        <p>{categorySubtitle}</p>
      </div>

      <p className="allergen-disclaimer">{t('menu.allergensDisclaimer')}</p>

      {sections.length > 0 ? (
        sections.map((section) => <SectionBlock key={section.title} title={section.title} subtitle={section.subtitle} items={section.items} />)
      ) : (
        <div className="dish-grid">
          <article className="dish-card placeholder-card">
            <div>
              <p className="dish-kicker">{t('menu.placeholderKicker')}</p>
              <h3>{t('menu.placeholderTitle')}</h3>
              <p>{t('menu.placeholderText')}</p>
            </div>
            <strong>{t('menu.soon')}</strong>
          </article>
        </div>
      )}
    </section>
  )
}

export default function Menu({ setCurrentPage }) {
  const [selectedCategory, setSelectedCategory] = useState(null)

  return (
    <section className="content-page menu-page">
      {!selectedCategory ? (
        <MenuLanding onSelectCategory={setSelectedCategory} setCurrentPage={setCurrentPage} />
      ) : (
        <CategoryPage category={selectedCategory} onBack={() => setSelectedCategory(null)} />
      )}
    </section>
  )
}
