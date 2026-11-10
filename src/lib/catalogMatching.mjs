export function normalizeCatalogText(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ').replace(/[-\s]+/g, ' ').trim()
}

const COMMON_WORDS = new Set([
  'alla', 'alle', 'allo', 'con', 'del', 'della', 'delle', 'degli', 'di',
  'de', 'los', 'las', 'with', 'and', 'the', 'des', 'aux', 'avec',
  'spaghetti', 'paccheri', 'linguine', 'gnocchi', 'pasta', 'vino', 'wine', 'vin',
  'cocktail', 'spritz', 'rosso', 'bianco', 'tinto', 'blanco', 'red', 'white'
])

export function findCatalogMatches(query, items, namesForItem) {
  const normalizedQuery = normalizeCatalogText(query)
  const queryWords = new Set(normalizedQuery.split(' '))
  const ranked = items.map(item => {
    const scores = namesForItem(item).filter(Boolean).map(name => {
      const normalizedName = normalizeCatalogText(name)
      const words = normalizedName.split(' ').filter(word => word.length >= 3 && !COMMON_WORDS.has(word))
      const matches = words.filter(word => queryWords.has(word))
      if (!matches.length) return 0
      const fullName = (' ' + normalizedQuery + ' ').includes(' ' + normalizedName + ' ')
      return matches.length + (fullName ? 100 : 0)
    })
    return { item, score: Math.max(0, ...scores) }
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score)

  if (!ranked.length) return []
  return ranked.filter(result => result.score === ranked[0].score).map(result => result.item)
}
