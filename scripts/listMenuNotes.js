const fs = require('fs')
const path = require('path')

const MENU_DIR = path.join(__dirname, '..', 'data', 'menu')

const MENU_FILES = [
  'AntipastiFreddi.json',
  'AntipastiCaldi.json',
  'PrimiPiatti.json',
  'SecondiPiatti.json',
  'Contorni.json',
  'insalate.json',
  'Dolci.json'
]

for (const file of MENU_FILES) {
  const filePath = path.join(MENU_DIR, file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  console.log(`\n=== ${file} ===`)

  data.forEach((item) => {
    if (item.notes) {
      console.log(`${item.id} -> ${item.notes}`)
    }
  })
}