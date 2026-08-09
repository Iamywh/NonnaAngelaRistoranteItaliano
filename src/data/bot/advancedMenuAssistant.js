import antipastiFreddi from '../../../data/menu/AntipastiFreddi.json'
import antipastiCaldi from '../../../data/menu/AntipastiCaldi.json'
import primiPiatti from '../../../data/menu/PrimiPiatti.json'
import secondiPiatti from '../../../data/menu/SecondiPiatti.json'
import especialidadesSemana from '../../../data/menu/EspecialidadesSemana.json'
import contorni from '../../../data/menu/Contorni.json'
import insalate from '../../../data/menu/insalate.json'
import dolci from '../../../data/menu/Dolci.json'
import vini from '../../../data/menu/vini.json'
import bebidas from '../../../data/menu/bebidas.json'
import {
  getTranslatedMenuItem,
  getTranslatedWineDescription,
  getTranslatedBeverageItem
} from '../../i18n/menuContentTranslations.js'

const allFoodItems = [
  ...especialidadesSemana,
  ...antipastiFreddi,
  ...antipastiCaldi,
  ...primiPiatti,
  ...secondiPiatti,
  ...contorni,
  ...insalate,
  ...dolci
]

const wines = vini.wines || []
const cocktails = (bebidas.categories || [])
  .filter((category) => category.layout === 'cocktail')
  .flatMap((category) => category.items || [])

const TEXTS = {
  es: {
    ingredients: 'Ingredientes',
    allergens: 'Alérgenos orientativos',
    price: 'Precio',
    bottle: 'botella',
    glass: 'copa',
    warning: 'Para alergias severas o intolerancias, confirma siempre con nuestro personal antes de pedir.',
    dishIntro: 'Este plato es:',
    menuIntro: 'En esta sección te recomiendo mirar:',
    pairingIntro: 'Para acompañarlo, te recomendaría:',
    wineIntro: 'Te recomendaría estas opciones:',
    cocktailIntro: 'Te puedo contar este cóctel:',
    vegetarianIntro: 'Opciones sin carne ni pescado que pueden encajar:',
    dessertIntro: 'Para terminar, estas son buenas opciones:',
    reserveCta: 'Puedes reservar mesa desde el botón de reservas o pedírmelo por aquí.',
    noSure: 'No lo tengo identificado con seguridad en la carta actual. Puedo ayudarte con antipasti, pastas, segundos, postres, vinos o cócteles.',
    byGlass: 'Disponible también por copa.',
    categoryLabels: {
      antipasti_freddi: 'entrantes fríos',
      antipasti_caldi: 'entrantes calientes',
      primi_piatti: 'pastas y primeros',
      secondi_piatti: 'segundos',
      especialidades_semana: 'especialidades de la semana',
      contorni: 'guarniciones',
      insalate: 'ensaladas',
      dolci: 'postres'
    }
  },
  en: {
    ingredients: 'Ingredients',
    allergens: 'Indicative allergens',
    price: 'Price',
    bottle: 'bottle',
    glass: 'glass',
    warning: 'For severe allergies or intolerances, always confirm with our staff before ordering.',
    dishIntro: 'This dish is:',
    menuIntro: 'In this section, I would recommend looking at:',
    pairingIntro: 'To pair with it, I would recommend:',
    wineIntro: 'I would recommend these options:',
    cocktailIntro: 'Here is the cocktail:',
    vegetarianIntro: 'Options without meat or fish that may fit:',
    dessertIntro: 'To finish, these are good options:',
    reserveCta: 'You can book a table from the reservation button or ask me here.',
    noSure: 'I cannot identify it with certainty in the current menu. I can help with starters, pasta, mains, desserts, wines or cocktails.',
    byGlass: 'Also available by the glass.',
    categoryLabels: {
      antipasti_freddi: 'cold starters',
      antipasti_caldi: 'warm starters',
      primi_piatti: 'pastas and first courses',
      secondi_piatti: 'main courses',
      especialidades_semana: 'weekly specials',
      contorni: 'sides',
      insalate: 'salads',
      dolci: 'desserts'
    }
  },
  fr: {
    ingredients: 'Ingrédients',
    allergens: 'Allergènes indicatifs',
    price: 'Prix',
    bottle: 'bouteille',
    glass: 'verre',
    warning: 'Pour les allergies sévères ou intolérances, confirmez toujours avec notre personnel avant de commander.',
    dishIntro: 'Ce plat est :',
    menuIntro: 'Dans cette section, je vous recommande de regarder :',
    pairingIntro: 'Pour l’accompagner, je recommanderais :',
    wineIntro: 'Je vous recommanderais ces options :',
    cocktailIntro: 'Voici ce cocktail :',
    vegetarianIntro: 'Options sans viande ni poisson qui peuvent convenir :',
    dessertIntro: 'Pour finir, voici de bonnes options :',
    reserveCta: 'Vous pouvez réserver une table avec le bouton de réservation ou me le demander ici.',
    noSure: 'Je ne l’identifie pas avec certitude dans la carte actuelle. Je peux vous aider avec les entrées, pâtes, plats, desserts, vins ou cocktails.',
    byGlass: 'Disponible aussi au verre.',
    categoryLabels: {
      antipasti_freddi: 'entrées froides',
      antipasti_caldi: 'entrées chaudes',
      primi_piatti: 'pâtes et premiers plats',
      secondi_piatti: 'plats principaux',
      especialidades_semana: 'spécialités de la semaine',
      contorni: 'accompagnements',
      insalate: 'salades',
      dolci: 'desserts'
    }
  },
  it: {
    ingredients: 'Ingredienti',
    allergens: 'Allergeni indicativi',
    price: 'Prezzo',
    bottle: 'bottiglia',
    glass: 'calice',
    warning: 'Per allergie severe o intolleranze, conferma sempre con il personale prima di ordinare.',
    dishIntro: 'Questo piatto è:',
    menuIntro: 'In questa sezione ti consiglierei di guardare:',
    pairingIntro: 'Per accompagnarlo, ti consiglierei:',
    wineIntro: 'Ti consiglierei queste opzioni:',
    cocktailIntro: 'Questo cocktail è:',
    vegetarianIntro: 'Opzioni senza carne né pesce che possono andare bene:',
    dessertIntro: 'Per chiudere, queste sono buone opzioni:',
    reserveCta: 'Puoi prenotare dal pulsante reservas o chiedermelo qui.',
    noSure: 'Non lo identifico con certezza nella carta attuale. Posso aiutarti con antipasti, paste, secondi, dolci, vini o cocktail.',
    byGlass: 'Disponibile anche al calice.',
    categoryLabels: {
      antipasti_freddi: 'antipasti freddi',
      antipasti_caldi: 'antipasti caldi',
      primi_piatti: 'paste e primi',
      secondi_piatti: 'secondi',
      especialidades_semana: 'specialità della settimana',
      contorni: 'contorni',
      insalate: 'insalate',
      dolci: 'dolci'
    }
  }
}

const CATEGORY_TRIGGERS = {
  antipasti: ['antipasti', 'entrante', 'entrantes', 'starter', 'starters', 'entrée', 'entrees', 'antipasto'],
  primi: ['pasta', 'pastas', 'primi', 'primeros', 'first courses', 'pates', 'pâtes', 'primi piatti'],
  secondi: ['secondi', 'segundos', 'main', 'mains', 'meat', 'carne', 'viande', 'secondo'],
  dolci: ['postre', 'postres', 'dessert', 'desserts', 'dolce', 'dolci'],
  vegetarian: ['vegetariano', 'vegetarian', 'végétarien', 'vegetariana', 'sin carne', 'without meat', 'sans viande', 'senza carne'],
  allergens: ['alergia', 'alergias', 'allergy', 'allergies', 'allergene', 'allergeni', 'allergènes', 'gluten', 'lactosa', 'lactose', 'leche', 'milk', 'latte', 'nuts', 'frutos secos', 'pescado', 'fish']
}

const FOOD_KEYWORDS = [
  'menu', 'carta', 'plato', 'platos', 'dish', 'dishes', 'piatto', 'piatti', 'manger', 'eat', 'comer', 'mangiare',
  'antipasti', 'pasta', 'postre', 'dessert', 'dolci', 'carne', 'starter', 'main', 'allergen', 'alergia'
]

const PAIRING_TRIGGERS = [
  'maridaje', 'maridar', 'pairing', 'pair', 'with wine', 'wine with', 'vino para', 'vino con', 'vin avec', 'accord', 'abbinamento', 'vino da', 'vino per'
]

const WINE_CATEGORY_TRIGGERS = {
  Rosso: ['tinto', 'red', 'rouge', 'rosso'],
  Bianco: ['blanco', 'white', 'blanc', 'bianco'],
  Rosato: ['rosado', 'rose', 'rosé', 'rosato'],
  Spumante: ['espumoso', 'sparkling', 'bubbles', 'burbuja', 'bollicine', 'prosecco', 'franciacorta'],
  Dolce: ['dulce', 'sweet', 'dessert wine', 'passito', 'vino dulce', 'vin doux', 'vino dolce']
}

const COCKTAIL_TRIGGERS = ['cocktail', 'coctel', 'cóctel', 'spritz', 'negroni', 'americano', 'rossini', 'bellini', 'aperol', 'limoncello', 'campari']

function getText(language) {
  return TEXTS[language] || TEXTS.es
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatPrice(price) {
  if (typeof price === 'number') return `${price.toFixed(2).replace('.', ',')}€`
  if (price && typeof price === 'object') {
    return Object.entries(price)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => `${key}: ${formatPrice(value)}`)
      .join(' / ')
  }
  return null
}

function localizeItem(item, language) {
  const translated = getTranslatedMenuItem(item, language)
  return {
    ...item,
    displayName: translated.name || item.name_es || item.name_it || item.name,
    displayDescription: translated.description || item.description_es || item.description || item.notes,
    displayIngredients: translated.ingredients || item.ingredients_es || item.ingredients || []
  }
}

function getSearchableItemText(item, language) {
  const localized = localizeItem(item, language)
  const translatedLanguages = ['en', 'fr', 'it']
    .map((lang) => getTranslatedMenuItem(item, lang))
    .flatMap((translation) => [translation.name, translation.description, ...(translation.ingredients || [])])

  return normalizeText([
    item.id,
    item.name_it,
    item.name_es,
    item.description_es,
    item.notes,
    localized.displayName,
    localized.displayDescription,
    ...(item.ingredients || []),
    ...(item.ingredients_es || []),
    ...translatedLanguages
  ].filter(Boolean).join(' '))
}

function getSearchableWineText(wine) {
  return normalizeText([
    wine.code,
    wine.name,
    wine.producer,
    wine.category,
    wine.region,
    wine.denomination,
    wine.description
  ].filter(Boolean).join(' '))
}

function getSearchableCocktailText(cocktail, language) {
  const localized = getTranslatedBeverageItem(cocktail, language)
  return normalizeText([
    cocktail.id,
    cocktail.name,
    localized.name,
    cocktail.history,
    localized.history,
    ...(cocktail.ingredients || []),
    ...(localized.ingredients || [])
  ].filter(Boolean).join(' '))
}

function containsAny(normalizedText, tokens) {
  return tokens.some((token) => normalizedText.includes(normalizeText(token)))
}

function findSpecificDish(normalizedText, language) {
  return allFoodItems.find((item) => {
    const searchable = getSearchableItemText(item, language)
    const idMatch = normalizeText(item.id).split('-').some((token) => token.length > 4 && normalizedText.includes(token))
    const nameTokens = normalizeText(localizeItem(item, language).displayName)
      .split(' ')
      .filter((token) => token.length >= 5)

    return idMatch || nameTokens.some((token) => normalizedText.includes(token)) || normalizedText.includes(searchable)
  })
}

function findWine(normalizedText) {
  return wines.find((wine) => {
    const searchable = getSearchableWineText(wine)
    const tokens = normalizeText(`${wine.name} ${wine.producer} ${wine.region}`)
      .split(' ')
      .filter((token) => token.length >= 5)

    return normalizedText.includes(normalizeText(wine.code)) || tokens.some((token) => normalizedText.includes(token)) || normalizedText.includes(searchable)
  })
}

function findCocktail(normalizedText, language) {
  return cocktails.find((cocktail) => {
    const searchable = getSearchableCocktailText(cocktail, language)
    const tokens = normalizeText(cocktail.name).split(' ').filter((token) => token.length >= 5)
    return tokens.some((token) => normalizedText.includes(token)) || normalizedText.includes(searchable)
  })
}

function getAllergens(item) {
  return [...new Set([...(item.allergens_es || []), ...(item.allergens_to_verify || [])])]
}

function buildDishAnswer(item, language) {
  const text = getText(language)
  const localized = localizeItem(item, language)
  const price = formatPrice(item.prezzo_consigliato || item.price || item.recommended_price)
  const allergens = getAllergens(item)

  return [
    `${text.dishIntro} ${localized.displayName}`,
    localized.displayDescription,
    localized.displayIngredients?.length ? `${text.ingredients}: ${localized.displayIngredients.join(', ')}.` : null,
    allergens.length ? `${text.allergens}: ${allergens.join(', ')}.` : null,
    price ? `${text.price}: ${price}.` : null,
    allergens.length ? text.warning : null
  ].filter(Boolean).join('\n')
}

function buildCategoryAnswer(categoryKey, language) {
  const text = getText(language)
  const categoryMap = {
    antipasti: ['antipasti_freddi', 'antipasti_caldi'],
    primi: ['primi_piatti'],
    secondi: ['secondi_piatti', 'especialidades_semana'],
    dolci: ['dolci']
  }
  const categories = categoryMap[categoryKey] || []
  const items = allFoodItems
    .filter((item) => categories.includes(item.category))
    .slice(0, 5)
    .map((item) => localizeItem(item, language))

  if (!items.length) return null

  return [
    categoryKey === 'dolci' ? text.dessertIntro : text.menuIntro,
    '',
    ...items.map((item) => `• ${item.displayName} — ${item.displayDescription}`),
    '',
    text.reserveCta
  ].join('\n')
}

function isMeatOrFishDish(item) {
  const searchable = normalizeText([
    item.name_it,
    item.name_es,
    item.id,
    ...(item.ingredients || []),
    ...(item.ingredients_es || [])
  ].join(' '))

  return containsAny(searchable, [
    'bresaola', 'coppa', 'finocchiona', 'salame', 'mortadella', 'speck', 'guanciale', 'lardo',
    'anchoa', 'anchoas', 'alici', 'pescado', 'pesce', 'gambas', 'gamberi', 'crustaceos',
    'cerdo', 'maiale', 'pancetta', 'ternera', 'vitello', 'arrosticini', 'salsiccia'
  ])
}

function buildVegetarianAnswer(language) {
  const text = getText(language)
  const items = allFoodItems
    .filter((item) => !isMeatOrFishDish(item))
    .filter((item) => !['dolci'].includes(item.category))
    .slice(0, 6)
    .map((item) => localizeItem(item, language))

  return [
    text.vegetarianIntro,
    '',
    ...items.map((item) => `• ${item.displayName} — ${item.displayDescription}`),
    '',
    text.warning
  ].join('\n')
}

function getPairingWineForDish(item) {
  const id = item.id || ''
  const category = item.category || ''
  const searchable = normalizeText([id, item.name_it, item.name_es, ...(item.ingredients || []), ...(item.ingredients_es || [])].join(' '))

  if (category === 'dolci') return wines.find((wine) => wine.code === 'NA-WIN-SWE-001')
  if (containsAny(searchable, ['carbonara', 'cacio', 'gnocchi', 'burrata', 'caprese'])) return wines.find((wine) => wine.code === 'NA-WIN-WHI-008') || wines.find((wine) => wine.category === 'Bianco')
  if (containsAny(searchable, ['amatriciana', 'arrosticini', 'pancetta', 'ternera', 'vitello', 'salame', 'guanciale'])) return wines.find((wine) => wine.code === 'NA-WIN-RED-005') || wines.find((wine) => wine.category === 'Rosso' && wine.by_glass)
  if (containsAny(searchable, ['formaggi', 'quesos', 'parmigiana', 'taleggio'])) return wines.find((wine) => wine.code === 'NA-WIN-RED-003') || wines.find((wine) => wine.category === 'Rosso')
  if (containsAny(searchable, ['mozzarella', 'antipasti', 'verdure', 'insalata'])) return wines.find((wine) => wine.code === 'NA-WIN-SPA-001') || wines.find((wine) => wine.category === 'Spumante')

  return wines.find((wine) => wine.by_glass) || wines[0]
}

function formatWineLine(wine, language) {
  const text = getText(language)
  const bottlePrice = formatPrice(wine.recommended_bottle_price)
  const glassPrice = wine.by_glass && typeof wine.recommended_bottle_price === 'number'
    ? formatPrice(Math.ceil((wine.recommended_bottle_price / 5) * 2) / 2)
    : null
  const description = getTranslatedWineDescription(wine, language)

  return [
    `• ${wine.name} (${wine.region}${wine.denomination ? ` · ${wine.denomination}` : ''})`,
    description,
    bottlePrice ? `${text.price}: ${bottlePrice} ${text.bottle}${glassPrice ? ` / ${glassPrice} ${text.glass}` : ''}.` : null,
    wine.by_glass ? text.byGlass : null
  ].filter(Boolean).join('\n')
}

function buildPairingAnswer(item, language) {
  const text = getText(language)
  const localized = localizeItem(item, language)
  const wine = getPairingWineForDish(item)
  if (!wine) return null

  return [
    `${text.pairingIntro} ${localized.displayName}`,
    '',
    formatWineLine(wine, language)
  ].join('\n')
}

function buildWineAnswerFromMenu(normalizedText, language) {
  const text = getText(language)
  const specificWine = findWine(normalizedText)
  if (specificWine) return formatWineLine(specificWine, language)

  let candidates = wines
  const wantsByGlass = containsAny(normalizedText, ['copa', 'glass', 'verre', 'calice'])
  const selectedCategory = Object.entries(WINE_CATEGORY_TRIGGERS).find(([, triggers]) => containsAny(normalizedText, triggers))?.[0]

  if (wantsByGlass) candidates = candidates.filter((wine) => wine.by_glass)
  if (selectedCategory) candidates = candidates.filter((wine) => wine.category === selectedCategory)

  if (!wantsByGlass && !selectedCategory && !containsAny(normalizedText, ['vino', 'vinos', 'wine', 'wines', 'vin', 'vins'])) return null

  const selected = candidates.slice(0, 3)
  if (!selected.length) return null

  return [
    text.wineIntro,
    '',
    ...selected.map((wine) => formatWineLine(wine, language))
  ].join('\n\n')
}

function buildCocktailAnswerFromMenu(normalizedText, language) {
  if (!containsAny(normalizedText, COCKTAIL_TRIGGERS)) return null

  const text = getText(language)
  const specificCocktail = findCocktail(normalizedText, language)
  const selected = specificCocktail
    ? [specificCocktail]
    : cocktails.filter((cocktail) => {
      const cocktailText = getSearchableCocktailText(cocktail, language)
      if (containsAny(normalizedText, ['fresh', 'fresco', 'frais', 'fresco', 'suave', 'light', 'leggero'])) return containsAny(cocktailText, ['limoncello', 'rossini', 'spritz'])
      if (containsAny(normalizedText, ['amargo', 'bitter', 'amer', 'amaro', 'intenso'])) return containsAny(cocktailText, ['negroni', 'americano'])
      return true
    }).slice(0, 3)

  if (!selected.length) return null

  return [
    specificCocktail ? text.cocktailIntro : text.wineIntro,
    '',
    ...selected.map((cocktail) => {
      const localized = getTranslatedBeverageItem(cocktail, language)
      return [
        `• ${localized.name} — ${formatPrice(cocktail.price)}`,
        localized.ingredients?.length ? `${text.ingredients}: ${localized.ingredients.join(', ')}.` : null,
        localized.history
      ].filter(Boolean).join('\n')
    })
  ].join('\n\n')
}

function getTriggeredCategory(normalizedText) {
  return Object.entries(CATEGORY_TRIGGERS).find(([, triggers]) => containsAny(normalizedText, triggers))?.[0]
}

function hasFoodIntent(normalizedText) {
  return containsAny(normalizedText, FOOD_KEYWORDS) || Boolean(findSpecificDish(normalizedText, 'es'))
}

export function buildAdvancedRestaurantAnswer(userText, language = 'es') {
  const normalizedText = normalizeText(userText)
  const text = getText(language)
  const pairingIntent = containsAny(normalizedText, PAIRING_TRIGGERS)
  const dish = findSpecificDish(normalizedText, language)

  if (pairingIntent && dish) return buildPairingAnswer(dish, language)
  if (containsAny(normalizedText, COCKTAIL_TRIGGERS)) return buildCocktailAnswerFromMenu(normalizedText, language)
  if (containsAny(normalizedText, ['vino', 'vinos', 'wine', 'wines', 'vin', 'vins', 'copa', 'glass', 'verre', 'calice', 'barolo', 'gavi', 'brunello', 'prosecco', 'franciacorta'])) return buildWineAnswerFromMenu(normalizedText, language)
  if (dish) return pairingIntent ? buildPairingAnswer(dish, language) : buildDishAnswer(dish, language)

  const category = getTriggeredCategory(normalizedText)
  if (category === 'vegetarian') return buildVegetarianAnswer(language)
  if (category === 'allergens') return `${text.warning}\n\n${text.noSure}`
  if (category) return buildCategoryAnswer(category, language)

  if (hasFoodIntent(normalizedText)) return text.noSure

  return null
}
