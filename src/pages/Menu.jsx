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
    title: 'Antipasti',
    subtitle: 'Per iniziare con gusto italiano vero.',
    image: '/images/menu/antipasti.jpg',
    type: 'food'
  },
  {
    id: 'primi',
    title: 'Primi piatti',
    subtitle: 'La pasta come centro dell’esperienza.',
    image: '/images/menu/primi.jpg',
    type: 'food'
  },
  {
    id: 'secondi',
    title: 'Secondi piatti',
    subtitle: 'Carne, tradizione e cucina lenta.',
    image: '/images/menu/secondi.jpg',
    type: 'food'
  },
  {
    id: 'contorni',
    title: 'Contorni e insalate',
    subtitle: 'Verdure, patate e accompagnamenti.',
    image: '/images/menu/contorni.jpg',
    type: 'food'
  },
  {
    id: 'dolci',
    title: 'Dolci',
    subtitle: 'Finale italiano, semplice e memorabile.',
    image: '/images/menu/dolci.jpg',
    type: 'food'
  },
  {
    id: 'vini',
    title: 'Carta vini',
    subtitle: 'Bianchi, rossi, rosati e bollicine italiane.',
    image: '/images/menu/vini.jpg',
    type: 'wine'
  },
  {
    id: 'cocktail',
    title: 'Cocktail',
    subtitle: 'Aperitivo italiano e grandi classici.',
    image: '/images/menu/cocktail.jpg',
    type: 'drink'
  },
  {
    id: 'liquori',
    title: 'Liquori e digestivi',
    subtitle: 'Amari, grappe e fine pasto.',
    image: '/images/menu/liquori.jpg',
    type: 'drink'
  }
]

function formatPrice(price) {
  if (price === null || price === undefined) return 'Da definire'

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
    return 'Ingredienti in aggiornamento.'
  }

  return ingredients.join(', ')
}

function getProfitBadge(category) {
  if (!category || category === 'da_calcolare') return null

  return category
}

function DishCard({ item }) {
  const profitBadge = getProfitBadge(item.categoria_profitto)

  return (
    <article className="dish-card">
      <div className="dish-image-placeholder">
        <span>Nonna Angela</span>
      </div>

      <div className="dish-card-body">
        <div className="dish-topline">
          <p className="dish-kicker">{item.category?.replaceAll('_', ' ')}</p>
          {profitBadge && <span className="profit-badge">{profitBadge}</span>}
        </div>

        <h3>{item.name_it || item.name || 'Piatto senza nome'}</h3>

        {item.notes && <p className="dish-note">{item.notes}</p>}

        <p className="dish-ingredients">{formatIngredients(item.ingredients)}</p>

        {Array.isArray(item.allergens_to_verify) && item.allergens_to_verify.length > 0 && (
          <p className="dish-allergens">
            Allergeni da verificare: {item.allergens_to_verify.join(', ')}
          </p>
        )}

        <div className="dish-footer">
          <strong>{formatPrice(item.prezzo_consigliato || item.price)}</strong>
          <span>Wine pairing in arrivo</span>
        </div>
      </div>
    </article>
  )
}

function MenuLanding({ onSelectCategory }) {
  return (
    <>
      <div className="menu-hero">
        <p className="eyebrow">Menu digitale</p>
        <h2>La cucina di Nonna Angela, scelta con calma</h2>
        <p>
          Esplora i piatti, scopri gli abbinamenti vino e lasciati guidare tra
          pasta, tradizione italiana, cocktail e digestivi.
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
              <img src={category.image} alt={category.title} />
            </div>

            <div className="premium-menu-content">
              <span>{category.type === 'food' ? 'Cucina' : 'Carta'}</span>
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
          title: 'Antipasti freddi',
          subtitle: 'Freschi, mediterranei, da condividere',
          items: antipastiFreddi
        },
        {
          title: 'Antipasti caldi',
          subtitle: 'Croccanti, filanti, comfort italiano',
          items: antipastiCaldi
        }
      ]
    }

    if (category.id === 'primi') {
      return [{ title: 'Primi piatti', subtitle: 'Pasta, ragù e tradizione', items: primiPiatti }]
    }

    if (category.id === 'secondi') {
      return [{ title: 'Secondi piatti', subtitle: 'Carne e cucina lenta', items: secondiPiatti }]
    }

    if (category.id === 'contorni') {
      return [
        { title: 'Contorni', subtitle: 'Accompagnamenti caldi e verdure', items: contorni },
        { title: 'Insalate', subtitle: 'Freschezza e semplicità', items: insalate }
      ]
    }

    if (category.id === 'dolci') {
      return [{ title: 'Dolci', subtitle: 'Fine pasto italiano', items: dolci }]
    }

    if (category.id === 'vini') {
      return [{ title: 'Carta vini', subtitle: 'Selezione italiana', items: vini }]
    }

    if (category.id === 'cocktail') {
      return [{ title: 'Cocktail', subtitle: 'Aperitivo e classici', items: cocktail }]
    }

    return []
  }, [category.id])

  return (
    <section className="category-page">
      <button className="back-button" onClick={onBack} type="button">
        ← Torna al menu
      </button>

      <div className="category-header">
        <p className="eyebrow">{category.type === 'food' ? 'Cucina' : 'Carta'}</p>
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
              <p className="dish-kicker">In preparazione</p>
              <h3>Sezione in arrivo</h3>
              <p>Qui collegheremo liquori, amari e grappe.</p>
            </div>

            <strong>Coming soon</strong>
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