const fs = require('fs')
const path = require('path')

const MENU_DIR = path.join(__dirname, '..', 'data', 'menu')

const translations = {
  'Disponibile intero o mezzo.': 'Disponible entero o medio.',
  'Antipasto freddo premium, forte identità mediterranea.':
    'Entrante frío premium, con fuerte identidad mediterránea.',
  'Da verificare se il piatto finale sarà carpaccio, bresaola o doppia opzione.':
    'Por confirmar si el plato final será carpaccio, bresaola o doble opción.',
  'Classico italiano fresco con pomodoro, mozzarella e basilico o olio al basilico.':
    'Clásico italiano fresco con tomate, mozzarella y albahaca o aceite de albahaca.',

  'Antipasto caldo intenso e premium.':
    'Entrante caliente intenso y premium.',
  'Comfort food italiano rustico.':
    'Comfort food italiano de estilo rústico.',
  'Versione salata classica.':
    'Versión salada clásica.',
  'Versione più mediterranea e sapida.':
    'Versión más mediterránea y sabrosa.',
  'Contorno/antipasto vegetale versatile.':
    'Guarnición o entrante vegetal versátil.',
  'Preparazione tradizionale napoletana da verificare nella ricetta finale.':
    'Preparación tradicional napolitana, pendiente de confirmar en la receta final.',

  'Classico identitario italiano.':
    'Clásico italiano con mucha identidad.',
  'Piatto premium rustico.':
    'Plato rústico de carácter premium.',
  'Comfort food classico campano.':
    'Comfort food clásico de Campania.',
  'Piatto signature potenziale del locale.':
    'Posible plato signature de la casa.',
  'Minimalismo italiano puro.':
    'Minimalismo italiano en estado puro.',
  'Da verificare se pesto classico genovese o reinterpretazione.':
    'Por confirmar si será pesto genovés clásico o una reinterpretación.',
  'Classico romano con guanciale, pomodoro e pecorino.':
    'Clásico romano con guanciale, tomate y pecorino.',
  'Carbonara cremosa con paccheri, guanciale, uova, pecorino e pepe.':
    'Carbonara cremosa con paccheri, guanciale, huevos, pecorino y pimienta.',

  'Secondo/piatto sharing con forte identità regionale.':
    'Segundo o plato para compartir con fuerte identidad regional.',
  'Piatto estremamente identitario e tradizionale.':
    'Plato profundamente tradicional y con mucha identidad.',
  'Comfort food italiano classico.':
    'Comfort food italiano clásico.',
  'Piatto regionale tradizionale.':
    'Plato regional tradicional.',
  'Secondo rustico premium.':
    'Segundo rústico de carácter premium.',
  'Piatto tradizionale comfort food.':
    'Plato tradicional de comfort food.',

  'Patate novelle con buccia, ideali come contorno rustico.':
    'Patatas nuevas con piel, ideales como guarnición rústica.',
  'Contorno cremoso con nota amarognola.':
    'Guarnición cremosa con una nota ligeramente amarga.',
  'Contorno versatile stagionale.':
    'Guarnición versátil de temporada.',
  'Contorno fresco e leggero.':
    'Guarnición fresca y ligera.',

  'Insalata premium semplice e italiana.':
    'Ensalada premium, sencilla e italiana.',
  'Insalata classica fresca.':
    'Ensalada clásica y fresca.',

  'Tre cannoli con farciture diverse: ricotta classica, ricotta e amarena, ricotta e pistacchio.':
    'Tres cannoli con rellenos diferentes: ricotta clásica, ricotta y amarena, ricotta y pistacho.',
  'Savoiardi bagnati al limone con crema al mascarpone al limone.':
    'Savoiardi bañados en limón con crema de mascarpone al limón.',
  'Dolce tradizionale con ricotta e pere. Ricetta finale da verificare.':
    'Postre tradicional con ricotta y pera. Receta final pendiente de confirmar.',
  'Babà tradizionale con bagna al rum. Da verificare se servito semplice o con panna.':
    'Babà tradicional bañado al ron. Pendiente de confirmar si se servirá solo o con nata.'
}

const MENU_FILES = [
  'AntipastiFreddi.json',
  'AntipastiCaldi.json',
  'PrimiPiatti.json',
  'SecondiPiatti.json',
  'Contorni.json',
  'insalate.json',
  'Dolci.json'
]

let updatedCount = 0
let missingTranslations = []

for (const file of MENU_FILES) {
  const filePath = path.join(MENU_DIR, file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  const updatedData = data.map((item) => {
    if (!item.notes) return item

    const translatedNote = translations[item.notes]

    if (!translatedNote) {
      missingTranslations.push({
        file,
        id: item.id,
        note: item.notes
      })
      return item
    }

    updatedCount += 1

    return {
      ...item,
      notes: translatedNote
    }
  })

  fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2) + '\n', 'utf8')
  console.log(`Updated ${file}`)
}

console.log(`\nNotes updated: ${updatedCount}`)

if (missingTranslations.length > 0) {
  console.log('\nMissing translations:')
  missingTranslations.forEach((item) => {
    console.log(`${item.file} / ${item.id} -> ${item.note}`)
  })
} else {
  console.log('All notes translated successfully.')
}
