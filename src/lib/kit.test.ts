import assert from 'node:assert/strict'
import test from 'node:test'
import {
  expandKitUnits, groupKitUnits, formatKitGroup,
  kitPerShift, defaultKitSelection, kitSelectionToNames, reconcileKitSelection,
} from './kit'

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

test('kitPerShift sums unit_price × qty', () => {
  assert.equal(kitPerShift([
    { name: 'Акк', qty: 2, unit_price: 30_000 },
    { name: 'SD', qty: 1, unit_price: 20_000 },
  ]), 80_000)
  assert.equal(kitPerShift([]), 0)
  assert.equal(kitPerShift(null), 0)
})

test('defaultKitSelection takes default_qty and drops zero-default', () => {
  const sel = defaultKitSelection([
    { name: 'Body', price: 0, default_qty: 1, max_qty: 1 },
    { name: 'Доп. аккумулятор', price: 30_000, default_qty: 0, max_qty: 2 },
  ])
  assert.deepEqual(sel, [{ name: 'Body', qty: 1, unit_price: 0 }])
})

test('reconcileKitSelection clamps qty to max_qty and takes catalog price', () => {
  const catalog = [{ name: 'Акк', price: 30_000, default_qty: 1, max_qty: 2 }]
  const out = reconcileKitSelection(
    [{ name: 'Акк', qty: 5, unit_price: 999 }, { name: 'Левый', qty: 1, unit_price: 1 }],
    catalog,
  )
  assert.deepEqual(out, [{ name: 'Акк', qty: 2, unit_price: 30_000 }])
})

test('kitSelectionToNames expands qty into numbered units', () => {
  assert.deepEqual(
    kitSelectionToNames([{ name: 'Акк', qty: 2, unit_price: 0 }, { name: 'SD', qty: 1, unit_price: 0 }]),
    ['Акк 1', 'Акк 2', 'SD'],
  )
})
