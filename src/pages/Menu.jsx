import React, { useMemo, useState } from 'react'

import antipastiFreddi from '../../data/menu/AntipastiFreddi.json'
import antipastiCaldi from '../../data/menu/AntipastiCaldi.json'
import primiPiatti from '../../data/menu/PrimiPiatti.json'
import secondiPiatti from '../../data/menu/SecondiPiatti.json'
import contorni from '../../data/menu/Contorni.json'
import insalate from '../../data/menu/insalate.json'
import dolci from '../../data/menu/Dolci.json'
import vini from '../../data/menu/vini.json'
import cocktail from '../../data/menu/cocktail.json'

const menuCategories = [
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
      dolci: 'Postres'
    }

    return labels[category] || category?.replaceAll('_', ' ') || 'Menú'
  }

  return (
    <article className="dish-card">
      <div className="dish-image-placeholder">
        <span>Nonna Angela</span>
      </div>

      <div className="dish-card-body">
        <div className="dish-topline">
          <p className="dish-kicker">{formatCategoryLabel(item.category)}</p>
          {item.available === false && <span className="soldout-badge">Non disponibile</span>}
        </div>

        <h3>{item.name_es || item.name_it || item.name || 'Plato sin nombre'}</h3>

        {(item.description_es || item.notes) && (
          <p className="dish-note">{item.description_es || item.notes}</p>
        )}

        <p className="dish-ingredients">
          {formatIngredients(item.ingredients_es || item.ingredients)}
        </p>

        {Array.isArray(item.allergens_es || item.allergens_to_verify) &&
          (item.allergens_es || item.allergens_to_verify).length > 0 && (
            <p className="dish-allergens">
              Alérgenos: {(item.allergens_es || item.allergens_to_verify).join(', ')}
            </p>
          )}

        <div className="dish-footer">
          <strong>
            {formatPrice(
              item.prezzo_consigliato ||
              item.price ||
              item.recommended_price ||
              item.recommended_bottle_price
            )}
          </strong>

          {item.prezzo_consigliato && <span>Maridaje vino</span>}

          {item.recommended_bottle_price && <span>Recomendado con</span>}

          {item.recommended_price && <span>Perfecto con</span>}
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

      <div className="premium-menu-grid">
        {menuCategories.map((category) => (
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

      <div className="dish-grid">
        {items.map((item) => (
          <DishCard key={item.id} item={item} />
        ))}
      </div>
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