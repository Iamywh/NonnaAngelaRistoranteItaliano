import antipastiFreddi from '../../data/menu/AntipastiFreddi.json'
import antipastiCaldi from '../../data/menu/AntipastiCaldi.json'
import primiPiatti from '../../data/menu/PrimiPiatti.json'
import secondiPiatti from '../../data/menu/SecondiPiatti.json'
import especialidadesSemana from '../../data/menu/EspecialidadesSemana.json'
import contorni from '../../data/menu/Contorni.json'
import insalate from '../../data/menu/insalate.json'
import dolci from '../../data/menu/Dolci.json'

export const foodMenu = [
  ...especialidadesSemana, ...antipastiFreddi, ...antipastiCaldi,
  ...primiPiatti, ...secondiPiatti, ...contorni, ...insalate, ...dolci
]
