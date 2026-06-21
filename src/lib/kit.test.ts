import assert from 'node:assert/strict'
import test from 'node:test'
import { expandKitUnits, groupKitUnits, formatKitGroup } from './kit'

test('expandKitUnits: qty >= 2 produces numbered units', () => {
  assert.deepEqual(expandKitUnits('Батарея', 2), ['Батарея 1', 'Батарея 2'])
  assert.deepEqual(expandKitUnits('Батарея', 3), ['Батарея 1', 'Батарея 2', 'Батарея 3'])
})

test('expandKitUnits: qty <= 1 keeps a single plain name', () => {
  assert.deepEqual(expandKitUnits('KIT', 1), ['KIT'])
  assert.deepEqual(expandKitUnits('KIT', 0), ['KIT'])
  assert.deepEqual(expandKitUnits('KIT'), ['KIT'])
})

test('expandKitUnits: trims and rejects empty', () => {
  assert.deepEqual(expandKitUnits('  Кабель  ', 1), ['Кабель'])
  assert.deepEqual(expandKitUnits('   ', 3), [])
})

test('groupKitUnits: collapses numbered siblings, keeps order', () => {
  const groups = groupKitUnits(['Батарея 1', 'Батарея 2', 'KIT', 'V90'])
  assert.deepEqual(groups.map(g => [g.base, g.count]), [
    ['Батарея', 2],
    ['KIT', 1],
    ['V90', 1],
  ])
})

test('groupKitUnits: "V90" is not split (no space before digits)', () => {
  const groups = groupKitUnits(['V90'])
  assert.equal(groups[0].base, 'V90')
  assert.equal(groups[0].count, 1)
})

test('formatKitGroup: ×N for multiples, original name for singletons', () => {
  assert.equal(formatKitGroup({ base: 'Батарея', count: 2, units: ['Батарея 1', 'Батарея 2'] }), 'Батарея ×2')
  // легаси-метка "BAT 2" (число — часть названия) не должна превратиться в "BAT"
  assert.equal(formatKitGroup(groupKitUnits(['BAT 2'])[0]), 'BAT 2')
})
