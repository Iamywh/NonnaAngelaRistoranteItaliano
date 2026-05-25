const fs = require('fs')
const path = require('path')

const MENU_DIR = path.join(__dirname, '..', 'data', 'menu')

const publicEsById = {
  // ANTIPASTI FREDDI
  tagliere_affettati: {
    name_es: 'Tabla de embutidos',
    description_es:
      'Selección de bresaola, coppa, finocchiona, salame Napoli, mortadela con pistacho y speck.',
    ingredients_es: [
      'bresaola',
      'coppa',
      'finocchiona',
      'salame Napoli',
      'mortadela con pistacho',
      'speck'
    ],
    allergens_es: ['pistacho', 'frutos secos']
  },
  tagliere_formaggi: {
    name_es: 'Tabla de quesos',
    description_es:
      'Selección de fontina, taleggio, parmigiano, queso al tartufo y queso al Barolo.',
    ingredients_es: [
      'fontina',
      'taleggio',
      'parmigiano',
      'queso al tartufo',
      'queso al Barolo'
    ],
    allergens_es: ['leche']
  },
  alici_cantabrico_burrata_pomodoro_secco: {
    name_es: 'Anchoas del Cantábrico con burrata y tomate seco',
    description_es:
      'Anchoas del Cantábrico servidas con burrata cremosa y tomate seco.',
    ingredients_es: ['anchoas del Cantábrico', 'burrata', 'tomate seco'],
    allergens_es: ['pescado', 'leche']
  },
  carpaccio_bresaola_rucola_grana_balsamico: {
    name_es: 'Carpaccio / Bresaola',
    description_es:
      'Carpaccio o bresaola con rúcula, grana y vinagre balsámico.',
    ingredients_es: ['carpaccio o bresaola', 'rúcula', 'grana', 'vinagre balsámico'],
    allergens_es: ['leche', 'sulfitos']
  },
  caprese: {
    name_es: 'Caprese',
    description_es:
      'Tomate, mozzarella fiordilatte, albahaca y aceite de oliva virgen extra.',
    ingredients_es: ['tomate', 'mozzarella fiordilatte', 'albahaca', 'aceite de oliva virgen extra'],
    allergens_es: ['leche']
  },

  // ANTIPASTI CALDI
  crostone_taleggio_lardo_colonnata: {
    name_es: 'Crostone de taleggio y lardo de Colonnata',
    description_es: 'Pan tostado con taleggio fundido y lardo de Colonnata.',
    ingredients_es: ['pan tostado', 'taleggio', 'lardo de Colonnata'],
    allergens_es: ['gluten', 'leche']
  },
  crostone_stracchino_salsiccia: {
    name_es: 'Crostone de stracchino y salchicha',
    description_es: 'Pan tostado con stracchino cremoso y salchicha.',
    ingredients_es: ['pan tostado', 'stracchino', 'salchicha'],
    allergens_es: ['gluten', 'leche']
  },
  mozzarella_carrozza_salame: {
    name_es: 'Mozzarella in carrozza con salame',
    description_es: 'Mozzarella empanada y frita con salame.',
    ingredients_es: ['mozzarella', 'pan rallado', 'salame'],
    allergens_es: ['gluten', 'leche', 'huevo']
  },
  mozzarella_carrozza_alici: {
    name_es: 'Mozzarella in carrozza con anchoas',
    description_es: 'Mozzarella empanada y frita con anchoas.',
    ingredients_es: ['mozzarella', 'pan rallado', 'anchoas'],
    allergens_es: ['gluten', 'leche', 'huevo', 'pescado']
  },
  verdure_grigliate_stagione: {
    name_es: 'Verduras de temporada a la parrilla',
    description_es:
      'Verduras de temporada a la parrilla con aceite de oliva virgen extra.',
    ingredients_es: ['verduras de temporada', 'aceite de oliva virgen extra'],
    allergens_es: []
  },
  melanzana_funghetto: {
    name_es: 'Berenjena a funghetto',
    description_es:
      'Berenjena con tomate, ajo, albahaca y aceite de oliva virgen extra.',
    ingredients_es: ['berenjena', 'tomate', 'ajo', 'albahaca', 'aceite de oliva virgen extra'],
    allergens_es: []
  },

  // PRIMI
  lasagna_bolognese: {
    name_es: 'Tagliatelle al ragú boloñés',
    description_es: 'Tagliatelle con ragú boloñés y parmigiano.',
    ingredients_es: ['tagliatelle', 'ragú boloñés', 'parmigiano'],
    allergens_es: ['gluten', 'leche', 'huevo', 'apio']
  },
  pappardelle_cinghiale: {
    name_es: 'Pappardelle con salsa de jabalí',
    description_es:
      'Pappardelle con ragú de jabalí, tomate, vino tinto y parmigiano.',
    ingredients_es: ['pappardelle', 'ragú de jabalí', 'tomate', 'vino tinto', 'parmigiano'],
    allergens_es: ['gluten', 'leche', 'huevo', 'apio', 'sulfitos']
  },
  gnocchi_sorrentina: {
    name_es: 'Gnocchi alla sorrentina',
    description_es:
      'Gnocchi con tomate, fiordilatte, parmigiano y albahaca.',
    ingredients_es: ['gnocchi', 'tomate', 'fiordilatte', 'parmigiano', 'albahaca'],
    allergens_es: ['gluten', 'leche']
  },
  paccheri_ragu_napoletano: {
    name_es: 'Paccheri al ragú napolitano',
    description_es: 'Paccheri con ragú napolitano y parmigiano.',
    ingredients_es: ['paccheri', 'ragú napolitano', 'parmigiano'],
    allergens_es: ['gluten', 'leche', 'apio']
  },
  paccheri_carbonara: {
    name_es: 'Paccheri alla carbonara',
    description_es:
      'Paccheri con guanciale, pecorino romano, huevo y pimienta negra.',
    ingredients_es: ['paccheri', 'guanciale', 'pecorino romano', 'huevo', 'pimienta negra'],
    allergens_es: ['gluten', 'leche', 'huevo']
  },
  rigatoni_amatriciana: {
    name_es: 'Rigatoni all’amatriciana',
    description_es:
      'Rigatoni con tomate, guanciale, pecorino romano y un toque de pimienta.',
    ingredients_es: ['rigatoni', 'tomate', 'guanciale', 'pecorino romano', 'pimienta'],
    allergens_es: ['gluten', 'leche']
  },
  cacio_pepe_chitarra: {
    name_es: 'Cacio e pepe alla chitarra',
    description_es:
      'Spaghetti alla chitarra con pecorino romano y pimienta negra.',
    ingredients_es: ['spaghetti alla chitarra', 'pecorino romano', 'pimienta negra'],
    allergens_es: ['gluten', 'leche', 'huevo']
  },
  rigatoni_pesto: {
    name_es: 'Rigatoni al pesto',
    description_es: 'Rigatoni con pesto y parmigiano.',
    ingredients_es: ['rigatoni', 'pesto', 'parmigiano'],
    allergens_es: ['gluten', 'leche', 'frutos secos']
  },

  // SECONDI
  arrosticini_abruzzesi: {
    name_es: 'Arrosticini abruzzesi',
    description_es: 'Brochetas tradicionales de cordero servidas con pimiento asado.',
    ingredients_es: ['cordero', 'pimiento asado'],
    allergens_es: []
  },
  misto_carne_ragu_napoletano: {
    name_es: 'Mixto de carne al ragú napolitano',
    description_es:
      'Braciola, salchicha, costilla de cerdo, costilla de res, carne de ternera y piel de cerdo cocinadas en ragú napolitano.',
    ingredients_es: [
      'braciola',
      'salchicha',
      'costilla de cerdo',
      'costilla de res',
      'carne de ternera',
      'piel de cerdo',
      'ragú napolitano'
    ],
    allergens_es: ['apio', 'sulfitos']
  },
  polpette_ragu: {
    name_es: 'Albóndigas al ragú',
    description_es: 'Albóndigas de carne servidas con ragú napolitano.',
    ingredients_es: ['albóndigas de carne', 'ragú napolitano'],
    allergens_es: ['gluten', 'leche', 'huevo', 'apio']
  },
  peperone_mbuttunato: {
    name_es: 'Pimiento mbuttunato',
    description_es: 'Pimiento relleno según tradición.',
    ingredients_es: ['pimiento relleno'],
    allergens_es: []
  },
  porchetta_pure_patate_arrosto: {
    name_es: 'Porchetta con puré de patata asada',
    description_es: 'Porchetta servida con puré de patata asada.',
    ingredients_es: ['porchetta', 'puré de patata asada'],
    allergens_es: ['leche']
  },
  fagioli_cotiche: {
    name_es: 'Fagioli con cotiche',
    description_es: 'Alubias con piel de cerdo según tradición italiana.',
    ingredients_es: ['alubias', 'piel de cerdo'],
    allergens_es: []
  },

  // CONTORNI
  patate_novelle_buccia: {
    name_es: 'Patata novela con piel',
    description_es: 'Patata de la casa.',
    ingredients_es: ['patata'],
    allergens_es: []
  },
  pure_patata_arrosto_radicchio: {
    name_es: 'Puré de patata asada y radicchio',
    description_es: 'Puré de patata asada con radicchio.',
    ingredients_es: ['patata asada', 'radicchio'],
    allergens_es: ['leche']
  },
  misto_verdure_griglia: {
    name_es: 'Verduras mixtas a la parrilla',
    description_es: 'Selección de verduras a la parrilla.',
    ingredients_es: ['verduras mixtas'],
    allergens_es: []
  },
  pinzimonio: {
    name_es: 'Pinzimonio',
    description_es: 'Verduras crudas con aceite de oliva virgen extra y sal.',
    ingredients_es: ['verduras crudas', 'aceite de oliva virgen extra', 'sal'],
    allergens_es: []
  },

  // INSALATE
  insalata_rucola_grana_pachino: {
    name_es: 'Ensalada de rúcula, grana y tomate cherry',
    description_es: 'Rúcula, grana, tomate cherry y vinagreta balsámica.',
    ingredients_es: ['rúcula', 'grana', 'tomate cherry', 'vinagreta balsámica'],
    allergens_es: ['leche', 'sulfitos']
  },
  insalata_mista_classica: {
    name_es: 'Ensalada mixta',
    description_es: 'Lechuga mixta, tomate cherry, cebolla, zanahoria y maíz.',
    ingredients_es: ['lechuga mixta', 'tomate cherry', 'cebolla', 'zanahoria', 'maíz'],
    allergens_es: []
  },

  // DOLCI
  tris_cannoli_siciliani: {
    name_es: 'Tris de cannoli sicilianos',
    description_es:
      'Tres cannoli con rellenos diferentes: ricotta clásica, ricotta y amarena, ricotta y pistacho.',
    ingredients_es: ['cannoli', 'ricotta', 'amarena', 'pistacho'],
    allergens_es: ['gluten', 'leche', 'frutos secos']
  },
  tiramisu_limone: {
    name_es: 'Tiramisú de limón',
    description_es:
      'Savoiardi bañados en limón con crema de mascarpone al limón.',
    ingredients_es: ['savoiardi', 'limón', 'mascarpone'],
    allergens_es: ['gluten', 'leche', 'huevo']
  },
  pere_ricotta: {
    name_es: 'Pera y ricotta',
    description_es: 'Postre tradicional con ricotta y pera.',
    ingredients_es: ['ricotta', 'pera'],
    allergens_es: ['leche']
  },
  baba_napoletano: {
    name_es: 'Babà napolitano',
    description_es: 'Babà tradicional bañado al ron.',
    ingredients_es: ['babà', 'ron'],
    allergens_es: ['gluten', 'huevo', 'sulfitos']
  }
}

const files = [
  'AntipastiFreddi.json',
  'AntipastiCaldi.json',
  'PrimiPiatti.json',
  'SecondiPiatti.json',
  'Contorni.json',
  'insalate.json',
  'Dolci.json'
]

let updated = 0
const missing = []

for (const file of files) {
  const filePath = path.join(MENU_DIR, file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  const nextData = data.map((item) => {
    const publicFields = publicEsById[item.id]

    if (!publicFields) {
      missing.push(`${file} / ${item.id}`)
      return item
    }

    updated += 1

    return {
      ...item,
      ...publicFields
    }
  })

  fs.writeFileSync(filePath, JSON.stringify(nextData, null, 2) + '\n', 'utf8')
  console.log(`Updated ${file}`)
}

console.log(`\nItems updated: ${updated}`)

if (missing.length) {
  console.log('\nMissing IDs:')
  missing.forEach((item) => console.log(item))
} else {
  console.log('All public Spanish fields added.')
}