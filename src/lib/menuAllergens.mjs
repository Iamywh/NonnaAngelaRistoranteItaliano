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

export function getItemAllergens(item) {
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
