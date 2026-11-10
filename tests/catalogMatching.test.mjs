import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findCatalogMatches } from '../src/lib/catalogMatching.mjs'

const load = name => JSON.parse(readFileSync(new URL('../data/menu/' + name + '.json', import.meta.url), 'utf8'))
const dishes = [...load('PrimiPiatti'), ...load('EspecialidadesSemana')]
const names = item => [item.id, item.name_it, item.name_es, item.name_en, item.name_fr]

test('Carbonara and amatriciana resolve to their own dishes', () => {
  assert.equal(findCatalogMatches('¿Qué lleva la carbonara?', dishes, names)[0].id, 'paccheri_carbonara')
  assert.equal(findCatalogMatches('Che ingredienti ha la amatriciana?', dishes, names)[0].id, 'paccheri_amatriciana')
})

test('A generic pasta question does not select a dish by its first shared word', () => {
  assert.deepEqual(findCatalogMatches('¿Qué lleva la pasta?', dishes, names), [])
  const pesto = findCatalogMatches('¿Qué lleva el pesto?', dishes, names)
  assert.equal(pesto.length, 2)
  assert.equal(findCatalogMatches('gnocchi pesto gambas', dishes, names)[0].id, 'gnocchi_pesto_gambas_tomate_pistacho')
})

test('An ambiguous wine producer returns both wines for clarification', () => {
  const wines = load('vini').wines
  assert.equal(findCatalogMatches('Fontanafredda', wines, wine => [wine.name, wine.producer]).length, 2)
  assert.equal(findCatalogMatches('Gavi', wines, wine => [wine.name, wine.producer])[0].name, 'Fontanafredda Gavi di Gavi')
})
