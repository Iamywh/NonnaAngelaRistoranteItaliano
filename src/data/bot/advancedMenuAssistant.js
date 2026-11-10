import { foodMenu as allFoodItems } from '../foodMenu.js'
import { findCatalogMatches } from '../../lib/catalogMatching.mjs'
import beverageProfiles from './publicBeverageProfiles.json'
import allergenDefinitions from '../allergens.json'
import { getItemAllergens } from '../../lib/menuAllergens.mjs'
import vini from '../../../data/menu/vini.json'
import bebidas from '../../../data/menu/bebidas.json'
import {
  getTranslatedMenuItem,
  getTranslatedWineDescription,
  getTranslatedBeverageItem
} from '../../i18n/menuContentTranslations.js'

const wines = vini.wines || []
const cocktails = (bebidas.categories || [])
  .filter((category) => category.layout === 'cocktail')
  .flatMap((category) => category.items || [])

const TEXTS = {
  es: {
    clarify: "¿A cuál de estas opciones te refieres?",
    grapes: "Uvas",
    temperature: "Servicio",
    style: "Estilo",
    profile: "Perfil",
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
    clarify: "Which of these options do you mean?",
    grapes: "Grapes",
    temperature: "Serving temperature",
    style: "Style",
    profile: "Profile",
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
    clarify: "De laquelle de ces options parlez-vous ?",
    grapes: "Cépages",
    temperature: "Température de service",
    style: "Style",
    profile: "Profil",
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
    clarify: "A quale di queste proposte ti riferisci?",
    grapes: "Uve",
    temperature: "Temperatura di servizio",
    style: "Stile",
    profile: "Profilo",
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

const COCKTAIL_TRIGGERS = [...cocktails.map(cocktail => cocktail.name), 'cocktail', 'coctel', 'cóctel', 'spritz', 'negroni', 'americano', 'rossini', 'bellini', 'aperol', 'limoncello', 'campari']

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

function findDishes(normalizedText, language) {
  return findCatalogMatches(normalizedText, allFoodItems, item => [
    item.id, item.name_it, item.name_es, item.name_en, item.name_fr,
    localizeItem(item, language).displayName
  ])
}

function findWines(normalizedText) {
  return findCatalogMatches(normalizedText, wines, wine => [
    wine.code, wine.name, wine.producer
  ])
}

function findCocktails(normalizedText) {
  return findCatalogMatches(normalizedText, cocktails, cocktail => [cocktail.id, cocktail.name])
}

function buildClarification(items, language, label) {
  const text = getText(language)
  return [
    text.clarify,
    ...items.slice(0, 6).map(item => '• ' + label(item))
  ].join('\n')
}

const ALLERGEN_NAMES = {
  en: {
    gluten: 'Gluten', crustaceos: 'Crustaceans', huevos: 'Eggs', pescado: 'Fish',
    cacahuetes: 'Peanuts', soja: 'Soy', leche: 'Milk', frutos_secos: 'Nuts',
    apio: 'Celery', mostaza: 'Mustard', sesamo: 'Sesame', sulfitos: 'Sulphites',
    altramuces: 'Lupin', moluscos: 'Molluscs'
  },
  fr: {
    gluten: 'Gluten', crustaceos: 'Crustacés', huevos: 'Œufs', pescado: 'Poisson',
    cacahuetes: 'Arachides', soja: 'Soja', leche: 'Lait', frutos_secos: 'Fruits à coque',
    apio: 'Céleri', mostaza: 'Moutarde', sesamo: 'Sésame', sulfitos: 'Sulfites',
    altramuces: 'Lupin', moluscos: 'Mollusques'
  }
}

function getAllergens(item, language) {
  return getItemAllergens(item).map(id => {
    const definition = allergenDefinitions.find(allergen => allergen.id === id)
    return ALLERGEN_NAMES[language]?.[id] || definition?.['name_' + language] || definition?.name_es
  }).filter(Boolean)
}

function buildDishAnswer(item, language) {
  const text = getText(language)
  const localized = localizeItem(item, language)
  const price = formatPrice(item.prezzo_consigliato || item.price || item.recommended_price)
  const allergens = getAllergens(item, language)

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
    'cerdo', 'maiale', 'pancetta', 'ternera', 'vitello', 'arrosticini', 'salsiccia',
    'scoglio', 'marisco', 'frutti di mare', 'cozze', 'vongole', 'mejillones',
    'almejas', 'ragu', 'bolognese', 'pollo', 'manzo', 'agnello', 'pecora', 'porchetta',
    'granchio', 'cangrejo', 'crab', 'calamari', 'polpo', 'tonno', 'atun', 'tuna'
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
  const profile = beverageProfiles.wines.find(item => item.code === wine.code)

  return [
    `• ${wine.name} (${wine.region}${wine.denomination ? ` · ${wine.denomination}` : ''})`,
    description,
    profile?.grapes?.length ? text.grapes + ': ' + profile.grapes.join(', ') + '.' : null,
    profile?.service_temperature ? text.temperature + ': ' + profile.service_temperature + '.' : null,
    language === 'es' && profile?.body ? text.profile + ': cuerpo ' + profile.body + '.' : null,
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
  const matches = findWines(normalizedText)
  if (matches.length > 1) return buildClarification(matches, language, wine => wine.name)
  const specificWine = matches[0]
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
  const matches = findCocktails(normalizedText)
  if (matches.length > 1) return buildClarification(matches, language, cocktail => cocktail.name)
  const specificCocktail = matches[0]
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
      const profile = beverageProfiles.cocktails.find(item => item.id === cocktail.id)
      return [
        `• ${localized.name} — ${formatPrice(cocktail.price)}`,
        localized.ingredients?.length ? `${text.ingredients}: ${localized.ingredients.join(', ')}.` : null,
        localized.history,
        language === 'es' && profile?.style?.length ? text.style + ': ' + profile.style.join(', ') + '.' : null
      ].filter(Boolean).join('\n')
    })
  ].join('\n\n')
}

function getTriggeredCategory(normalizedText) {
  return Object.entries(CATEGORY_TRIGGERS).find(([, triggers]) => containsAny(normalizedText, triggers))?.[0]
}

function hasFoodIntent(normalizedText) {
  return containsAny(normalizedText, FOOD_KEYWORDS) || findDishes(normalizedText, 'es').length > 0
}

export function buildAdvancedRestaurantAnswer(userText, language = 'es') {
  const normalizedText = normalizeText(userText)
  const text = getText(language)
  const pairingIntent = containsAny(normalizedText, PAIRING_TRIGGERS)
  const dishes = findDishes(normalizedText, language)
  const dish = dishes.length === 1 ? dishes[0] : null

  if (containsAny(normalizedText, CATEGORY_TRIGGERS.vegetarian)) return buildVegetarianAnswer(language)
  if (pairingIntent && dish) return buildPairingAnswer(dish, language)
  if (containsAny(normalizedText, COCKTAIL_TRIGGERS)) return buildCocktailAnswerFromMenu(normalizedText, language)
  if (findWines(normalizedText).length || containsAny(normalizedText, ['vino', 'vinos', 'wine', 'wines', 'vin', 'vins', 'copa', 'glass', 'verre', 'calice', 'barolo', 'gavi', 'brunello', 'prosecco', 'franciacorta'])) return buildWineAnswerFromMenu(normalizedText, language)
  if (dish) {
    const answer = buildDishAnswer(dish, language)
    return containsAny(normalizedText, CATEGORY_TRIGGERS.allergens) && !getItemAllergens(dish).length
      ? answer + '\n' + text.warning
      : answer
  }
  if (dishes.length > 1) return buildClarification(dishes, language, item => localizeItem(item, language).displayName)

  if (containsAny(normalizedText, CATEGORY_TRIGGERS.allergens)) return `${text.warning}\n\n${text.noSure}`
  const category = getTriggeredCategory(normalizedText)
  if (category) return buildCategoryAnswer(category, language)

  if (hasFoodIntent(normalizedText)) return text.noSure

  return null
}
