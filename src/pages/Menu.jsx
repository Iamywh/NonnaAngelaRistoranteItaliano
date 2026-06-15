import React, { useMemo, useState } from 'react'

import antipastiFreddi from '../../data/menu/AntipastiFreddi.json'
import antipastiCaldi from '../../data/menu/AntipastiCaldi.json'
import primiPiatti from '../../data/menu/PrimiPiatti.json'
import secondiPiatti from '../../data/menu/SecondiPiatti.json'
import especialidadesSemana from '../../data/menu/EspecialidadesSemana.json'
import contorni from '../../data/menu/Contorni.json'
import insalate from '../../data/menu/insalate.json'
import dolci from '../../data/menu/Dolci.json'
import vini from '../../data/menu/vini.json'
import cocktail from '../../data/menu/cocktail.json'
import softdrinks from '../../data/menu/softdrinks.json'
import amariliquori from '../../data/menu/amariliquori.json'
import allergenDefinitions from '../data/allergens.json'

const menuCategories = [
  {
    id: 'especialidades_semana',
    title: 'Especialidades de la semana',
    subtitle: 'Platos especiales preparados por tiempo limitado.',
    image: '/images/menu/especialidades-semana.jpg',
    type: 'food'
  },
  {
    id: 'antipasti',
    title: 'Entrantes',
    subtitle: 'Para empezar con auténtico sabor italiano.',
    image: '/images/menu/antipasti.jpg',
    type: 'food'
  },
  {
    id: 'primi',
    title: 'Pastas y primeros',
    subtitle: 'La pasta como centro de la experiencia.',
    image: '/images/menu/primi.jpg',
    type: 'food'
  },
  {
    id: 'secondi',
    title: 'Segundos',
    subtitle: 'Carne, tradición y cocina lenta.',
    image: '/images/menu/secondi.jpg',
    type: 'food'
  },
  {
    id: 'contorni',
    title: 'Guarniciones y ensaladas',
    subtitle: 'Verduras, patatas y acompañamientos.',
    image: '/images/menu/contorni.jpg',
    type: 'food'
  },
  {
    id: 'dolci',
    title: 'Postres',
    subtitle: 'Un final italiano, sencillo y memorable.',
    image: '/images/menu/dolci.jpg',
    type: 'food'
  },
  {
    id: 'softdrinks',
    title: 'Refrescos y aguas',
    subtitle: 'Agua, refrescos, tónicas y bebidas sin alcohol.',
    image: '/images/menu/softdrinks.jpg',
    type: 'drink'
  },
  {
    id: 'vini',
    title: 'Carta de vinos',
    subtitle: 'Blancos, tintos, rosados y burbujas italianas.',
    image: '/images/menu/vini.jpg',
    type: 'wine'
  },
  {
    id: 'cocktail',
    title: 'Cócteles',
    subtitle: 'Aperitivo italiano y grandes clásicos.',
    image: '/images/menu/cocktail.jpg',
    type: 'drink'
  },
  {
    id: 'liquori',
    title: 'Licores y digestivos',
    subtitle: 'Amari, grappas y final de comida.',
    image: '/images/menu/liquori.jpg',
    type: 'drink'
  }
]

const FOOD_MENU_UNDER_RENOVATION = false
const RENOVATION_VISIBLE_CATEGORIES = ['vini', 'cocktail']

function FoodMenuRenovationNotice() {
  return (
    <section className="food-menu-renovation-notice">
      <div className="food-menu-renovation-card">
        <div className="food-menu-renovation-icon" aria-hidden="true">🍷</div>
        <div>
          <h2>Carta de cocina en renovación</h2>
          <p>
            Estamos ajustando nuestra propuesta gastronómica y actualizando nuestros precios para ofrecerte una experiencia más clara, auténtica y equilibrada.
          </p>
          <p>
            Mientras tanto, puedes seguir consultando nuestra carta de vinos y cócteles.
          </p>
          <p>
            Muy pronto podrás descubrir aquí la nueva carta de Nonna Angela.
          </p>
          <p className="thanks-line">Gracias por tu paciencia.</p>
        </div>
      </div>
    </section>
  )
}

const PRICE_LABELS = {
  copa: 'Copa',
  chupito: 'Chupito',
  combinado: 'Combinado'
}

const ALLERGENS_BY_ID = new Map(
  allergenDefinitions.map((allergen) => [allergen.id, allergen])
)

const ALLERGEN_ALIASES = {
  gluten: 'gluten',
  glutine: 'gluten',
  crustaceos: 'crustaceos',
  crostacei: 'crustaceos',
  huevos: 'huevos',
  uova: 'huevos',
  pescado: 'pescado',
  pesce: 'pescado',
  cacahuetes: 'cacahuetes',
  arachidi: 'cacahuetes',
  soja: 'soja',
  soia: 'soja',
  leche: 'leche',
  latte: 'leche',
  'frutos secos': 'frutos_secos',
  'frutta a guscio': 'frutos_secos',
  pistacho: 'frutos_secos',
  pistacchio: 'frutos_secos',
  apio: 'apio',
  sedano: 'apio',
  mostaza: 'mostaza',
  senape: 'mostaza',
  sesamo: 'sesamo',
  sulfitos: 'sulfitos',
  solfiti: 'sulfitos',
  altramuces: 'altramuces',
  lupini: 'altramuces',
  moluscos: 'moluscos',
  molluschi: 'moluscos'
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
  const allergenValues = [
    item.allergens,
    item.allergens_es,
    item.allergens_to_verify
  ]
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

function formatPrice(price) {
  if (price === null || price === undefined) return 'Por definir'

  if (typeof price === 'number') {
    return `${price.toFixed(2).replace('.', ',')}€`
  }

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

function formatIngredients(ingredients = []) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return 'Ingredientes en actualización.'
  }

  return ingredients.join(', ')
}


function DishCard({ item }) {

  function formatCategoryLabel(category) {
    const labels = {
      antipasti_freddi: 'Entrantes fríos',
      antipasti_caldi: 'Entrantes calientes',
      primi_piatti: 'Pastas y primeros',
      secondi_piatti: 'Segundos',
      contorni: 'Guarniciones',
      insalate: 'Ensaladas',
      dolci: 'Postres',
      especialidades_semana: 'Especialidades de la semana'
    }

    return labels[category] || category?.replaceAll('_', ' ') || 'Menú'
  }
  const glassPrice = item.by_glass
    ? item.recommended_glass_price || calculateGlassPrice(item.recommended_bottle_price)
    : null
  const servicePrices = getVisiblePriceEntries(item.recommended_price)
  const allergens = getItemAllergens(item)
  
  return (
    <article className="dish-card">
      <div className="dish-image-placeholder">
        <span>Nonna Angela</span>
      </div>

      <div className="dish-card-body">
        {item.image && (
          <img
            src={item.image}
            alt={item.name || item.title || 'Plato de Nonna Angela'}
            className="dish-card-image"
            loading="lazy"
          />
        )}
        <div className="dish-topline">
          <p className="dish-kicker">{formatCategoryLabel(item.category)}</p>
          {item.available === false && <span className="soldout-badge">Non disponibile</span>}
        </div>

        <h3>{item.name_es || item.name_it || item.name || 'Plato sin nombre'}</h3>

        {item.producer && (
          <p className="wine-meta">
            {item.producer}
            {item.region ? ` · ${item.region}` : ''}
            {item.denomination ? ` · ${item.denomination}` : ''}
          </p>
        )}

        {!item.producer && item.format && (
          <p className="wine-meta">
            {item.category}
            {item.format ? ` · ${item.format}` : ''}
          </p>
        )}

        {(item.description_es || item.description || item.notes) && (
          <p className="dish-note">
            {item.description_es || item.description || item.notes}
          </p>
        )}

        <p className="dish-ingredients">
          {formatIngredients(item.ingredients_es || item.ingredients)}
        </p>

        {allergens.length > 0 && (
          <div className="dish-allergen-list">
            <span className="dish-allergen-title">Alérgenos</span>
            <div className="allergen-badges">
              {allergens.map((allergenId) => {
                const allergen = getAllergenInfo(allergenId)

                return (
                  <span className="allergen-badge" key={allergenId}>
                    <span aria-hidden="true">{allergen.icon}</span>
                    {allergen.name_es}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <div className="dish-footer">
          {item.recommended_bottle_price ? (
            <div className="wine-price-block">
              {glassPrice && (
                <div>
                  <span>Copa</span>
                  <strong>{formatPrice(glassPrice)}</strong>
                </div>
              )}

              <div>
                <span>Botella</span>
                <strong>{formatPrice(item.recommended_bottle_price)}</strong>
              </div>
            </div>
          ) : servicePrices.length > 0 ? (
            <div className="wine-price-block">
              {servicePrices.map(([key, value]) => (
                <div key={`${item.code || item.name}-${key}`}>
                  <span>{PRICE_LABELS[key] || key}</span>
                  <strong>{formatPrice(value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <>
              <strong>
                {formatPrice(
                  item.prezzo_consigliato ||
                  item.price ||
                  item.recommended_price
                )}
              </strong>

              {item.prezzo_consigliato && <span>Maridaje vino</span>}
              {item.recommended_price && (
                <span>{item.format ? 'Unidad' : 'Perfecto con'}</span>
              )}
            </>
          )}
        </div>
        {Array.isArray(item.pairing) && item.pairing.length > 0 && (
          <div className="pairing-list">
            <p>Recomendado con:</p>
            <ul>
              {item.pairing.map((pairingItem) => (
                <li key={pairingItem}>{pairingItem}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  )
}

function MenuLanding({ onSelectCategory }) {
  const visibleCategories = FOOD_MENU_UNDER_RENOVATION
    ? menuCategories.filter((category) => RENOVATION_VISIBLE_CATEGORIES.includes(category.id))
    : menuCategories

  return (
    <>
      <div className="menu-hero">
        <p className="eyebrow">Menú digital</p>
        <h2>La cocina de Nonna Angela, elegida con calma</h2>
        <p>
          Explora los platos, descubre los maridajes y déjate guiar entre
          pasta, tradición italiana, cócteles y digestivos.
        </p>
      </div>

      {FOOD_MENU_UNDER_RENOVATION && <FoodMenuRenovationNotice />}

      <div className="premium-menu-grid">
        {visibleCategories.map((category) => (
          <button
            key={category.id}
            className="premium-menu-card"
            onClick={() => onSelectCategory(category)}
            type="button"
          >
            <div className="premium-menu-image">
              <img
                src={category.image}
                alt={category.title}
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            </div>

            <div className="premium-menu-content">
              <span>{category.type === 'food' ? 'Cocina' : 'Carta'}</span>
              <h3>{category.title}</h3>
              <p>{category.subtitle}</p>
            </div>
          </button>
        ))}
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

      {items.map((item, index) => (
        <DishCard
          key={item.id || item.code || item.name || `${title}-${index}`}
          item={item}
        />
      ))}
    </div>
  )
}

function CategoryPage({ category, onBack }) {
  const sections = useMemo(() => {
    if (category.id === 'antipasti') {
      return [
        {
          title: 'Entrantes fríos',
          subtitle: 'Frescos, mediterráneos, para compartir',
          items: antipastiFreddi
        },
        {
          title: 'Entrantes calientes',
          subtitle: 'Crujientes, fundentes, puro comfort italiano',
          items: antipastiCaldi
        }
      ]
    }

    if (category.id === 'primi') {
      return [{ title: 'Pastas y primeros', subtitle: 'Pasta, ragù y tradición', items: primiPiatti }]
    }

    if (category.id === 'secondi') {
      return [{ title: 'Segundos', subtitle: 'Carne y cocina lenta', items: secondiPiatti }]
    }

    if (category.id === 'especialidades_semana') {
      return [{ title: 'Especialidades de la semana', subtitle: 'Platos especiales de temporada', items: especialidadesSemana }]
    }

    if (category.id === 'contorni') {
      return [
        { title: 'Guarniciones', subtitle: 'Acompañamientos calientes y verduras', items: contorni },
        { title: 'Ensaladas', subtitle: 'Frescura y sencillez', items: insalate }
      ]
    }

    if (category.id === 'dolci') {
      return [{ title: 'Postres', subtitle: 'Final italiano', items: dolci }]
    }

    if (category.id === 'vini') {
      return [{ title: 'Carta de vinos', subtitle: 'Selección italiana', items: vini.wines || [] }]
    }

    if (category.id === 'cocktail') {
      return [{ title: 'Cócteles', subtitle: 'Aperitivo y clásicos', items: cocktail.cocktails || [] }]
    }

    if (category.id === 'softdrinks') {
      return [{ title: 'Refrescos y aguas', subtitle: 'Bebidas frías sin alcohol', items: softdrinks.softdrinks || [] }]
    }

    if (category.id === 'liquori') {
      return [{ title: 'Licores y digestivos', subtitle: 'Amari, grappas y final de comida', items: amariliquori.liquors || [] }]
    }

    return []
  }, [category.id])

  return (
    <section className="category-page">
      <button className="back-button" onClick={onBack} type="button">
        ← Volver al menú
      </button>

      <div className="category-header">
        <p className="eyebrow">{category.type === 'food' ? 'Cocina' : 'Carta'}</p>
        <h2>{category.title}</h2>
        <p>{category.subtitle}</p>
      </div>

      <p className="allergen-disclaimer">
        Información sobre alérgenos orientativa. Para alergias severas o intolerancias, consulta siempre con nuestro personal.
      </p>

      {sections.length > 0 ? (
        sections.map((section) => (
          <SectionBlock
            key={section.title}
            title={section.title}
            subtitle={section.subtitle}
            items={section.items}
          />
        ))
      ) : (
        <div className="dish-grid">
          <article className="dish-card placeholder-card">
            <div>
              <p className="dish-kicker">En preparación</p>
              <h3>Sección en camino</h3>
              <p>Aquí conectaremos licores, amari y grappas.</p>
            </div>

            <strong>Próximamente</strong>
          </article>
        </div>
      )}
    </section>
  )
}

export default function Menu() {
  const [selectedCategory, setSelectedCategory] = useState(null)

  return (
    <section className="content-page menu-page">
      {!selectedCategory ? (
        <MenuLanding onSelectCategory={setSelectedCategory} />
      ) : (
        <CategoryPage
          category={selectedCategory}
          onBack={() => setSelectedCategory(null)}
        />
      )}
    </section>
  )
}
