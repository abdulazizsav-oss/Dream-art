import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCloseChecklist, canCloseEveryItem } from './order-close'

const items = [
  { id: 'camera-with-kit', selected_kit_items: ['Крышка', 'Бленда'] },
  { id: 'tripod-without-kit', selected_kit_items: [] },
  { id: 'light-without-kit', selected_kit_items: [] },
]

test('full-close checklist includes equipment with and without accessories', () => {
  const checklist = buildCloseChecklist(items, new Set(['camera-with-kit']))

  assert.deepEqual(
    checklist.map(row => row.item.id),
    ['camera-with-kit', 'tripod-without-kit', 'light-without-kit'],
  )
  assert.equal(canCloseEveryItem(checklist), false)
  assert.deepEqual(
    checklist.filter(row => !row.confirmed).map(row => row.item.id),
    ['tripod-without-kit', 'light-without-kit'],
  )
})

test('full order closes only after every equipment position is confirmed', () => {
  const checklist = buildCloseChecklist(
    items,
    new Set(['camera-with-kit', 'tripod-without-kit', 'light-without-kit']),
  )

  assert.equal(canCloseEveryItem(checklist), true)
})

