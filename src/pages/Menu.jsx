import React, { useState } from 'react'

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
    title: 'Contorni',
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

function CategoryPage({ category, onBack }) {
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

      <div className="dish-grid">
        <article className="dish-card placeholder-card">
          <div>
            <p className="dish-kicker">In preparazione</p>
            <h3>Categoria pronta per i dati reali</h3>
            <p>
              Qui collegheremo i JSON reali con foto, descrizione, prezzo,
              allergeni e wine pairing consigliato.
            </p>
          </div>

          <strong>Coming soon</strong>
        </article>
      </div>
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